import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';
import { cooperatrProfileBlock } from '@/app/lib/cooperatrProfile';

// ============================================================================
// Inverted discovery — find FUNDING SOURCES, not companies.
// ============================================================================
// The funding_sources registry covers non-notice funding (standing funds,
// foundations, impact capital, EU facilities) that scrapers can't see. This
// engine grows it: web-search Claude researches funders relevant to Cooperatr's
// sectors/geographies, verifies them, and upserts them flagged "needs review".
// Same web-search + confidence + evidence pattern as company Discovery v2.
// ============================================================================

const client = new Anthropic({ maxRetries: 4 });
type Supabase = ReturnType<typeof createServerClient>;

const FUNDING_TYPES = ['standing_fund', 'financial_instrument', 'blended_facility', 'dfi_window', 'impact_fund', 'foundation', 'initiative'] as const;

export interface DiscoveredFunder {
  name: string;
  type: string | null;
  funder: string | null;
  themes: string[];
  geographies: string[];
  instrument: string | null;     // grant | guarantee | equity | debt | TA | blended
  access_mode: string | null;    // rolling_loi | invitation | open_window | intermediary_only | periodic_call
  cadence: string | null;
  eligibility_notes: string | null;
  url: string | null;
  confidence?: number;
  evidence_url?: string | null;
}

export interface FunderDiscoveryResult {
  funders: DiscoveredFunder[];
  inserted: number;
  matched: number;
  tokens: { input: number; output: number };
}

const SYSTEM = `You are a development-finance funding-landscape researcher for Cooperatr. Find FUNDING SOURCES (the money side), not companies.

${cooperatrProfileBlock()}

Find ongoing, NON-tender funding vehicles that a Spanish/EU SME or NGO could realistically access — the kind that DON'T publish dated calls and so never show up in a tender scraper:
- Standing funds & financial instruments (EU EFSD+, InvestEU windows, EIB Global facilities, Global Gateway mechanisms)
- DFIs and their private-sector windows (DFC, BII/CDC, FMO, Proparco, COFIDES, AECID FONPRODE)
- Blended-finance facilities and guarantee programmes
- Foundations that fund development/impact work (Gates, Hewlett, Ford, IKEA Foundation, Open Society, "la Caixa" Foundation, etc.)
- Impact investors / funds active in Cooperatr's sectors and geographies

EXCLUDE: one-off dated tenders/calls (those belong in the tender scanner), pure commercial banks, and vehicles with no development/impact mandate.

USE WEB SEARCH to find and VERIFY each source — confirm it exists, is currently active, and its access model. Ground each in a real source URL (the funder's own page). Do not invent funds.

For each, return: name, type (one of: ${FUNDING_TYPES.join(', ')}), funder (parent body), themes (our sector slugs: agri_food, renewable_energy, water_tech, circular_esg, critical_minerals, human_rights, capacity_building), geographies, instrument (grant|guarantee|equity|debt|TA|blended), access_mode (rolling_loi|invitation|open_window|intermediary_only|periodic_call), cadence, eligibility_notes (how an SME engages), url, confidence (0-1), evidence_url.

Prefer 5-10 genuinely-relevant, web-verified sources over a long speculative list. After researching, you MUST call emit_funding_sources. No prose preamble.`;

const emitTool: Anthropic.Tool = {
  name: 'emit_funding_sources',
  description: 'Emit the verified funding sources.',
  input_schema: {
    type: 'object',
    required: ['funders'],
    properties: {
      funders: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'type'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: [...FUNDING_TYPES] },
            funder: { type: ['string', 'null'] },
            themes: { type: 'array', items: { type: 'string' } },
            geographies: { type: 'array', items: { type: 'string' } },
            instrument: { type: ['string', 'null'] },
            access_mode: { type: ['string', 'null'] },
            cadence: { type: ['string', 'null'] },
            eligibility_notes: { type: ['string', 'null'] },
            url: { type: ['string', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidence_url: { type: ['string', 'null'] },
          },
        },
      },
    },
  },
};

export async function discoverFundingSources(
  supabase: Supabase,
  opts?: { focus?: string; dryRun?: boolean },
): Promise<FunderDiscoveryResult> {
  // Tell the model what's already in the registry so it finds NEW sources.
  const { data: existing } = await supabase.from('funding_sources').select('name');
  const existingNames = (existing || []).map((r) => (r as { name: string }).name);

  const userPrompt = `Find funding sources for Cooperatr's SMEs.${opts?.focus ? `\n\nFocus: ${opts.focus}` : ''}

Already in our registry (find DIFFERENT ones — do not repeat these):
${existingNames.length ? existingNames.map((n) => `- ${n}`).join('\n') : '(none yet)'}

Research the web and return verified, currently-active funding sources via emit_funding_sources.`;

  const system = [{ type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } }];
  const webSearchTool = { type: 'web_search_20250305', name: 'web_search', max_uses: 6 } as unknown as Anthropic.Tool;

  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system,
    tools: [webSearchTool, emitTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  let emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_funding_sources');

  if (!emitBlock || emitBlock.type !== 'tool_use') {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system,
      tools: [emitTool],
      tool_choice: { type: 'tool', name: 'emit_funding_sources' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_funding_sources');
  }

  const tokens = { input: response.usage.input_tokens, output: response.usage.output_tokens };
  if (!emitBlock || emitBlock.type !== 'tool_use') {
    return { funders: [], inserted: 0, matched: 0, tokens };
  }

  const funders = ((emitBlock.input as { funders?: DiscoveredFunder[] }).funders || [])
    .filter((f) => f && f.name && f.name.trim())
    .filter((f) => (f.confidence ?? 1) >= 0.5);

  if (opts?.dryRun) return { funders, inserted: 0, matched: 0, tokens };

  // Upsert into the registry, deduped by name, flagged needs-review (last_reviewed_at null).
  let inserted = 0, matched = 0;
  const existingLower = new Set(existingNames.map((n) => n.toLowerCase().trim()));
  for (const f of funders) {
    if (existingLower.has(f.name.toLowerCase().trim())) { matched += 1; continue; }
    const notes = [f.eligibility_notes, f.evidence_url ? `Source: ${f.evidence_url}` : null, typeof f.confidence === 'number' ? `Confidence: ${f.confidence.toFixed(2)}` : null]
      .filter(Boolean).join(' · ');
    const { error } = await supabase.from('funding_sources').insert({
      name: f.name.trim(),
      type: FUNDING_TYPES.includes(f.type as typeof FUNDING_TYPES[number]) ? f.type : null,
      funder: f.funder,
      themes: f.themes || [],
      geographies: f.geographies || [],
      instrument: f.instrument,
      access_mode: f.access_mode,
      status: 'active',
      cadence: f.cadence,
      eligibility_notes: notes || null,
      url: f.url,
      source_provenance: 'AI web research',
      last_reviewed_at: null,
    });
    if (!error) inserted += 1;
    else matched += 1; // unique-name conflict counts as already-present
  }

  return { funders, inserted, matched, tokens };
}
