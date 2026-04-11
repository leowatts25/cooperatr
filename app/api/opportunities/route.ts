import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Cooperatr's Opportunity Engine — an expert in EU development finance, Global Gateway procurement, and multilateral development bank programming.

You help European SMEs, NGOs, and contractors identify relevant funding opportunities matched to their sector, geography, and organizational profile.

Your knowledge covers: EU TED procurement portal, EUROPEAID/INTPA, NDICI-Global Europe (€79.5B, 2021–2027), Global Gateway (€400B target by 2027), AECID (Spain's development agency, €592M budget 2024), GIZ, AFD, FCDO, World Bank, IDB, AfDB, COFIDES, ICEX Vives, and FEDES (Spain's new instrument, 2026).

When matching opportunities, consider:
- Company size and revenue to calibrate budget ranges appropriately
- Prior EU experience level to determine entry pathways vs advanced procurement
- Geographic focus to match with active donor programming in those regions
- Sector expertise to align with specific instrument windows and calls

For Andalusian companies, prioritize Spanish instruments (AECID, COFIDES, ICEX Vives, FEDES) and highlight the region's strengths in solar energy, agri-food, water technology, and circular economy.

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
    const supabase = createServerClient();

    // 1. Insert company profile
    let companyId = '';
    try {
      const { data: inserted, error: insertError } = await supabase
        .from('companies')
        .insert({
          name: profile.companyName,
          sector: profile.sector,
          organization_type: profile.organizationType,
          revenue_range: profile.revenueRange || null,
          prior_eu_experience: profile.priorEUExperience || false,
          description: profile.description || null,
          geographies: profile.geographies || [],
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Company insert error:', insertError);
      } else {
        companyId = inserted.id;
      }
    } catch (dbErr) {
      console.error('Company DB error:', dbErr);
    }

    // 2. Generate opportunities via Claude
    const userPrompt = `Generate 4 EU or multilateral development funding opportunities for the following company:

Name: ${profile.companyName}
Sector: ${profile.sector}
Geography focus: ${profile.geographies?.join(', ') || 'Not specified'}
Organization type: ${profile.organizationType}
Annual revenue: ${profile.revenueRange || 'Not specified'}
Prior EU contracting experience: ${profile.priorEUExperience ? 'Yes' : 'No'}
Description: ${profile.description || 'Not provided'}

Prioritize opportunities realistic for their size and experience level. If they have no prior EU contracting experience, include at least one entry-level or subcontracting pathway. Include Spanish instruments (AECID, COFIDES, ICEX Vives, FEDES) where relevant given the Andalusian base.

Make each opportunity specific and actionable — reference real instruments, realistic budget ranges, and concrete entry strategies.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract the JSON array from the response — tolerates markdown fences and stray prose
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Model did not return a JSON array: ' + raw.slice(0, 200));
    }
    const opportunities = JSON.parse(raw.slice(start, end + 1));

    // 3. Persist opportunities to database
    if (companyId && opportunities.length > 0) {
      const rows = opportunities.map((opp: Record<string, unknown>) => ({
        company_id: companyId,
        funder: opp.funder,
        funder_abbrev: opp.funderAbbrev,
        title: opp.title,
        description: opp.description,
        budget_min: opp.budgetMin,
        budget_max: opp.budgetMax,
        currency: opp.currency || 'EUR',
        deadline: opp.deadline,
        geographies: opp.geographies || [],
        sectors: opp.sectors || [],
        match_score: opp.matchScore,
        match_rationale: opp.matchRationale,
        recommended_approach: opp.recommendedApproach,
        instrument_type: opp.instrumentType,
        prior_eu_experience_required: opp.priorEUExperienceRequired || false,
        status: 'new',
      }));

      const { data: savedOpps, error: oppsError } = await supabase
        .from('opportunities')
        .insert(rows)
        .select('id');

      if (oppsError) {
        console.error('Opportunities insert error:', oppsError);
      }

      // Attach DB IDs to the response
      if (savedOpps) {
        opportunities.forEach((opp: Record<string, unknown>, i: number) => {
          if (savedOpps[i]) {
            opp.dbId = savedOpps[i].id;
          }
        });
      }
    }

    return NextResponse.json({
      opportunities,
      companyId: companyId || null,
    });
  } catch (error) {
    console.error('Opportunity Engine error:', error instanceof Error ? error.message : error);
    console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error as object)));
    return NextResponse.json({ error: 'Failed to generate opportunities', detail: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

// GET: Retrieve saved opportunities for a company
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const companyId = req.nextUrl.searchParams.get('companyId');
    const status = req.nextUrl.searchParams.get('status');

    let query = supabase
      .from('opportunities')
      .select('*')
      .order('created_at', { ascending: false });

    if (companyId) {
      query = query.eq('company_id', companyId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ opportunities: data });
  } catch (error) {
    console.error('Get opportunities error:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 });
  }
}

// PATCH: Update opportunity status (save/dismiss)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id, status } = await req.json();

    const { error } = await supabase
      .from('opportunities')
      .update({ status })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update opportunity error:', error);
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 });
  }
}
