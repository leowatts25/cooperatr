import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

export const maxDuration = 60;

// ============================================================================
// SYSTEM PROMPTS — Discovery Engine (one per tag, run in parallel)
// ============================================================================

const BASE_PROMPT = `You are Cooperatr's Discovery Engine — a senior EU/multilateral development finance strategist. Uncover non-obvious paths to revenue, capital, and impact for European SMEs.

Known instruments: NDICI-Global Europe, Global Gateway, Team Europe, AECID, COFIDES, ICEX Vives, FEDES, GIZ, AFD, FCDO, SIDA, World Bank, IDB, IFC, EIB, EBRD, Proparco, FMO, Green Climate Fund. Impact investors: Acumen, LeapFrog, Bamboo, Triodos, responsAbility.

Rules:
- Do NOT invent call IDs/deadlines. Use "Q3 2026 typical cycle" or "rolling".
- Prioritize Spanish instruments for Andalusian companies.
- If prior_eu_experience=false, offer an entry-level path.

Output exactly ONE idea via emit_ideas. The idea MUST include:
- funding_paths: 2-3 items, each {name, type, amount_range, timeline, how_to_access, fit_rationale}
- partners: 2-3 items, each {name, type, country, why, verified}
- next_steps: 3-4 items, each {step, owner, timeline}
- buyers/investors: include only if revenue/equity path is relevant, each with {name, why, verified}

BE TERSE. Short phrases, not sentences. Title 6-12 words. Summary 1-2 short sentences. Each sub-field under 15 words.`;

// Each batch produces ONE idea in ~15-25s. We run 10 of them in parallel to
// hit 10 ideas under the 60s function budget. Different angles per batch keep
// variety across the concrete/creative/hybrid mix and avoid empty tool_use
// from max_tokens truncation.
type BatchKey =
  | 'concrete_funding_a'
  | 'concrete_funding_b'
  | 'concrete_buyer_a'
  | 'concrete_buyer_b'
  | 'creative_consortium'
  | 'creative_capital'
  | 'creative_diaspora'
  | 'hybrid_blended'
  | 'hybrid_consortium'
  | 'hybrid_offtake';

const BATCH_INSTRUCTIONS: Record<BatchKey, { tag: 'concrete' | 'creative' | 'hybrid'; instructions: string }> = {
  concrete_funding_a: {
    tag: 'concrete',
    instructions: `Generate ONE CONCRETE idea (confidence 75-95) anchored on a Spanish or EU funding instrument (AECID, COFIDES, ICEX Vives, NDICI, Global Gateway). Actionable within 90 days.`,
  },
  concrete_funding_b: {
    tag: 'concrete',
    instructions: `Generate ONE CONCRETE idea (confidence 75-95) anchored on a multilateral DFI facility (EIB, EBRD, IFC, Proparco, FMO, AfDB). Specific program, realistic ticket size.`,
  },
  concrete_buyer_a: {
    tag: 'concrete',
    instructions: `Generate ONE CONCRETE idea (confidence 75-95) anchored on multilateral procurement (WFP, UNICEF, UNOPS, UNDP). Name the buyer, deal shape, and entry path.`,
  },
  concrete_buyer_b: {
    tag: 'concrete',
    instructions: `Generate ONE CONCRETE idea (confidence 75-95) anchored on a named corporate off-taker or public tender in the target geography. Realistic revenue path.`,
  },
  creative_consortium: {
    tag: 'creative',
    instructions: `Generate ONE CREATIVE idea (confidence 55-75) built around an UNCONVENTIONAL CONSORTIUM — a non-obvious co-applicant or cross-sector partnership that unlocks an instrument the company couldn't access alone.`,
  },
  creative_capital: {
    tag: 'creative',
    instructions: `Generate ONE CREATIVE idea (confidence 55-75) built around NON-OBVIOUS CAPITAL — catalytic philanthropic capital, impact-linked debt, revenue-based financing, or a named family office/impact VC.`,
  },
  creative_diaspora: {
    tag: 'creative',
    instructions: `Generate ONE CREATIVE idea (confidence 55-75) that taps DIASPORA, ALUMNI, or CULTURAL networks — diaspora bonds, remittance-linked products, alumni-led consortia, or trade-attaché pipelines in the target geography.`,
  },
  hybrid_blended: {
    tag: 'hybrid',
    instructions: `Generate ONE HYBRID idea (confidence 60-80) that pairs a concrete EU/DFI instrument with a creative blended-finance twist — e.g., AECID grant layered with a named impact investor's equity.`,
  },
  hybrid_consortium: {
    tag: 'hybrid',
    instructions: `Generate ONE HYBRID idea (confidence 60-80) that pairs a concrete Global Gateway or Team Europe pipeline with an unconventional consortium composition.`,
  },
  hybrid_offtake: {
    tag: 'hybrid',
    instructions: `Generate ONE HYBRID idea (confidence 60-80) that pairs a concrete corporate off-take with grant-funded technical assistance or pilot capital from a named donor.`,
  },
};

// ============================================================================
// Types
// ============================================================================

type IdeaFromModel = {
  title: string;
  summary: string;
  tag: 'concrete' | 'creative' | 'hybrid';
  confidence: number;
  confidence_rationale?: string;
  estimated_value_min?: number;
  estimated_value_max?: number;
  currency?: string;
  estimated_timeline_months?: number;
  funding_paths?: unknown[];
  partners?: unknown[];
  buyers?: unknown[];
  investors?: unknown[];
  next_steps?: unknown[];
  regulatory_requirements?: string[];
  risks?: string[];
  data_provenance?: unknown[];
  missing_data?: string[];
  proposal_ready?: boolean;
  dbId?: string;
};

// ============================================================================
// Tool schema — tight, with required sub-fields so Haiku stops drifting
// ============================================================================

const ideasTool: Anthropic.Tool = {
  name: 'emit_ideas',
  description: 'Emit the ranked ideas as structured data.',
  input_schema: {
    type: 'object',
    properties: {
      ideas: {
        type: 'array',
        description: 'Exactly ONE idea.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            tag: { type: 'string', enum: ['concrete', 'creative', 'hybrid'] },
            confidence: { type: 'number' },
            confidence_rationale: { type: 'string' },
            estimated_value_min: { type: 'number' },
            estimated_value_max: { type: 'number' },
            currency: { type: 'string' },
            estimated_timeline_months: { type: 'number' },
            funding_paths: { type: 'array', items: { type: 'object' } },
            partners: { type: 'array', items: { type: 'object' } },
            buyers: { type: 'array', items: { type: 'object' } },
            investors: { type: 'array', items: { type: 'object' } },
            next_steps: { type: 'array', items: { type: 'object' } },
            regulatory_requirements: { type: 'array', items: { type: 'string' } },
            risks: { type: 'array', items: { type: 'string' } },
            missing_data: { type: 'array', items: { type: 'string' } },
            proposal_ready: { type: 'boolean' },
          },
          required: ['title', 'summary', 'tag', 'confidence'],
        },
      },
    },
    required: ['ideas'],
  },
};

// ============================================================================
// Generate a batch of ideas for one tag (concrete/creative/hybrid)
// ============================================================================

async function callHaiku(batch: BatchKey, system: string, userPrompt: string) {
  return client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system,
    tools: [ideasTool],
    tool_choice: { type: 'tool', name: 'emit_ideas' },
    messages: [{ role: 'user', content: userPrompt }],
  });
}

async function generateBatch(batch: BatchKey, userPrompt: string): Promise<IdeaFromModel[]> {
  const { tag, instructions } = BATCH_INSTRUCTIONS[batch];
  const system = `${BASE_PROMPT}\n\n## This batch: ${instructions}`;

  const t0 = Date.now();
  console.log(`[discovery:${batch}] calling Anthropic...`);

  let response;
  try {
    response = await callHaiku(batch, system, userPrompt);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Retry once on rate limit with a short delay
    if (msg.includes('429') || msg.includes('rate_limit')) {
      console.warn(`[discovery:${batch}] 429, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
      try {
        response = await callHaiku(batch, system, userPrompt);
      } catch (err2) {
        console.error(`[discovery:${batch}] retry failed:`, err2 instanceof Error ? err2.message : err2);
        return [];
      }
    } else {
      console.error(`[discovery:${batch}] error:`, msg);
      return [];
    }
  }

  console.log(
    `[discovery:${batch}] responded in ${Date.now() - t0}ms, stop=${response.stop_reason}, out=${response.usage?.output_tokens}`,
  );

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    console.error(`[discovery:${batch}] no tool_use block`);
    return [];
  }
  const parsed = toolBlock.input as { ideas?: IdeaFromModel[] };
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  if (ideas.length === 0) {
    const preview = JSON.stringify(toolBlock.input).slice(0, 300);
    console.error(`[discovery:${batch}] empty ideas. stop=${response.stop_reason}, in=${preview}`);
  }
  // Force the tag + normalize confidence (some model outputs use 0-1 scale)
  return ideas.map((idea) => {
    let conf = Number(idea.confidence) || 0;
    if (conf > 0 && conf <= 1) conf = Math.round(conf * 100);
    else conf = Math.round(conf);
    if (conf < 0) conf = 0;
    if (conf > 100) conf = 100;
    return { ...idea, tag, confidence: conf };
  });
}

// ============================================================================
// POST — Generate ideas for a company profile
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const profile = await req.json();
    const supabase = createServerClient();

    // 1. Upsert company
    let companyId: string = profile.companyId || '';
    try {
      const companyRow = {
        name: profile.companyName,
        sector: profile.sector,
        organization_type: profile.organizationType,
        revenue_range: profile.revenueRange || null,
        prior_eu_experience: profile.priorEUExperience || false,
        description: profile.description || null,
        geographies: profile.geographies || [],
        capabilities: profile.capabilities || [],
        certifications: profile.certifications || [],
        team_size: profile.teamSize || null,
        existing_partners: profile.existingPartners || [],
        key_customers: profile.keyCustomers || [],
        typical_project_size: profile.typicalProjectSize || null,
        three_year_vision: profile.threeYearVision || null,
        cash_runway: profile.cashRunway || null,
        consortium_posture: profile.consortiumPosture || null,
        international_contacts: profile.internationalContacts || [],
        profile_completeness: profile.profileCompleteness || 30,
      };

      if (companyId) {
        const { error: updateError } = await supabase
          .from('companies')
          .update(companyRow)
          .eq('id', companyId);
        if (updateError) console.error('Company update error:', updateError);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('companies')
          .insert(companyRow)
          .select('id')
          .single();
        if (insertError) {
          console.error('Company insert error:', insertError);
        } else {
          companyId = inserted.id;
        }
      }
    } catch (dbErr) {
      console.error('Company DB error:', dbErr);
    }

    // 2. Build user prompt
    const userPrompt = buildUserPrompt(profile);

    // 3. Ten parallel calls (1 idea each) = 10 ideas. Single-idea batches
    //    finish in ~15-25s so they comfortably fit under the 60s budget and
    //    never hit max_tokens (which nukes tool_use into an empty object).
    const t0 = Date.now();
    const batches: BatchKey[] = [
      'concrete_funding_a',
      'concrete_funding_b',
      'concrete_buyer_a',
      'concrete_buyer_b',
      'creative_consortium',
      'creative_capital',
      'creative_diaspora',
      'hybrid_blended',
      'hybrid_consortium',
      'hybrid_offtake',
    ];
    const results = await Promise.all(batches.map((b) => generateBatch(b, userPrompt)));
    const batchCounts = batches.map((b, i) => `${b}=${results[i].length}`).join(', ');
    console.log(`[discovery] all 10 batches completed in ${Date.now() - t0}ms — ${batchCounts}`);

    // Merge, sort by confidence descending
    const rawIdeas = results.flat().sort(
      (a, b) => (b.confidence || 0) - (a.confidence || 0),
    );

    // 4. Persist to DB — cleanly map dbId back via insertion order
    let persistedIdeas: IdeaFromModel[] = rawIdeas;
    if (companyId && rawIdeas.length > 0) {
      const rows = rawIdeas.map((idea) => ({
        company_id: companyId,
        title: idea.title,
        summary: idea.summary,
        tag: idea.tag,
        confidence: idea.confidence,
        confidence_rationale: idea.confidence_rationale || null,
        estimated_value_min: idea.estimated_value_min || null,
        estimated_value_max: idea.estimated_value_max || null,
        currency: idea.currency || 'EUR',
        estimated_timeline_months: idea.estimated_timeline_months || null,
        funding_paths: idea.funding_paths || [],
        partners: idea.partners || [],
        buyers: idea.buyers || [],
        investors: idea.investors || [],
        next_steps: idea.next_steps || [],
        regulatory_requirements: idea.regulatory_requirements || [],
        risks: idea.risks || [],
        data_provenance: idea.data_provenance || [],
        missing_data: idea.missing_data || [],
        proposal_ready: idea.proposal_ready || false,
        status: 'new',
      }));

      const { data: savedIdeas, error: ideasError } = await supabase
        .from('ideas')
        .insert(rows)
        .select('id');

      if (ideasError) {
        console.error('Ideas insert error:', ideasError);
      } else if (savedIdeas) {
        // Map dbId by insertion order — PG returns in insert order
        persistedIdeas = rawIdeas.map((idea, i) => ({
          ...idea,
          dbId: savedIdeas[i]?.id,
        }));
      }
    }

    return NextResponse.json({ ideas: persistedIdeas, companyId: companyId || null });
  } catch (error) {
    console.error('Discovery Engine error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        error: 'Failed to generate ideas',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

function buildUserPrompt(profile: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('Generate ideas for the following company.');
  lines.push('');
  lines.push('## Company profile');
  lines.push(`Name: ${profile.companyName || 'Unnamed'}`);
  lines.push(`Sector: ${profile.sector || 'Not specified'}`);
  lines.push(`Organization type: ${profile.organizationType || 'Not specified'}`);
  lines.push(`Annual revenue: ${profile.revenueRange || 'Not specified'}`);
  lines.push(
    `Geographies of interest: ${Array.isArray(profile.geographies) && profile.geographies.length ? (profile.geographies as string[]).join(', ') : 'Not specified'}`,
  );
  lines.push(`Prior EU contracting experience: ${profile.priorEUExperience ? 'Yes' : 'No'}`);
  lines.push(`Description: ${profile.description || 'Not provided'}`);

  const hasStage2 =
    profile.capabilities ||
    profile.certifications ||
    profile.teamSize ||
    profile.existingPartners ||
    profile.keyCustomers ||
    profile.typicalProjectSize ||
    profile.threeYearVision ||
    profile.cashRunway ||
    profile.consortiumPosture ||
    profile.internationalContacts;

  if (hasStage2) {
    lines.push('');
    lines.push('## Deep profile');
    if (profile.capabilities)
      lines.push(`Capabilities: ${(profile.capabilities as string[]).join(', ')}`);
    if (profile.certifications)
      lines.push(`Certifications: ${(profile.certifications as string[]).join(', ')}`);
    if (profile.teamSize) lines.push(`Team size: ${profile.teamSize}`);
    if (profile.existingPartners)
      lines.push(`Existing partners: ${(profile.existingPartners as string[]).join(', ')}`);
    if (profile.keyCustomers)
      lines.push(`Key customers: ${(profile.keyCustomers as string[]).join(', ')}`);
    if (profile.typicalProjectSize)
      lines.push(`Typical project size: ${profile.typicalProjectSize}`);
    if (profile.threeYearVision)
      lines.push(`Three-year vision: ${profile.threeYearVision}`);
    if (profile.cashRunway) lines.push(`Cash runway: ${profile.cashRunway}`);
    if (profile.consortiumPosture)
      lines.push(`Consortium posture: ${profile.consortiumPosture}`);
    if (profile.internationalContacts)
      lines.push(
        `International contacts: ${(profile.internationalContacts as string[]).join(', ')}`,
      );
  }

  lines.push('');
  lines.push('Make each idea feel like an insight a senior BD strategist would share — non-obvious, specific, and actionable.');

  return lines.join('\n');
}

// ============================================================================
// GET — Retrieve saved ideas for a company
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const companyId = req.nextUrl.searchParams.get('companyId');
    const status = req.nextUrl.searchParams.get('status');

    let query = supabase
      .from('ideas')
      .select('*')
      .order('confidence', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Normalize: the DB column is `id`, client expects `dbId` for consistency
    const ideas = (data || []).map((row) => ({ ...row, dbId: row.id }));

    return NextResponse.json({ ideas });
  } catch (error) {
    console.error('Get ideas error:', error);
    return NextResponse.json({ error: 'Failed to fetch ideas' }, { status: 500 });
  }
}

// ============================================================================
// PATCH — Update idea status (save / dismiss / mark in_progress)
// ============================================================================

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id, status } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabase.from('ideas').update({ status }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update idea error:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}
