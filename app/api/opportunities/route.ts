import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

export const maxDuration = 60;

// ============================================================================
// SYSTEM PROMPTS — Discovery Engine (one per tag, run in parallel)
// ============================================================================

const BASE_PROMPT = `You are Cooperatr's Discovery Engine — a senior EU/multilateral development finance strategist helping European SMEs uncover non-obvious paths to revenue, capital, and impact.

Known instruments: NDICI-Global Europe, Global Gateway, Team Europe Initiatives, AECID, COFIDES, ICEX Vives, FEDES, GIZ, AFD, FCDO, SIDA, World Bank, IDB, AfDB, IFC, EIB, EBRD, Proparco, FMO, Green Climate Fund. Known impact investors: Acumen, LeapFrog, Bamboo Capital, Triodos, responsAbility, Blue Orchard, Incofin.

Anti-hallucination: do NOT invent call IDs or deadlines. Use "Q3 2026 typical cycle" or "rolling". Flag uncertainty via missing_data and lower confidence.

Prioritize Spanish instruments for Andalusian companies. If prior_eu_experience=false, surface an entry-level path.

## Sub-section field shapes (populate every idea with these):

funding_paths — array of 2-3 objects, each with fields:
  { name, type, amount_range, timeline, how_to_access, fit_rationale }
  Example: { name: "AECID Cooperación Delegada", type: "grant", amount_range: "€500K-€2M", timeline: "Q2 2026 typical cycle", how_to_access: "Submit EOI via AECID portal", fit_rationale: "Spanish implementer preference" }

partners — array of 2-3 objects, each with fields:
  { name, type, country, why, verified }
  Example: { name: "GIZ Mozambique", type: "implementer", country: "Mozambique", why: "Active in same sector, need local SME partner", verified: false }

buyers — array of 1-3 objects (when revenue path relevant):
  { name, type, deal_shape, why, verified }

investors — array of 1-3 objects (when equity/blended relevant):
  { name, type, ticket_size, why, verified }

next_steps — array of 3-5 objects, each with fields:
  { step, owner, timeline }
  Example: { step: "Email ICEX Vives for eligibility check", owner: "CEO", timeline: "this week" }

Always populate funding_paths (2-3), partners (2-3), and next_steps (3-5) on EVERY idea. Keep values concise — short phrases, not paragraphs. Title 6-12 words. Summary 2 crisp sentences.`;

// Each batch produces 2 ideas in ~25-30s, so we run 5 of them in parallel
// to hit 10 ideas inside the 60s function budget. Different angles per batch
// keep variety across the concrete/creative/hybrid mix.
type BatchKey = 'concrete_funding' | 'concrete_buyers' | 'creative_consortia' | 'creative_capital' | 'hybrid';

const BATCH_INSTRUCTIONS: Record<BatchKey, { tag: 'concrete' | 'creative' | 'hybrid'; instructions: string }> = {
  concrete_funding: {
    tag: 'concrete',
    instructions: `Generate exactly 2 CONCRETE ideas (confidence 75-95) focused on NAMED FUNDING INSTRUMENTS — grants, blended finance, DFI facilities, or ICEX/AECID/COFIDES instruments. Each must anchor on a real instrument name and be actionable within 90 days.`,
  },
  concrete_buyers: {
    tag: 'concrete',
    instructions: `Generate exactly 2 CONCRETE ideas (confidence 75-95) focused on NAMED BUYERS — multilateral procurement (WFP, UNICEF, UNOPS), EU institutions, large corporates with off-take needs, or public tenders. Each must name the buyer and the realistic deal shape.`,
  },
  creative_consortia: {
    tag: 'creative',
    instructions: `Generate exactly 2 CREATIVE ideas (confidence 50-75) focused on UNCONVENTIONAL CONSORTIA — non-obvious co-applicants, cross-sector partnerships, regional cooperation, or SME-NGO pairings that unlock instruments the company couldn't access alone.`,
  },
  creative_capital: {
    tag: 'creative',
    instructions: `Generate exactly 2 CREATIVE ideas (confidence 50-75) focused on NON-OBVIOUS CAPITAL ROUTES — diaspora bonds, philanthropic catalytic capital, impact-linked debt, revenue-based financing, or blended structures with family offices or named impact VCs.`,
  },
  hybrid: {
    tag: 'hybrid',
    instructions: `Generate exactly 2 HYBRID ideas (confidence 60-80). Each combines a concrete anchor (specific EU instrument or corporate buyer) with a creative twist (e.g., pairing with a named impact investor for blended finance, or a consortium with a non-obvious co-applicant). Show both halves clearly.`,
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
        description: 'Exactly 2 ranked ideas.',
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

async function generateBatch(batch: BatchKey, userPrompt: string): Promise<IdeaFromModel[]> {
  const { tag, instructions } = BATCH_INSTRUCTIONS[batch];
  const system = `${BASE_PROMPT}\n\n${instructions}\n\nCall emit_ideas with exactly 2 ideas. EVERY idea MUST have funding_paths (2-3), partners (2-3), and next_steps (3-5) populated with specific named entries. Keep text concise.`;

  const t0 = Date.now();
  console.log(`[discovery:${batch}] calling Anthropic...`);

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system,
      tools: [ideasTool],
      tool_choice: { type: 'tool', name: 'emit_ideas' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    console.log(
      `[discovery:${batch}] responded in ${Date.now() - t0}ms, stop_reason=${response.stop_reason}, out=${response.usage?.output_tokens}`,
    );

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      console.error(`[discovery:${batch}] no tool_use block`);
      return [];
    }
    const parsed = toolBlock.input as { ideas?: IdeaFromModel[] };
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    if (ideas.length === 0) {
      const inputPreview = JSON.stringify(toolBlock.input).slice(0, 400);
      console.error(`[discovery:${batch}] empty ideas. stop_reason=${response.stop_reason}, input: ${inputPreview}`);
    }
    return ideas.map((idea) => ({ ...idea, tag }));
  } catch (err) {
    console.error(`[discovery:${batch}] error:`, err instanceof Error ? err.message : err);
    return [];
  }
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

    // 3. Five parallel calls (2 ideas each) = 10 ideas, each small enough to
    //    finish under the 60s function budget
    const t0 = Date.now();
    const batches: BatchKey[] = [
      'concrete_funding',
      'concrete_buyers',
      'creative_consortia',
      'creative_capital',
      'hybrid',
    ];
    const results = await Promise.all(batches.map((b) => generateBatch(b, userPrompt)));
    const batchCounts = batches.map((b, i) => `${b}=${results[i].length}`).join(', ');
    console.log(`[discovery] all 5 batches completed in ${Date.now() - t0}ms — ${batchCounts}`);

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
