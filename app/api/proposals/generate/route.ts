import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

export const maxDuration = 60;

// ============================================================================
// Stage 2: Proposal generation with sector-specialist routing
// ============================================================================
// User clicks "Start Proposal" on a saved idea. The pipeline:
//   1. Router (Haiku) picks the right sector specialist for the idea+company
//   2. Specialist (Sonnet) drafts a full 4-section proposal with domain framing
//   3. Persist the draft + specialist metadata for analytics
// ============================================================================

type SpecialistKey =
  | 'agrifood'
  | 'cleantech_energy'
  | 'health_pharma'
  | 'infra_mobility'
  | 'digital_tech'
  | 'circular_manufacturing'
  | 'generalist';

const SPECIALISTS: Record<SpecialistKey, { label: string; guidance: string }> = {
  agrifood: {
    label: 'Agrifood & rural value chains',
    guidance: `You are a sector specialist in agrifood and rural development. Your proposals always address: (a) smallholder inclusion and offtake guarantees, (b) cold-chain / logistics realities, (c) phytosanitary and SPS compliance for the target geography, (d) climate resilience of the crop/supply chain, (e) gender in agricultural value chains. Reference AECID, AfDB, IFAD, Global Agriculture & Food Security Program, and the EU's Farm-to-Fork Strategy where relevant.`,
  },
  cleantech_energy: {
    label: 'Cleantech, energy & climate',
    guidance: `You are a sector specialist in cleantech, renewables and climate adaptation. Your proposals always address: (a) LCOE and bankability, (b) grid integration or off-grid context, (c) local content requirements, (d) Just Transition and gender-energy links, (e) Paris Agreement alignment (Article 6, NDCs). Reference Green Climate Fund, EIB Climate Bank, Proparco, EBRD Green Economy, Global Gateway green pillar, and the EU Taxonomy where relevant.`,
  },
  health_pharma: {
    label: 'Health, pharma & diagnostics',
    guidance: `You are a sector specialist in global health and pharma. Your proposals always address: (a) pre-qualification (WHO PQ, SRA), (b) regulatory pathway in the target geography, (c) cold-chain and last-mile delivery, (d) equitable access clauses, (e) GMP and clinical data integrity. Reference Unitaid, Gavi, Global Fund, Coalition for Epidemic Preparedness Innovations (CEPI), EDCTP, and EIB Health.`,
  },
  infra_mobility: {
    label: 'Infrastructure & mobility',
    guidance: `You are a sector specialist in infrastructure, transport and urban mobility. Your proposals always address: (a) concession structure and PPP viability, (b) environmental and social safeguards (IFC PS, EIB ESSF), (c) resettlement and land acquisition risk, (d) currency risk and blended finance needs, (e) O&M sustainability. Reference Global Gateway infrastructure pillar, EIB, EBRD, AfDB, AIIB, PIDG, and the Sustainable Infrastructure Foundation.`,
  },
  digital_tech: {
    label: 'Digital, data & AI',
    guidance: `You are a sector specialist in digital development and AI-for-good. Your proposals always address: (a) data protection alignment (GDPR, local data laws), (b) digital public infrastructure (DPI) alignment, (c) responsible AI and algorithmic accountability, (d) interoperability and open standards, (e) bridging the digital divide and gender digital gap. Reference D4D Hub, Digital Public Goods Alliance, UNDP Digital Strategy, Global Gateway digital pillar, and Horizon Europe Cluster 4.`,
  },
  circular_manufacturing: {
    label: 'Circular economy & manufacturing',
    guidance: `You are a sector specialist in circular economy, light manufacturing and industrial upgrading. Your proposals always address: (a) value-chain traceability, (b) CBAM / CSDDD compliance, (c) industrial symbiosis opportunities, (d) SME clustering and local supplier development, (e) Extended Producer Responsibility. Reference EU Circular Economy Action Plan, EBRD GrCF2, UNIDO, and the Global Alliance on Circular Economy.`,
  },
  generalist: {
    label: 'Cross-sector generalist',
    guidance: `You are a cross-sector development finance generalist. Focus on the universals: clear logframe, measurable outcomes, strong risk matrix, honest co-financing picture, and gender/environment mainstreaming appropriate to the context.`,
  },
};

// ============================================================================
// Router: Haiku picks the right specialist
// ============================================================================

const ROUTER_PROMPT = `You are Cooperatr's Specialist Router. Given one saved idea and the company behind it, pick exactly ONE sector specialist from the list who should draft the proposal. Use the specialist whose domain most sharply matches where the real risk and expertise live — not just the company's sector.

Specialists:
- agrifood: agriculture, food value chains, rural development, fisheries, organic/fair trade
- cleantech_energy: renewables, energy access, climate mitigation/adaptation, water
- health_pharma: global health, diagnostics, pharma, nutrition, cold-chain medicines
- infra_mobility: transport, urban, logistics corridors, ports, PPPs
- digital_tech: software, AI, digital public infrastructure, data, connectivity
- circular_manufacturing: circular economy, light industry, materials, recycling
- generalist: when none of the above is a clear fit`;

const routerTool: Anthropic.Tool = {
  name: 'route_to_specialist',
  description: 'Pick one sector specialist and explain why.',
  input_schema: {
    type: 'object',
    properties: {
      specialist: {
        type: 'string',
        enum: [
          'agrifood',
          'cleantech_energy',
          'health_pharma',
          'infra_mobility',
          'digital_tech',
          'circular_manufacturing',
          'generalist',
        ],
      },
      rationale: {
        type: 'string',
        description: 'One sentence explaining why this specialist is the best fit.',
      },
    },
    required: ['specialist', 'rationale'],
  },
};

async function routeToSpecialist(
  idea: Record<string, unknown>,
  company: Record<string, unknown> | null,
): Promise<{ specialist: SpecialistKey; rationale: string }> {
  const userPrompt = `## Idea
Title: ${idea.title}
Tag: ${idea.tag}
Summary: ${idea.summary}
Funding paths: ${JSON.stringify(idea.funding_paths || []).slice(0, 400)}
Partners: ${JSON.stringify(idea.partners || []).slice(0, 400)}

## Company
Sector: ${company?.sector || '—'}
Description: ${company?.description || '—'}
Geographies: ${Array.isArray(company?.geographies) ? (company?.geographies as string[]).join(', ') : '—'}

Pick the best specialist to draft this proposal.`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: ROUTER_PROMPT,
      tools: [routerTool],
      tool_choice: { type: 'tool', name: 'route_to_specialist' },
      messages: [{ role: 'user', content: userPrompt }],
    });

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      return { specialist: 'generalist', rationale: 'Router returned no tool use; defaulting to generalist.' };
    }
    const out = toolBlock.input as { specialist: SpecialistKey; rationale: string };
    if (!SPECIALISTS[out.specialist]) {
      return { specialist: 'generalist', rationale: `Unknown specialist ${out.specialist}; defaulting.` };
    }
    return out;
  } catch (err) {
    console.error('[router] error:', err instanceof Error ? err.message : err);
    return { specialist: 'generalist', rationale: 'Router failed; defaulting to generalist.' };
  }
}

// ============================================================================
// Specialist: Sonnet drafts the 4-section proposal
// ============================================================================

const BASE_SPECIALIST_PROMPT = `You are a Cooperatr sector specialist drafting one section of a proposal for an Andalusian SME pursuing an idea from the Discovery Engine.

Write a substantive, professional EU/DFI-grade section. No placeholders, no "TBD", no generic filler. Use specific numbers, named standards, and realistic timelines. Reference the specific funder(s) from the idea and their known evaluation criteria where appropriate.`;

type SectionKey =
  | 'executive_summary'
  | 'technical_section'
  | 'financial_section'
  | 'compliance_section';

const SECTION_BRIEFS: Record<SectionKey, { label: string; instructions: string }> = {
  executive_summary: {
    label: 'Executive Summary',
    instructions: `Write a 2-3 paragraph executive summary covering: project rationale and problem framing, the proposed approach, the expected impact with 3-4 measurable indicators, and why this specific funder is the right fit. Open with a single punchy sentence that names the outcome.`,
  },
  technical_section: {
    label: 'Technical Approach',
    instructions: `Write a detailed technical approach with: (1) specific objectives (SMART), (2) methodology and theory of change, (3) a logframe-style results chain (inputs → activities → outputs → outcomes → impact) with at least 6 indicators and targets, (4) 3-5 work packages with activities, lead partner, and deliverables, and (5) a quarterly timeline for an 18-36 month implementation.`,
  },
  financial_section: {
    label: 'Financial Plan',
    instructions: `Write a budget narrative by work package with concrete EUR line items: personnel (with FTEs and rates), travel, equipment, subcontracting, indirect costs, and contingency. Give per-work-package subtotals and a grand total. Include the co-financing split (donor share vs. company/partner share) and cashflow assumptions. Numbers must be plausible for the company's revenue band.`,
  },
  compliance_section: {
    label: 'Compliance & ESG',
    instructions: `Write a compliance and ESG section covering: CSDDD readiness, GDPR/data protection posture, environmental safeguards aligned to the funder's ESS, gender mainstreaming with specific actions and indicators, human rights due diligence, and sector-specific regulatory items that apply to the idea. Name the standards explicitly.`,
  },
};

function sectionTool(section: SectionKey): Anthropic.Tool {
  return {
    name: 'emit_section',
    description: `Emit the ${SECTION_BRIEFS[section].label} section.`,
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Final proposal title. Only include on executive_summary calls — other sections can leave empty.',
        },
        content: { type: 'string', description: `The ${SECTION_BRIEFS[section].label} content.` },
      },
      required: ['content'],
    },
  };
}

function buildSpecialistContext(
  idea: Record<string, unknown>,
  company: Record<string, unknown> | null,
): string {
  return `## Idea from Discovery Engine
Title: ${idea.title}
Tag: ${idea.tag}
Confidence: ${idea.confidence}
Summary: ${idea.summary}
Confidence rationale: ${idea.confidence_rationale || '—'}

Funding paths:
${JSON.stringify(idea.funding_paths || [], null, 2)}

Partners:
${JSON.stringify(idea.partners || [], null, 2)}

Buyers:
${JSON.stringify(idea.buyers || [], null, 2)}

Investors:
${JSON.stringify(idea.investors || [], null, 2)}

Next steps:
${JSON.stringify(idea.next_steps || [], null, 2)}

Risks: ${JSON.stringify(idea.risks || [])}
Regulatory: ${JSON.stringify(idea.regulatory_requirements || [])}

## Company
Name: ${company?.name || 'Unnamed'}
Sector: ${company?.sector || '—'}
Organization type: ${company?.organization_type || 'SME'}
Revenue range: ${company?.revenue_range || '—'}
Prior EU experience: ${company?.prior_eu_experience ? 'Yes' : 'No'}
Description: ${company?.description || '—'}
Geographies: ${Array.isArray(company?.geographies) ? (company?.geographies as string[]).join(', ') : '—'}
Capabilities: ${Array.isArray(company?.capabilities) ? (company?.capabilities as string[]).join(', ') : '—'}
Certifications: ${Array.isArray(company?.certifications) ? (company?.certifications as string[]).join(', ') : '—'}
Team size: ${company?.team_size || '—'}
Typical project size: ${company?.typical_project_size || '—'}
Consortium posture: ${company?.consortium_posture || '—'}`;
}

async function draftSection(
  section: SectionKey,
  specialist: SpecialistKey,
  context: string,
): Promise<{ content: string; title?: string }> {
  const spec = SPECIALISTS[specialist];
  const brief = SECTION_BRIEFS[section];
  const system = `${BASE_SPECIALIST_PROMPT}\n\n## Your specialty: ${spec.label}\n${spec.guidance}\n\n## Your task right now: ${brief.label}\n${brief.instructions}`;

  const tailoring =
    section === 'executive_summary'
      ? '\n\nAlso propose a final proposal title (one crisp line, may refine the idea title) and return it in the title field.'
      : '';

  const userPrompt = `${context}\n\nDraft the ${brief.label} now. Tailor to the company's experience level; if prior EU experience is "No", lean on consortium/partnership framing to de-risk the bid.${tailoring}`;

  const t0 = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system,
      tools: [sectionTool(section)],
      tool_choice: { type: 'tool', name: 'emit_section' },
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.includes('rate_limit')) {
      await new Promise((r) => setTimeout(r, 2000));
      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system,
        tools: [sectionTool(section)],
        tool_choice: { type: 'tool', name: 'emit_section' },
        messages: [{ role: 'user', content: userPrompt }],
      });
    } else {
      throw err;
    }
  }

  console.log(
    `[proposals:${section}] ${Date.now() - t0}ms, stop=${response.stop_reason}, out=${response.usage?.output_tokens}`,
  );

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error(`Section ${section} returned no tool use (stop=${response.stop_reason})`);
  }
  const out = toolBlock.input as { content: string; title?: string };
  return out;
}

type ProposalDraft = {
  title: string;
  executive_summary: string;
  technical_section: string;
  financial_section: string;
  compliance_section: string;
};

async function draftProposal(
  specialist: SpecialistKey,
  idea: Record<string, unknown>,
  company: Record<string, unknown> | null,
): Promise<ProposalDraft> {
  const context = buildSpecialistContext(idea, company);

  const sections: SectionKey[] = [
    'executive_summary',
    'technical_section',
    'financial_section',
    'compliance_section',
  ];

  const t0 = Date.now();
  const results = await Promise.all(sections.map((s) => draftSection(s, specialist, context)));
  console.log(`[proposals] 4 parallel sections completed in ${Date.now() - t0}ms`);

  const [exec, tech, fin, comp] = results;
  return {
    title: exec.title || (idea.title as string) || 'Proposal',
    executive_summary: exec.content,
    technical_section: tech.content,
    financial_section: fin.content,
    compliance_section: comp.content,
  };
}

// ============================================================================
// POST — generate a proposal for a saved idea
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const { ideaId, companyId } = await req.json();

    if (!ideaId) {
      return NextResponse.json({ error: 'ideaId is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const [ideaResult, compResult] = await Promise.all([
      supabase.from('ideas').select('*').eq('id', ideaId).single(),
      companyId
        ? supabase.from('companies').select('*').eq('id', companyId).single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const idea = ideaResult.data;
    const company = compResult.data;

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    // 1. Route to the right specialist
    const tRoute = Date.now();
    const { specialist, rationale } = await routeToSpecialist(idea, company);
    console.log(
      `[proposals] routed to ${specialist} in ${Date.now() - tRoute}ms — ${rationale}`,
    );

    // 2. Specialist drafts the full proposal
    const tDraft = Date.now();
    const draft = await draftProposal(specialist, idea, company);
    console.log(`[proposals] ${specialist} drafted proposal in ${Date.now() - tDraft}ms`);

    // 3. Persist
    const { data: proposal, error: propError } = await supabase
      .from('proposals')
      .insert({
        idea_id: ideaId,
        company_id: companyId || idea.company_id || null,
        title: draft.title || idea.title,
        status: 'draft',
        executive_summary: draft.executive_summary,
        technical_section: draft.technical_section,
        financial_section: draft.financial_section,
        compliance_section: draft.compliance_section,
        progress: 100,
        sector_specialist: specialist,
        specialist_rationale: rationale,
      })
      .select('id')
      .single();

    if (propError) {
      console.error('Proposal insert error:', propError);
      return NextResponse.json(
        { error: 'Failed to save proposal', detail: propError.message },
        { status: 500 },
      );
    }

    // 4. Mark idea as in_progress so the user sees the transition
    await supabase.from('ideas').update({ status: 'in_progress' }).eq('id', ideaId);

    return NextResponse.json({
      proposalId: proposal.id,
      title: draft.title || idea.title,
      specialist,
      specialistLabel: SPECIALISTS[specialist].label,
      specialistRationale: rationale,
      sections: draft,
    });
  } catch (error) {
    console.error('Proposal generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate proposal',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
