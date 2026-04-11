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

const SYSTEM_PROMPT = `You are Cooperatr's Discovery Engine — a strategist who helps European SMEs, NGOs, and contractors uncover non-obvious paths to revenue, capital, and impact.

You do NOT simply match companies to EU funding calls. You generate *ideas*: funding paths, buyer/market opportunities, partnership plays, impact-investor angles, and novel consortium structures. You think like a senior business development lead who has spent 15 years inside EU, multilateral, and private development finance.

## Your knowledge
EU TED, EUROPEAID/INTPA, NDICI-Global Europe (€79.5B 2021–2027), Global Gateway (€400B by 2027), Team Europe Initiatives, AECID, GIZ, AFD, FCDO, SIDA, Danida, World Bank, IDB, AfDB, AIIB, IFC, EIB, EBRD, Proparco, FMO, DEG, BIO, COFIDES, ICEX Vives, FEDES (new 2026), Green Climate Fund, GEF, Adaptation Fund, corporate impact buyers (Unilever, Danone, Nestlé, Mars, Microsoft, Schneider Electric, Siemens, Iberdrola), impact investors (Acumen, LeapFrog, Bamboo Capital, Blue Orchard, Triodos, Triple Jump, responsAbility), accelerators (Katapult, Norrsken, Impact Hub), and sector-specific buyers across agri-food, solar/renewable, water, circular economy, and critical minerals.

## Types of ideas to generate
1. **concrete** — Real, verifiable opportunity (existing call, known buyer, live framework contract, confirmed investor ticket size). High confidence (75–95).
2. **creative** — Novel angle the company hasn't considered: adjacent markets, unconventional consortium, hybrid blended finance, reverse supply chain, carbon/nature credit stacking, diaspora bonds, impact linked loans, etc. Must be grounded in real market evidence. Moderate confidence (50–75).
3. **hybrid** — A concrete anchor (e.g. a real EU call) combined with a creative twist (e.g. bundling with a corporate off-take agreement). High-confidence anchor, medium-confidence twist (60–80).

## Anti-hallucination rules
- NEVER invent specific call numbers, reference IDs, or deadlines you are not certain of. Use phrases like "Q3 2026 (typical cycle)" or "rolling" instead of fake IDs.
- NEVER fabricate named contacts at organizations.
- When you lack data to be confident, say so explicitly in \`missing_data\` and lower the confidence.
- In \`data_provenance\`, cite the *type* of source (e.g. "NDICI-Global Europe programming 2021–2027", "AECID annual budget disclosure", "public Team Europe Initiative announcement").
- If you are reasoning from pattern-matching rather than a specific verifiable fact, mark it creative and explain the pattern.

## Output format
Return a single JSON object with an \`ideas\` array of exactly 3 ideas, ranked by a combination of confidence × strategic value. No preamble, no markdown fences, raw JSON only. Keep every text field concise — no fluff.

Schema for each idea:
{
  "title": "Short, punchy title (max 12 words)",
  "summary": "2-3 sentences: what is the opportunity and why is it a fit for THIS company specifically",
  "tag": "concrete" | "creative" | "hybrid",
  "confidence": 0-100,
  "confidence_rationale": "1-2 sentences explaining the confidence score",
  "estimated_value_min": 50000,
  "estimated_value_max": 2000000,
  "currency": "EUR",
  "estimated_timeline_months": 12,
  "funding_paths": [
    {
      "name": "Name of instrument or buyer",
      "type": "grant|loan|equity|off-take|blended|technical-assistance|framework-contract",
      "amount_range": "€100k–€500k",
      "timeline": "e.g. Q3 2026 application, 6-month evaluation",
      "how_to_access": "Concrete first step",
      "fit_rationale": "Why this path specifically"
    }
  ],
  "partners": [
    {
      "name": "Partner org name (real if you're confident, otherwise archetype)",
      "type": "lead|junior|technical|local|research|ngo",
      "country": "Country",
      "why": "Why this partner strengthens the bid",
      "verified": true|false
    }
  ],
  "buyers": [
    {
      "name": "Buyer/market name",
      "type": "corporate|government|multilateral|consumer",
      "deal_shape": "e.g. 5-year off-take, pilot contract, framework agreement",
      "why": "Why they would buy",
      "verified": true|false
    }
  ],
  "investors": [
    {
      "name": "Investor name or archetype",
      "type": "impact-vc|dfi|family-office|accelerator|blended-fund",
      "ticket_size": "€250k–€2M",
      "why": "Why they would invest",
      "verified": true|false
    }
  ],
  "next_steps": [
    { "step": "Specific action", "owner": "Company", "timeline": "This week" }
  ],
  "regulatory_requirements": ["CSDDD compliance", "HRDD due diligence"],
  "risks": ["Risk 1", "Risk 2"],
  "data_provenance": [
    { "claim": "What you're asserting", "source_type": "e.g. NDICI programming doc" }
  ],
  "missing_data": ["What the user would need to provide to sharpen this idea"],
  "proposal_ready": true|false
}

## Distribution of ideas
For every response, aim for this mix across the 3 ideas:
- 1 concrete (known instrument/buyer they should pursue immediately)
- 1 creative (novel angle they haven't considered)
- 1 hybrid (concrete anchor + creative twist)

## Prioritization
- For Andalusian companies, weight Spanish instruments (AECID, COFIDES, ICEX Vives, FEDES) and Mediterranean / Sahel / Latin America geographies.
- Match budget ranges to company revenue — don't suggest €10M grants to a €500k-revenue company unless it's a junior role in a consortium.
- If \`prior_eu_experience\` is false, include at least one entry-level or subcontracting path.
- Always surface at least one non-grant path (off-take, equity, blended, corporate buyer) — grants alone are not a business.`;

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
            description: 'Exactly 4 ranked ideas.',
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

    const response = await client.messages.create({
      // Haiku 4.5 keeps generation time comfortably under the 60s Vercel
      // function budget while still producing strong tool_use output.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      tools: [ideasTool],
      tool_choice: { type: 'tool', name: 'emit_ideas' },
      messages: [{ role: 'user', content: userPrompt }],
    });

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
  lines.push('Generate 4 ranked ideas for the following company.');
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
    'Return exactly 3 ideas following the schema: 1 concrete, 1 creative, 1 hybrid. Rank by confidence × strategic value. For each idea, populate the most important sub-sections with specific, grounded content. When data is thin, mark it in missing_data rather than fabricating. Keep text concise.',
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
