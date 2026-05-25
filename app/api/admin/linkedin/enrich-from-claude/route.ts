import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 300;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

const client = new Anthropic();

// ============================================================================
// POST /api/admin/linkedin/enrich-from-claude
//
// Bulk-classifies sector-less scouted_companies using Claude's training
// knowledge of well-known dev-finance organisations. No web search — Claude
// already knows that Winrock = agri_food/human_rights, Iberdrola =
// renewable_energy, FHI 360 = human_rights/health, Tetra Tech ARD = consulting,
// World Bank = multi-sector, etc.
//
// Sends company names in batches of ~150 per call to Sonnet 4.6 with the
// system block (sector list + instructions) cached, returning a structured
// tool-use response per batch. Updates sectors[] and country on each row.
//
// Cost: ~$0.30-0.60 for ~1,000 companies, total. Idempotent: only processes
// companies where sectors[] is empty AND discovered_via='linkedin_import'.
// Re-running with an unchanged corpus is a no-op (after the first pass).
// ============================================================================

const SECTOR_SLUGS = [
  'agri_food',
  'renewable_energy',
  'water_tech',
  'circular_esg',
  'critical_minerals',
  'human_rights',
];

const SYSTEM_PROMPT = `You are classifying companies for an EU/post-USAID development-finance BD pipeline. For each company name, return:
  - sectors: which of these the company is meaningfully active in (subset of: agri_food, renewable_energy, water_tech, circular_esg, critical_minerals, human_rights). Return empty array if none apply or if you don't recognise the company.
  - country: ISO 3166-1 alpha-2 country code where the company is primarily headquartered (e.g. US, ES, GB, NL). Return null if unknown.
  - size_band: rough size (micro <10 staff, small 10-50, medium 50-250, large 250+). Return null if unknown.

Be conservative. If you genuinely don't recognise a name (small consultancies, freelancers, regional firms) leave sectors empty and country/size null — DON'T guess. Only tag a sector when you're confident the company has substantial activity in it.

For multilateral development banks (World Bank, IDB, AfDB, ADB, EBRD, EIB), tag all sectors they substantially fund: usually agri_food, renewable_energy, water_tech, and human_rights at minimum.

For development implementers (Winrock, Tetra Tech ARD, DAI, Chemonics, RTI, FHI 360, Save the Children, IRC, Oxfam), tag the sectors they are KNOWN for, not every possible one.

Sector definitions:
  - agri_food: agriculture, agribusiness, food security, rural livelihoods, smallholder programs
  - renewable_energy: solar, wind, hydro, geothermal, energy access, clean energy transition
  - water_tech: WASH, water resources, irrigation, sanitation, water treatment
  - circular_esg: circular economy, recycling, ESG/sustainability advisory, climate finance
  - critical_minerals: mining, rare earths, lithium/cobalt, strategic raw materials
  - human_rights: civil society, gender, democracy, rule of law, human rights due diligence, migration, protection

Output: emit one classify_batch tool call per response. Don't add prose.`;

const classifyTool: Anthropic.Tool = {
  name: 'classify_batch',
  description: 'Classify a batch of companies by sector / country / size_band.',
  input_schema: {
    type: 'object',
    required: ['classifications'],
    properties: {
      classifications: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'sectors', 'country', 'size_band'],
          properties: {
            name: { type: 'string', description: 'The company name exactly as provided.' },
            sectors: {
              type: 'array',
              items: { type: 'string', enum: SECTOR_SLUGS },
              description: 'Empty array if unknown or none of the listed sectors apply.',
            },
            country: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2 or null.' },
            size_band: { type: ['string', 'null'], enum: [...['micro', 'small', 'medium', 'large'], null] },
          },
        },
      },
    },
  },
};

interface Classification {
  name: string;
  sectors: string[];
  country: string | null;
  size_band: string | null;
}

interface ScoutedRow {
  id: string;
  name: string;
  sectors: string[] | null;
  country: string | null;
  size_band: string | null;
}

const BATCH_SIZE = 150; // names per Claude call

export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createServerClient();

  // ---- Load auto-promoted scouted_companies with empty sectors[] ----
  const PAGE = 1000;
  const all: ScoutedRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('scouted_companies')
      .select('id, name, sectors, country, size_band')
      .eq('discovered_via', 'linkedin_import')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: `load scouted page ${offset}: ${error.message}` }, { status: 500 });
    }
    const page = (data || []) as ScoutedRow[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  // Only the rows where the matcher would have no sector signal
  const candidates = all.filter((r) => !r.sectors || r.sectors.length === 0);
  if (candidates.length === 0) {
    return NextResponse.json({ message: 'nothing to enrich', total: all.length, candidates: 0 });
  }

  // ---- Send to Claude — all batches in parallel ----
  // Sequential at ~40-60s per batch × 7 batches blew past the 300s function
  // limit. Parallel is fine — Anthropic accepts the concurrency, and we
  // sidestep the cache-creation step on later batches (since they fire
  // before batch 0 has populated the cache, but the system block isn't large
  // enough for that to matter cost-wise here).
  const batches: ScoutedRow[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE));
  }

  const errors: string[] = [];
  let classifiedTotal = 0;
  let updatedSectors = 0;
  let updatedCountry = 0;
  let updatedSize = 0;
  let totalInputTokens = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;
  let totalOutputTokens = 0;

  const results = await Promise.allSettled(
    batches.map(async (batch, batchIdx) => {
      const userMessage = `Classify these ${batch.length} companies:\n\n${batch.map((c, idx) => `${idx + 1}. ${c.name}`).join('\n')}`;
      const resp = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [classifyTool],
        tool_choice: { type: 'tool', name: 'classify_batch' },
        messages: [{ role: 'user', content: userMessage }],
      });
      return { batchIdx, batch, resp };
    }),
  );

  // Aggregate token usage and apply updates per batch
  for (const result of results) {
    if (result.status === 'rejected') {
      errors.push(`batch failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      continue;
    }
    const { batchIdx, batch, resp } = result.value;

    totalInputTokens += resp.usage.input_tokens;
    totalCacheRead += resp.usage.cache_read_input_tokens ?? 0;
    totalCacheCreate += resp.usage.cache_creation_input_tokens ?? 0;
    totalOutputTokens += resp.usage.output_tokens;

    const toolBlock = resp.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      errors.push(`batch ${batchIdx}: no tool_use block returned`);
      continue;
    }
    const input = toolBlock.input as { classifications?: Classification[] };
    const classifications = input.classifications || [];
    classifiedTotal += classifications.length;

    const byName = new Map<string, Classification>();
    for (const c of classifications) {
      if (c && typeof c.name === 'string') byName.set(c.name.trim(), c);
    }

    // Apply updates — parallel across rows in this batch with bounded concurrency
    const updateTasks = batch.map((row) => async () => {
      const cls = byName.get(row.name.trim());
      if (!cls) return;
      const update: Partial<ScoutedRow> & { updated_at?: string } = { updated_at: new Date().toISOString() };
      let changed = false;
      if (cls.sectors && cls.sectors.length > 0) {
        update.sectors = cls.sectors;
        changed = true;
      }
      if (cls.country && !row.country) {
        update.country = cls.country;
        changed = true;
      }
      if (cls.size_band && !row.size_band) {
        update.size_band = cls.size_band;
        changed = true;
      }
      if (!changed) return;

      const { error: upErr } = await supabase
        .from('scouted_companies')
        .update(update)
        .eq('id', row.id);
      if (upErr) {
        errors.push(`update ${row.name}: ${upErr.message}`);
      } else {
        if (update.sectors) updatedSectors += 1;
        if (update.country) updatedCountry += 1;
        if (update.size_band) updatedSize += 1;
      }
    });

    // Run row updates with concurrency cap of 10
    const queue = [...updateTasks];
    let active = 0;
    await new Promise<void>((resolve) => {
      const next = () => {
        while (active < 10 && queue.length > 0) {
          const task = queue.shift()!;
          active += 1;
          task().finally(() => {
            active -= 1;
            if (queue.length > 0) next();
            else if (active === 0) resolve();
          });
        }
      };
      next();
    });
  }

  // Rough cost estimate: Sonnet 4.6 pricing $3 / $15 per Mtok in/out,
  // $0.30 cached. Don't pretend it's exact — this is a sanity check.
  const estCostUsd =
    (totalInputTokens - totalCacheRead) * 3 / 1_000_000 +
    totalCacheRead * 0.3 / 1_000_000 +
    totalCacheCreate * 3.75 / 1_000_000 +
    totalOutputTokens * 15 / 1_000_000;

  return NextResponse.json({
    total_scouted: all.length,
    candidates_processed: candidates.length,
    classified: classifiedTotal,
    updated_sectors: updatedSectors,
    updated_country: updatedCountry,
    updated_size_band: updatedSize,
    tokens: {
      input: totalInputTokens,
      cache_read: totalCacheRead,
      cache_create: totalCacheCreate,
      output: totalOutputTokens,
    },
    est_cost_usd: Math.round(estCostUsd * 1000) / 1000,
    errors,
  });
}
