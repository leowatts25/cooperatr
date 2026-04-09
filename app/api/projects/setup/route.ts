import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Cooperatr's Project Advisor — an expert in international development project management, EU-funded program delivery, and milestone planning.

Given a proposal's details, generate a realistic project setup with milestones and timeline.

Your knowledge covers: EU project cycle management, logframe methodology, Global Gateway implementation frameworks, AECID reporting cycles, GIZ/KfW disbursement schedules, and World Bank procurement timelines.

Return a valid JSON object with this schema — no preamble, no markdown fences:
{
  "milestones": [
    {
      "title": "Milestone name",
      "description": "What this milestone involves",
      "due_date": "YYYY-MM-DD",
      "sort_order": 0
    }
  ],
  "suggested_indicators": [
    {
      "name": "Indicator name",
      "category": "output|outcome|impact",
      "target_value": 100,
      "unit": "people|hectares|kWh|EUR|units|percentage",
      "reporting_period": "monthly|quarterly|annual"
    }
  ],
  "budget_total": 250000,
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD"
}

Generate 6-10 milestones covering: inception/kick-off, baseline assessment, implementation phases, mid-term review, final evaluation, and closeout. Generate 4-8 relevant indicators.`;

export async function POST(req: NextRequest) {
  try {
    const { proposalId, companyId } = await req.json();
    const supabase = createServerClient();

    // Fetch proposal and related opportunity
    const { data: proposal, error: propError } = await supabase
      .from('proposals')
      .select('*, opportunities(*)')
      .eq('id', proposalId)
      .single();

    if (propError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    // Fetch company
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    const opportunity = proposal.opportunities;

    const userPrompt = `Generate a project setup for the following awarded proposal:

Title: ${proposal.title}
Funder: ${opportunity?.funder || 'Unknown'}
Budget range: €${opportunity?.budget_min || 0} - €${opportunity?.budget_max || 0}
Geographies: ${opportunity?.geographies?.join(', ') || 'Not specified'}
Sectors: ${opportunity?.sectors?.join(', ') || 'Not specified'}
Company: ${company?.name || 'Unknown'} (${company?.sector || 'Unknown sector'})
Company experience: ${company?.prior_eu_experience ? 'Has prior EU experience' : 'First-time EU contractor'}

Technical approach summary: ${proposal.technical_section?.substring(0, 500) || 'Not available'}

Generate realistic milestones for an 18-24 month implementation period starting 3 months from now. Include indicators that align with the project's sector and funder requirements.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const setup = JSON.parse(text);

    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        proposal_id: proposalId,
        company_id: companyId,
        title: proposal.title,
        funder: opportunity?.funder || null,
        status: 'setup',
        budget_total: setup.budget_total || opportunity?.budget_max || 0,
        budget_spent: 0,
        start_date: setup.start_date || null,
        end_date: setup.end_date || null,
        geographies: opportunity?.geographies || [],
      })
      .select('id')
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    // Insert milestones
    if (setup.milestones?.length > 0) {
      const milestoneRows = setup.milestones.map((m: Record<string, unknown>, i: number) => ({
        project_id: project.id,
        title: m.title,
        description: m.description,
        due_date: m.due_date,
        status: 'pending',
        sort_order: m.sort_order ?? i,
      }));

      await supabase.from('milestones').insert(milestoneRows);
    }

    // Insert indicators
    if (setup.suggested_indicators?.length > 0) {
      const indicatorRows = setup.suggested_indicators.map((ind: Record<string, unknown>) => ({
        project_id: project.id,
        name: ind.name,
        category: ind.category,
        target_value: ind.target_value,
        current_value: 0,
        unit: ind.unit,
        reporting_period: ind.reporting_period,
      }));

      await supabase.from('indicators').insert(indicatorRows);
    }

    // Update proposal status
    await supabase
      .from('proposals')
      .update({ status: 'submitted' })
      .eq('id', proposalId);

    return NextResponse.json({
      projectId: project.id,
      milestones: setup.milestones,
      indicators: setup.suggested_indicators,
      budget_total: setup.budget_total,
      start_date: setup.start_date,
      end_date: setup.end_date,
    });
  } catch (error) {
    console.error('Project setup error:', error);
    return NextResponse.json({ error: 'Failed to set up project' }, { status: 500 });
  }
}
