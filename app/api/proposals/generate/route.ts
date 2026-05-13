import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';
import {
  getRelevantPatterns,
  profileToRetrievalOptions,
  type PatternContext,
} from '@/app/lib/corpus';

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

Write a substantive, professional EU/DFI-grade section. No placeholders, no "TBD", no generic filler. Use specific numbers, named standards, and realistic timelines. Reference the specific funder(s) from the idea and their known evaluation criteria where appropriate.

CRITICAL: Target 1500-2500 characters per section. Be dense and concrete, not verbose. Call emit_section immediately with the full content — do not write any preamble, reasoning, or acknowledgement before the tool call.`;

type Locale = 'en' | 'es';

function languageDirective(locale: Locale): string {
  if (locale === 'es') {
    return `LANGUAGE: Write the entire section in clear, formal European Spanish (Castellano). Use the technical vocabulary expected in EU and AECID development finance proposals. Keep proper nouns, funder names, and standard acronyms (CSDDD, GDPR, EFSD+, AECID, NDICI, etc.) in their official form. Currency in EUR.`;
  }
  return `LANGUAGE: Write the entire section in clear, professional English suitable for EU and DFI proposal evaluation. Currency in EUR.`;
}

type SectionKey =
  | 'executive_summary'
  | 'technical_section'
  | 'financial_section'
  | 'compliance_section';

const SECTION_BRIEFS: Record<SectionKey, { label: string; instructions: string }> = {
  executive_summary: {
    label: 'Executive Summary',
    instructions: `Write a tight 2-3 paragraph executive summary covering: project rationale, the proposed approach, expected impact with 3-4 measurable indicators, and why this specific funder is the right fit. Open with a single punchy sentence that names the outcome. Target 1500-2200 characters.`,
  },
  technical_section: {
    label: 'Technical Approach',
    // Trimmed: the prior version asked for 4 separate structures (SMART
    // objectives + 6+ logframe indicators + 3 work packages + quarterly
    // timeline) which in Spanish reliably exceeded max_tokens=4000 and
    // truncated the tool_use into empty content. Indicators now live inside
    // the work-package deliverables.
    instructions: `Write a dense technical approach with: 3 SMART objectives, 3 work packages (each with activities, lead partner, 2-3 measurable deliverables), and a quarterly milestone timeline for 18-36 months. Use bullet structure. Be concise — every bullet under 25 words. Target 1800-2500 characters.`,
  },
  financial_section: {
    label: 'Financial Plan',
    instructions: `Write a budget narrative by work package with concrete EUR line items (personnel with FTE+rate, equipment, travel, subcontracting, indirect, contingency). Give per-WP subtotals + grand total + co-financing split. Numbers must be plausible for the company's revenue band. Target 1800-2500 characters.`,
  },
  compliance_section: {
    label: 'Compliance & ESG',
    instructions: `Write a compliance and ESG section covering: CSDDD readiness, GDPR posture, environmental safeguards aligned to the funder's ESS, gender mainstreaming with actions and indicators, HRDD, and sector-specific regulatory items. Name the standards explicitly. Target 1500-2200 characters.`,
  },
};

function sectionTool(section: SectionKey): Anthropic.Tool {
  return {
    name: 'emit_section',
    description: `Emit the ${SECTION_BRIEFS[section].label} section.`,
    input_schema: {
      type: 'object',
      properties: {
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
  locale: Locale,
  corpusContext: PatternContext | null,
): Promise<{ content: string }> {
  const spec = SPECIALISTS[specialist];
  const brief = SECTION_BRIEFS[section];

  // Structured system: stable specialty block (BASE + locale + specialty +
  // optional corpus scaffolds) is identical across all 4 parallel section
  // drafts in this request, so prompt-cache it. The per-section instruction
  // stays uncached because it differs per call.
  const stableBlock = `${BASE_SPECIALIST_PROMPT}\n\n${languageDirective(locale)}\n\n## Your specialty: ${spec.label}\n${spec.guidance}${
    corpusContext && corpusContext.formatted ? '\n\n' + corpusContext.formatted : ''
  }`;
  const system: Array<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
  }> = [
    {
      type: 'text',
      text: stableBlock,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `## Your task right now: ${brief.label}\n${brief.instructions}`,
    },
  ];

  const userPrompt = `${context}\n\nDraft the ${brief.label} now. Tailor to the company's experience level; if prior EU experience is "No", lean on consortium/partnership framing to de-risk the bid.${
    corpusContext && corpusContext.formatted
      ? ' If reference patterns are provided above, mirror their structural shape, signaling phrases, and compliance scaffolds — but adapt every detail to THIS company and this opportunity. Never copy reference prose verbatim.'
      : ''
  }`;

  const t0 = Date.now();
  // 5000 gives a small headroom over the previous 4000 cap; in Spanish the
  // technical section reliably ran 3500-4500 tokens which truncated the
  // tool_use into empty content.
  const MAX_TOKENS = 5000;
  let response;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_TOKENS,
      system: system as Anthropic.Messages.MessageCreateParams['system'],
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
        max_tokens: MAX_TOKENS,
        system: system as Anthropic.Messages.MessageCreateParams['system'],
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
  const out = toolBlock.input as { content?: string };
  // Guard against silent truncation: when stop_reason=max_tokens, the model
  // didn't get to close the JSON, so input.content arrives empty or undefined
  // and the proposal would persist with a blank section.
  if (!out.content || out.content.trim().length < 50) {
    throw new Error(
      `Section ${section} came back empty (stop=${response.stop_reason}, out_tokens=${response.usage?.output_tokens}). The model likely hit max_tokens before closing the tool call.`,
    );
  }
  return { content: out.content };
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
  locale: Locale,
  corpusContext: PatternContext | null,
): Promise<ProposalDraft> {
  const context = buildSpecialistContext(idea, company);

  const sections: SectionKey[] = [
    'executive_summary',
    'technical_section',
    'financial_section',
    'compliance_section',
  ];

  const t0 = Date.now();
  const results = await Promise.all(
    sections.map((s) => draftSection(s, specialist, context, locale, corpusContext)),
  );
  console.log(`[proposals] 4 parallel sections completed in ${Date.now() - t0}ms`);

  const [exec, tech, fin, comp] = results;
  return {
    title: (idea.title as string) || 'Proposal',
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
    const { ideaId, companyId, locale: rawLocale } = await req.json();
    const locale: Locale = rawLocale === 'es' ? 'es' : 'en';

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

    // 1b. Retrieve corpus patterns ONCE per proposal. Same retrieval scaffolds
    //     all 4 parallel section drafts (exec / tech / fin / compliance) — the
    //     stable system block is prompt-cached so sections 2-4 read from cache.
    //     Match on the routed sector (more accurate than the company sector
    //     when the idea pulls the project into a different domain) plus the
    //     company geography. Donor focus is pulled best-effort from the idea's
    //     funding paths so retrieval can prefer matching-funder patterns.
    let corpusContext: PatternContext | null = null;
    try {
      const fundingPaths = Array.isArray(idea.funding_paths)
        ? (idea.funding_paths as Array<Record<string, unknown>>)
        : [];
      // Pull donor tokens from funding-path names ('AECID', 'GCF', 'USAID' etc.)
      const donorFocus = Array.from(
        new Set(
          fundingPaths
            .map((fp) => String(fp?.name || ''))
            .flatMap((n) =>
              n
                .toUpperCase()
                .match(/\b(USAID|AECID|EU-NDICI|NDICI|GCF|GEF|EIB|EBRD|EFSD|AFD|GIZ|KFW|WORLD BANK|IDB|AFDB|IFAD|UNDP|UNICEF|UNOPS|WFP|COFIDES|FEDES|DFC|MCC)\b/g) || [],
            )
            .map((s) => s.replace(/\s+/g, '-')),
        ),
      );

      const retrievalOpts = profileToRetrievalOptions({
        sector: specialist, // routed specialist > raw company sector
        geographies: Array.isArray(company?.geographies)
          ? (company?.geographies as string[])
          : undefined,
        donor_focus: donorFocus.length > 0 ? donorFocus : undefined,
        locale,
      });
      corpusContext = await getRelevantPatterns({
        ...retrievalOpts,
        side: 'bidder', // M2 wants bidder-side scaffolds to draft from
      });
      console.log(
        `[corpus] retrieved ${corpusContext.total_retrieved} patterns via ${corpusContext.retrieval_strategy}; donor_focus=[${donorFocus.join(',')}]; ids=${corpusContext.pattern_ids.join(',')}`,
      );
      if (corpusContext.total_retrieved === 0) corpusContext = null;
    } catch (err) {
      console.warn(
        '[corpus] retrieval failed, drafting without scaffolds:',
        err instanceof Error ? err.message : err,
      );
      corpusContext = null;
    }

    // 2. Specialist drafts the full proposal
    const tDraft = Date.now();
    const draft = await draftProposal(specialist, idea, company, locale, corpusContext);
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

    // The idea stays at status='saved' — the link to the proposal lives in
    // the `proposals.idea_id` column. Flipping status to 'in_progress' here
    // used to drop the idea out of the Saved tab (which filters status=saved),
    // making it look like Start Proposal had deleted the opportunity.

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
