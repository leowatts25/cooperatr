import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Cooperatr's Proposal Writer — an expert in EU development finance proposal writing with deep knowledge of EU evaluation criteria, logframe methodology, and donor-specific requirements.

Generate a complete proposal draft with 4 sections. Each section should be detailed, professional, and tailored to the specific funder and opportunity.

Return a valid JSON object with this schema — no preamble, no markdown fences:
{
  "executive_summary": "2-3 paragraphs summarizing the project rationale, approach, and expected impact",
  "technical_section": "Detailed technical approach including: objectives, methodology, results framework (logframe-style), work packages, and implementation timeline",
  "financial_section": "Budget breakdown by work package including: personnel, travel, equipment, subcontracting, indirect costs, and contingency. Include total and per-work-package subtotals",
  "compliance_section": "Address relevant compliance frameworks: CSDDD, GDPR, environmental safeguards, gender mainstreaming, and human rights due diligence as relevant to the funder"
}

Write in professional EU proposal language. Reference the specific funder's known evaluation criteria. Include concrete deliverables and measurable indicators.`;

export async function POST(req: NextRequest) {
  try {
    const { opportunityId, companyId } = await req.json();
    const supabase = createServerClient();

    const [oppResult, compResult] = await Promise.all([
      supabase.from('opportunities').select('*').eq('id', opportunityId).single(),
      supabase.from('companies').select('*').eq('id', companyId).single(),
    ]);

    const opportunity = oppResult.data;
    const company = compResult.data;

    if (!opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const userPrompt = `Generate a complete proposal for the following opportunity and company:

OPPORTUNITY:
- Title: ${opportunity.title}
- Funder: ${opportunity.funder} (${opportunity.funder_abbrev})
- Instrument: ${opportunity.instrument_type}
- Budget: €${opportunity.budget_min} - €${opportunity.budget_max}
- Deadline: ${opportunity.deadline}
- Geographies: ${opportunity.geographies?.join(', ')}
- Sectors: ${opportunity.sectors?.join(', ')}
- Description: ${opportunity.description}
- Recommended approach: ${opportunity.recommended_approach}

COMPANY:
- Name: ${company?.name || 'Unknown'}
- Sector: ${company?.sector || 'Unknown'}
- Type: ${company?.organization_type || 'SME'}
- Revenue: ${company?.revenue_range || 'Not specified'}
- Prior EU experience: ${company?.prior_eu_experience ? 'Yes' : 'No'}
- Description: ${company?.description || 'Not provided'}

Tailor the proposal to the company's experience level. If they have no prior EU experience, emphasize their technical expertise and include consortium/partnership elements to strengthen the bid.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const sections = JSON.parse(text);

    // Create proposal in DB
    const { data: proposal, error: propError } = await supabase
      .from('proposals')
      .insert({
        opportunity_id: opportunityId,
        company_id: companyId,
        title: opportunity.title,
        status: 'draft',
        executive_summary: sections.executive_summary,
        technical_section: sections.technical_section,
        financial_section: sections.financial_section,
        compliance_section: sections.compliance_section,
        progress: 100,
      })
      .select('id')
      .single();

    if (propError) {
      console.error('Proposal insert error:', propError);
      return NextResponse.json({ error: 'Failed to save proposal' }, { status: 500 });
    }

    // Update opportunity status
    await supabase.from('opportunities').update({ status: 'proposal_started' }).eq('id', opportunityId);

    return NextResponse.json({
      proposalId: proposal.id,
      title: opportunity.title,
      sections,
    });
  } catch (error) {
    console.error('Proposal generation error:', error);
    return NextResponse.json({ error: 'Failed to generate proposal' }, { status: 500 });
  }
}
