import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Cooperatr's Compliance Screener — an expert in EU regulatory compliance, sanctions screening, and human rights due diligence.

Assess the given organization across 4 compliance frameworks. Return a valid JSON object — no preamble, no markdown fences:
{
  "sanctions_status": "cleared|flagged|needs_review",
  "sanctions_detail": "Brief assessment of sanctions risk",
  "csddd_status": "cleared|flagged|needs_review",
  "csddd_detail": "Assessment of CSDDD supply chain due diligence readiness",
  "gdpr_status": "cleared|flagged|needs_review",
  "gdpr_detail": "Assessment of data handling and GDPR compliance capacity",
  "hrdd_status": "cleared|flagged|needs_review",
  "hrdd_detail": "Human rights due diligence assessment per UN Guiding Principles",
  "overall_risk": "low|medium|high",
  "risk_summary": "2-3 sentence overall compliance assessment",
  "recommendations": ["Specific action item 1", "Action item 2", "Action item 3"]
}

Base your assessment on:
- Country risk profile (sanctions exposure, governance indicators, human rights record)
- Sector-specific compliance requirements
- Organization role (prime contractors face higher scrutiny than local partners)
- Known risk factors for the region

Be realistic but constructive — flag genuine risks while providing actionable remediation steps.`;

export async function POST(req: NextRequest) {
  try {
    const { partnerId } = await req.json();
    const supabase = createServerClient();

    const { data: partner, error: partnerError } = await supabase
      .from('partners')
      .select('*')
      .eq('id', partnerId)
      .single();

    if (partnerError || !partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    const userPrompt = `Screen the following organization for EU development finance compliance:

Organization: ${partner.name}
Country: ${partner.country || 'Not specified'}
Sector: ${partner.sector || 'Not specified'}
Role: ${partner.role || 'Not specified'}
Website: ${partner.website || 'Not provided'}

Assess across: EU/UN/OFAC/UK sanctions, CSDDD supply chain due diligence, GDPR data handling, and HRDD (UN Guiding Principles).`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const screening = JSON.parse(text);

    // Update partner record
    await supabase.from('partners').update({
      sanctions_status: screening.sanctions_status,
      csddd_status: screening.csddd_status,
      gdpr_status: screening.gdpr_status,
      hrdd_status: screening.hrdd_status,
      overall_risk: screening.overall_risk,
      risk_summary: screening.risk_summary,
      updated_at: new Date().toISOString(),
    }).eq('id', partnerId);

    return NextResponse.json({ screening, partnerId });
  } catch (error) {
    console.error('Partner screening error:', error);
    return NextResponse.json({ error: 'Failed to screen partner' }, { status: 500 });
  }
}
