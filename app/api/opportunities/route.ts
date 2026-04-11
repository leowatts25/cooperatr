import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

export const maxDuration = 60;

// ============================================================================
// SYSTEM PROMPT — Discovery Engine
// ============================================================================
// This is NOT a fund-matcher. This is an ideation engine that uncovers
// non-obvious paths to revenue, capital, and impact for the user's company:
// - Concrete ideas: real instruments, verified calls, known buyers/partners
// - Creative ideas: novel angles grounded in evidence (adjacent markets,
//   unconventional consortia, hybrid financing structures)
// - Hybrid: a concrete anchor + creative extension
// ============================================================================

const SYSTEM_PROMPT = `You are Cooperatr's Discovery Engine — a senior EU/multilateral development finance strategist. You help European SMEs uncover non-obvious paths to revenue, capital, and impact (funding, partners, buyers, impact investors, novel consortia).

Known instruments: NDICI-Global Europe, Global Gateway, Team Europe Initiatives, AECID, COFIDES, ICEX Vives, FEDES, GIZ, AFD, FCDO, SIDA, World Bank, IDB, AfDB, IFC, EIB, EBRD, Proparco, FMO, Green Climate Fund. Known impact investors: Acumen, LeapFrog, Bamboo Capital, Triodos, responsAbility. Known corporate off-take buyers across agri, energy, water, circular.

Idea types:
- concrete (75-95 confidence) — real instrument or known buyer, actionable now
- creative (50-75) — novel angle, grounded in evidence
- hybrid (60-80) — concrete anchor + creative twist

Anti-hallucination: do NOT invent specific call IDs, deadlines, or named contacts. Use "Q3 2026 typical cycle" or "rolling". Flag uncertainty via missing_data and lower confidence.

Prioritize Spanish instruments for Andalusian companies. Match budget to revenue. If prior_eu_experience=false, surface an entry-level path. Always include at least one non-grant path (off-take, equity, blended, corporate buyer).

Output: call the emit_ideas tool with exactly 2 ideas (1 concrete + 1 creative OR 1 hybrid). Keep text concise, populate only the most important sub-sections.`;

// ============================================================================
// POST — Generate ideas for a company profile
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
};

export async function POST(req: NextRequest) {
  try {
    const profile = await req.json();
    const supabase = createServerClient();

    // 1. Upsert company profile. If companyId is passed, update; else insert.
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
        // Stage 2 fields (optional on first pass)
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

    // 2. Build user prompt for the discovery engine
    const userPrompt = buildUserPrompt(profile);

    // 3. Call Claude with tool_use to guarantee valid structured JSON
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
                data_provenance: { type: 'array', items: { type: 'object' } },
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

    const t0 = Date.now();
    console.log('[discovery] calling Anthropic...');
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [ideasTool],
      tool_choice: { type: 'tool', name: 'emit_ideas' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    console.log(`[discovery] Anthropic responded in ${Date.now() - t0}ms`);

    // Extract ideas from the tool_use response block
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw new Error('Model did not return a tool_use block');
    }
    const parsed = toolBlock.input as { ideas: IdeaFromModel[] };
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];

    // 4. Persist ideas to DB
    if (companyId && ideas.length > 0) {
      const rows = ideas.map((idea) => ({
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

      if (ideasError) console.error('Ideas insert error:', ideasError);

      if (savedIdeas) {
        ideas.forEach((idea, i) => {
          if (savedIdeas[i]) {
            (idea as IdeaFromModel & { dbId?: string }).dbId = savedIdeas[i].id;
          }
        });
      }
    }

    return NextResponse.json({ ideas, companyId: companyId || null });
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
  lines.push('Generate 2 ranked ideas for the following company.');
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

  // Stage 2 fields — only include if present
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
  lines.push('## Instructions');
  lines.push(
    'Return exactly 2 ideas: one concrete and one creative (or hybrid). Populate the most important sub-sections. When data is thin, mark it in missing_data. Keep text very concise.',
  );
  lines.push(
    'Make the ideas feel like insights a senior business-development strategist would share — non-obvious, actionable, and specific to this company.',
  );

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

    return NextResponse.json({ ideas: data });
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

    const { error } = await supabase.from('ideas').update({ status }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update idea error:', error);
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}
