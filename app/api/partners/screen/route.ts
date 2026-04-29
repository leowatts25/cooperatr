import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

export const maxDuration = 60;

type Locale = 'en' | 'es';

function languageDirective(locale: Locale): string {
  if (locale === 'es') {
    return `LANGUAGE: Write all detail and summary text in clear, formal European Spanish (Castellano). Keep proper nouns and acronyms (CSDDD, GDPR, OFAC, EU, UN, UK, AECID, NDICI, etc.) in their official form.`;
  }
  return `LANGUAGE: Write in clear, professional English.`;
}

const SYSTEM_PROMPT = `You are Cooperatr's Compliance Screener — an expert in EU regulatory compliance, sanctions screening, and human rights due diligence.

Assess the given organization across 4 compliance frameworks and emit your assessment via the emit_screening tool.

Base your assessment on:
- Country risk profile (sanctions exposure, governance indicators, human rights record)
- Sector-specific compliance requirements
- Organization role (prime contractors face higher scrutiny than local partners)
- Known risk factors for the region

Be realistic but constructive — flag genuine risks while providing actionable remediation steps. Always call emit_screening with the full structured assessment.`;

const screeningTool: Anthropic.Tool = {
  name: 'emit_screening',
  description: 'Emit the compliance screening assessment.',
  input_schema: {
    type: 'object',
    properties: {
      sanctions_status: { type: 'string', enum: ['cleared', 'flagged', 'needs_review'] },
      sanctions_detail: { type: 'string', description: 'Brief assessment of sanctions risk (1-2 sentences)' },
      csddd_status: { type: 'string', enum: ['cleared', 'flagged', 'needs_review'] },
      csddd_detail: { type: 'string', description: 'Assessment of CSDDD supply chain due diligence readiness' },
      gdpr_status: { type: 'string', enum: ['cleared', 'flagged', 'needs_review'] },
      gdpr_detail: { type: 'string', description: 'Assessment of data handling and GDPR compliance capacity' },
      hrdd_status: { type: 'string', enum: ['cleared', 'flagged', 'needs_review'] },
      hrdd_detail: { type: 'string', description: 'Human rights due diligence assessment per UN Guiding Principles' },
      overall_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
      risk_summary: { type: 'string', description: '2-3 sentence overall compliance assessment' },
      recommendations: {
        type: 'array',
        items: { type: 'string' },
        description: '3 specific action items for remediation',
      },
    },
    required: [
      'sanctions_status',
      'csddd_status',
      'gdpr_status',
      'hrdd_status',
      'overall_risk',
      'risk_summary',
    ],
  },
};

interface Screening {
  sanctions_status: 'cleared' | 'flagged' | 'needs_review';
  sanctions_detail?: string;
  csddd_status: 'cleared' | 'flagged' | 'needs_review';
  csddd_detail?: string;
  gdpr_status: 'cleared' | 'flagged' | 'needs_review';
  gdpr_detail?: string;
  hrdd_status: 'cleared' | 'flagged' | 'needs_review';
  hrdd_detail?: string;
  overall_risk: 'low' | 'medium' | 'high';
  risk_summary: string;
  recommendations?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const { partnerId, locale: rawLocale } = await req.json();
    const locale: Locale = rawLocale === 'es' ? 'es' : 'en';

    if (!partnerId) {
      return NextResponse.json({ error: 'partnerId is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (partnerError || !partner) {
      console.error('[partner-screen] partner fetch failed:', partnerError);
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const userPrompt = `Screen the following organization for EU development finance compliance:

Organization: ${partner.name}
Country: ${partner.country || 'Not specified'}
Sector: ${partner.sector || 'Not specified'}
Role: ${partner.role || 'Not specified'}
Website: ${partner.website || 'Not provided'}

Assess across: EU/UN/OFAC/UK sanctions, CSDDD supply chain due diligence, GDPR data handling, and HRDD (UN Guiding Principles). Call emit_screening with the full assessment.`;

    const t0 = Date.now();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `${SYSTEM_PROMPT}\n\n${languageDirective(locale)}`,
      tools: [screeningTool],
      tool_choice: { type: 'tool', name: 'emit_screening' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    console.log(`[partner-screen] Anthropic responded in ${Date.now() - t0}ms, stop=${response.stop_reason}`);

    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      console.error('[partner-screen] no tool_use block in response');
      return NextResponse.json(
        { error: 'Screening returned no structured output. Please retry.' },
        { status: 502 },
      );
    }

    const screening = toolBlock.input as Screening;

    const { error: updateError } = await supabase
      .from('partners')
      .update({
        sanctions_status: screening.sanctions_status,
        sanctions_detail: screening.sanctions_detail || null,
        csddd_status: screening.csddd_status,
        csddd_detail: screening.csddd_detail || null,
        gdpr_status: screening.gdpr_status,
        gdpr_detail: screening.gdpr_detail || null,
        hrdd_status: screening.hrdd_status,
        hrdd_detail: screening.hrdd_detail || null,
        overall_risk: screening.overall_risk,
        risk_summary: screening.risk_summary,
        recommendations: screening.recommendations || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId);

    if (updateError) {
      console.error('[partner-screen] DB update failed:', updateError);
      return NextResponse.json(
        { error: 'Screening completed but DB update failed', detail: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ screening, partnerId });
  } catch (error) {
    console.error('[partner-screen] error:', error);
    return NextResponse.json(
      {
        error: 'Failed to screen partner',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
