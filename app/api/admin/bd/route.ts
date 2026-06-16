import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 30;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// GET /api/admin/bd
// Returns scored (tender × scouted_company) pairings for the BD weekly review.
// Filters:
//   - status      one of suggested|reviewed|pursuing|dropped|won|lost (default 'suggested')
//   - warm_only   if 'true', only rows where warm_intro_via_contact_id is not null
//   - limit       defaults to 100, max 500
// Sort: score desc, then matched_at desc
// ============================================================================

interface MatchJoinRow {
  id: string;
  score: number | null;
  rationale: string | null;
  fit_dimensions: Record<string, number> | null;
  partner_stack: string[] | null;
  risks: string[] | null;
  status: string;
  notes: string | null;
  opportunity_expansion: {
    consortium_partners?: string[];
    impact_investors?: string[];
    blended_finance_angle?: string;
    expanded_impact?: string;
  } | null;
  feedback: string | null;
  feedback_signal: string | null;
  feedback_at: string | null;
  warm_intro_via_contact_id: string | null;
  matched_at: string;
  reviewed_at: string | null;
  tender: {
    id: string;
    source: string;
    source_ref: string;
    url: string | null;
    title: string | null;
    donor: string | null;
    buyer: string | null;
    country: string | null;
    sectors: string[] | null;
    value_usd_min: number | null;
    value_usd_max: number | null;
    deadline_at: string | null;
    translations: Record<string, { title?: string; description?: string }> | null;
    source_language: string | null;
    tender_fit_score: number | null;
    tender_fit_verdict: string | null;
    tender_fit_reasons: { sector_fit?: number; geography_fit?: number; deal_band_fit?: number; reasons?: string[] } | null;
  } | null;
  company: {
    id: string;
    name: string;
    country: string | null;
    website: string | null;
    sectors: string[] | null;
    size_band: string | null;
  } | null;
  warm_contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    company_name: string | null;
    linkedin_url: string | null;
  } | null;
}

export async function GET(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createServerClient();
  const resource = req.nextUrl.searchParams.get('resource') || 'matches';

  // ── resource=tenders ──────────────────────────────────────────────────────
  // Drives Step 1 (Verify) and the left column of Step 2 (Match). Lists passing
  // tenders by bd_status, annotated with their tender-fit score/verdict and a
  // match-count / top-score aggregate.
  if (resource === 'tenders') {
    return getTenders(req, supabase);
  }

  // ── resource=matches (default) ────────────────────────────────────────────
  // Drives the Step-2 right column (per-tender ranked companies) and Step 3
  // (pursuing). Supports tender_id, status, and warm-only filters.
  const status = req.nextUrl.searchParams.get('status') || 'suggested';
  const tenderId = req.nextUrl.searchParams.get('tender_id');
  const warmOnly = req.nextUrl.searchParams.get('warm_only') === 'true';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '100', 10) || 100, 500);

  // Aliased FK select pulls the joined rows in one round-trip.
  let query = supabase
    .from('tender_matches')
    .select(
      `id, score, rationale, fit_dimensions, partner_stack, risks, status, notes,
       opportunity_expansion, feedback, feedback_signal, feedback_at,
       warm_intro_via_contact_id, matched_at, reviewed_at,
       tender:tenders (
         id, source, source_ref, url, title, donor, buyer, country, sectors,
         value_usd_min, value_usd_max, deadline_at, translations, source_language,
         tender_fit_score, tender_fit_verdict, tender_fit_reasons
       ),
       company:scouted_companies (
         id, name, country, website, sectors, size_band
       ),
       warm_contact:linkedin_contacts (
         id, first_name, last_name, position, company_name, linkedin_url
       )`,
    )
    .order('score', { ascending: false, nullsFirst: false })
    .order('matched_at', { ascending: false })
    .limit(limit);

  if (tenderId) {
    query = query.eq('tender_id', tenderId);
  }
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (warmOnly) {
    query = query.not('warm_intro_via_contact_id', 'is', null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate counts per status — drives the filter chips on the page.
  const { data: counts, error: cErr } = await supabase
    .from('tender_matches')
    .select('status', { count: 'exact', head: false });
  const byStatus: Record<string, number> = {};
  if (!cErr && counts) {
    for (const row of counts as Array<{ status: string }>) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    }
  }

  return NextResponse.json({
    matches: (data as unknown as MatchJoinRow[]) || [],
    totals: { byStatus, returned: data?.length || 0 },
  });
}

// ----------------------------------------------------------------------------
// Tender listing for the pipeline stage views
// ----------------------------------------------------------------------------

interface TenderListRow {
  id: string;
  source: string;
  source_ref: string;
  url: string | null;
  title: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  sectors: string[] | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
  deadline_at: string | null;
  published_at: string | null;
  translations: Record<string, { title?: string; description?: string }> | null;
  source_language: string | null;
  tender_fit_score: number | null;
  tender_fit_verdict: string | null;
  tender_fit_reasons: { sector_fit?: number; geography_fit?: number; deal_band_fit?: number; reasons?: string[] } | null;
  bd_status: string;
}

async function getTenders(req: NextRequest, supabase: ReturnType<typeof createServerClient>) {
  // stage: pending | verified | rejected. Default 'pending' (Step 1 inbox).
  const stage = req.nextUrl.searchParams.get('stage') || 'pending';
  // By default Step 1 hides 'skip'-verdict tenders (domestic procurement, wrong
  // band, etc.); include_skip=true reveals them so the operator can override.
  const includeSkip = req.nextUrl.searchParams.get('include_skip') === 'true';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '200', 10) || 200, 500);

  let q = supabase
    .from('tenders')
    .select(
      `id, source, source_ref, url, title, donor, buyer, country, sectors,
       value_usd_min, value_usd_max, deadline_at, published_at, translations, source_language,
       tender_fit_score, tender_fit_verdict, tender_fit_reasons, bd_status`,
    )
    .eq('passes_filter', true)
    .order('tender_fit_score', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false })
    .limit(limit);
  if (stage && stage !== 'all') {
    q = q.eq('bd_status', stage);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let tenders = (data as unknown as TenderListRow[]) || [];

  // Step-1 inbox hides 'skip' verdicts unless asked. Null verdict = not yet
  // scored → keep (still needs review).
  if (stage === 'pending' && !includeSkip) {
    tenders = tenders.filter((t) => t.tender_fit_verdict !== 'skip');
  }

  // Match aggregate per tender: count + top score (drives the "N companies"
  // badge and Step-2 readiness).
  const ids = tenders.map((t) => t.id);
  const matchAgg: Record<string, { count: number; topScore: number }> = {};
  if (ids.length > 0) {
    const ID_CHUNK = 100;
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const slice = ids.slice(i, i + ID_CHUNK);
      const { data: ms } = await supabase
        .from('tender_matches')
        .select('tender_id, score')
        .in('tender_id', slice);
      for (const m of (ms || []) as Array<{ tender_id: string; score: number | null }>) {
        const a = (matchAgg[m.tender_id] ||= { count: 0, topScore: 0 });
        a.count += 1;
        a.topScore = Math.max(a.topScore, Math.round(m.score ?? 0));
      }
    }
  }

  const enriched = tenders.map((t) => ({
    ...t,
    match_count: matchAgg[t.id]?.count ?? 0,
    top_score: matchAgg[t.id]?.topScore ?? 0,
  }));

  // Stage counts for the tabs (pending / verified / rejected).
  const byStage: Record<string, number> = {};
  const { data: stageRows } = await supabase
    .from('tenders')
    .select('bd_status')
    .eq('passes_filter', true);
  for (const row of (stageRows || []) as Array<{ bd_status: string }>) {
    byStage[row.bd_status] = (byStage[row.bd_status] || 0) + 1;
  }

  return NextResponse.json({
    tenders: enriched,
    totals: { byStage, returned: enriched.length },
  });
}

// ============================================================================
// PATCH /api/admin/bd
// Update a single match's status / notes / feedback. Used by the Pursue button,
// status dropdown, and the per-match feedback box.
//   body: { matchId: string, status?: string, notes?: string,
//           feedback?: string, feedback_signal?: 'up'|'down'|null }
// Feedback is the recalibration signal: it's surfaced back into the Stage-1
// (tender-fit) and Stage-2 (matcher) prompts on the next run so the operator's
// corrections steer future scoring.
// ============================================================================
export async function PATCH(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: {
    matchId?: string;
    status?: string;
    notes?: string;
    feedback?: string;
    feedback_signal?: 'up' | 'down' | null;
    tenderId?: string;
    bd_status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Tender verify / reject (Step 1) ─────────────────────────────────────────
  // body: { tenderId, bd_status: 'pending'|'verified'|'rejected' }
  if (body.tenderId) {
    const validBd = new Set(['pending', 'verified', 'rejected']);
    if (!body.bd_status || !validBd.has(body.bd_status)) {
      return NextResponse.json({ error: `invalid bd_status: ${body.bd_status}` }, { status: 400 });
    }
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tenders')
      .update({ bd_status: body.bd_status, bd_status_at: new Date().toISOString() })
      .eq('id', body.tenderId)
      .select('id, bd_status, bd_status_at')
      .single();
    if (error) {
      console.error('[bd PATCH] tender update failed', { tenderId: body.tenderId, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tender: data });
  }

  if (!body.matchId) {
    return NextResponse.json({ error: 'matchId or tenderId required' }, { status: 400 });
  }

  const validStatus = new Set(['suggested', 'reviewed', 'pursuing', 'dropped', 'won', 'lost']);
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!validStatus.has(body.status)) {
      return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status !== 'suggested') {
      updates.reviewed_at = new Date().toISOString();
    }
  }
  if (typeof body.notes === 'string') {
    updates.notes = body.notes;
  }

  // Feedback box. Either the free-text, the thumbs signal, or both. Setting any
  // of them stamps feedback_at so the recalibration query can order by recency.
  const hasFeedbackText = typeof body.feedback === 'string';
  const hasFeedbackSignal = body.feedback_signal === 'up' || body.feedback_signal === 'down' || body.feedback_signal === null;
  if (hasFeedbackText || hasFeedbackSignal) {
    if (hasFeedbackText) updates.feedback = body.feedback;
    if (hasFeedbackSignal) updates.feedback_signal = body.feedback_signal;
    updates.feedback_at = new Date().toISOString();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tender_matches')
    .update(updates)
    .eq('id', body.matchId)
    .select('id, status, notes, feedback, feedback_signal, feedback_at, reviewed_at, tender_id, scouted_company_id')
    .single();

  if (error) {
    console.error('[bd PATCH] update failed', { matchId: body.matchId, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ match: data });
}
