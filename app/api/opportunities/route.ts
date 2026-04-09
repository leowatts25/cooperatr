import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Cooperatr's Opportunity Engine — an expert in EU development finance, Global Gateway procurement, and multilateral development bank programming.

You help European SMEs, NGOs, and contractors identify relevant funding opportunities matched to their sector, geography, and organizational profile.

Your knowledge covers: EU TED procurement portal, EUROPEAID/INTPA, NDICI-Global Europe (€79.5B, 2021–2027), Global Gateway (€400B target by 2027), AECID (Spain's development agency, €592M budget 2024), GIZ, AFD, FCDO, World Bank, IDB, AfDB, COFIDES, ICEX Vives, and FEDES (Spain's new instrument, 2026).

Always respond with a valid JSON array of exactly 4 opportunities. No preamble, no markdown fences, no explanation — raw JSON array only.

Each opportunity must follow this exact schema:
{
  "id": "unique-string",
  "funder": "Full funder name",
  "funderAbbrev": "e.g. AECID",
  "title": "Specific, realistic opportunity title",
  "description": "2-3 sentences describing the opportunity",
  "budgetMin": 50000,
  "budgetMax": 500000,
  "currency": "EUR",
  "deadline": "Q3 2026 or YYYY-MM-DD or Rolling",
  "geographies": ["Country or region"],
  "sectors": ["Matched sector"],
  "matchScore": 87,
  "matchRationale": "1-2 sentences on why this is a strong match",
  "recommendedApproach": "Concrete 2-3 sentence recommended entry strategy",
  "instrumentType": "Grant | Technical Assistance | Loan | PPP | Framework Contract",
  "priorEUExperienceRequired": true
}`;

export async function POST(req: NextRequest) {
  try {
    const profile = await req.json();

    const userPrompt = `Generate 4 EU or multilateral development funding opportunities for the following company:

Name: ${profile.companyName}
Sector: ${profile.sector}
Geography focus: ${profile.geographies?.join(', ') || 'Not specified'}
Organization type: ${profile.organizationType}
Annual revenue: ${profile.revenueRange}
Prior EU contracting experience: ${profile.priorEUExperience ? 'Yes' : 'No'}
Description: ${profile.description || 'Not provided'}

Prioritize opportunities realistic for their size and experience level. If they have no prior EU contracting experience, include at least one entry-level or subcontracting pathway. Include Spanish instruments (AECID, COFIDES, ICEX Vives, FEDES) where relevant given the Andalusian base.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const opportunities = JSON.parse(text);

    return NextResponse.json({ opportunities });
  } catch (error) {
    console.error('Opportunity Engine error:', error);
    return NextResponse.json({ error: 'Failed to generate opportunities' }, { status: 500 });
  }
}
