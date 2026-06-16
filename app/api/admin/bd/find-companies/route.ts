import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { discoverCandidatesForTender } from '@/app/lib/discovery';
import { matchTender } from '@/app/lib/matcher';

// Discovery (~10s) + up to 5 matcher calls (~50s) + expansion can run long, so
// give this route the full Fluid Compute budget rather than the default.
export const maxDuration = 300;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/bd/find-companies
// On-demand "Find companies" for a single verified tender (Step 2). Runs SME
// discovery to populate the candidate pool, then the matcher to score and
// persist (tender × company) pairings. Returns the freshly written matches.
//   body: { tenderId: string }
// ============================================================================
export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: { tenderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.tenderId) {
    return NextResponse.json({ error: 'tenderId required' }, { status: 400 });
  }

  const supabase = createServerClient();

  // Load the tender for discovery input.
  const { data: tender, error: tErr } = await supabase
    .from('tenders')
    .select('id, title, description, donor, buyer, country, sectors, type, value_usd_min, value_usd_max, deadline_at')
    .eq('id', body.tenderId)
    .single();
  if (tErr || !tender) {
    return NextResponse.json({ error: `tender not found: ${tErr?.message || 'no row'}` }, { status: 404 });
  }

  const result = { discovered: 0, inserted: 0, scored: 0, written: 0, errors: [] as string[] };

  // 1) Discovery — find real bidding-capable SMEs for this tender.
  try {
    const disc = await discoverCandidatesForTender(tender as Parameters<typeof discoverCandidatesForTender>[0], supabase);
    result.discovered = disc.candidates.length;
    result.inserted = disc.inserted_company_ids.length;
  } catch (err) {
    result.errors.push(`discovery: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2) Matcher — score the tender against its candidate pool and persist.
  try {
    const out = await matchTender(supabase, body.tenderId, { candidateLimit: 8 });
    result.scored = out.scored;
    result.written = out.written;
    result.errors.push(...out.errors);
  } catch (err) {
    result.errors.push(`match: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json(result);
}
