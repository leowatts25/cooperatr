import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { matchSectors, type SectorRow } from '@/app/lib/ingesters/filter';

export const maxDuration = 120;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/linkedin/enrich-from-positions
//
// One-shot enrichment for auto-promoted scouted_companies. Without this step
// every auto-promoted row has empty sectors[], so the matcher's retrieval
// can't discriminate between them and falls back to alphabetical order —
// producing the same 5 "first-letter" candidates for every tender.
//
// What it does:
//   1. Load every scouted_companies row where discovered_via='linkedin_import'
//      (the ~1,070 promoted from the admin's LinkedIn network)
//   2. For each, collect the company name + all linked linkedin_contacts'
//      position strings into one blob
//   3. Run the existing sector-keyword filter (same one the TED ingester
//      uses) against the blob
//   4. Update scouted_companies.sectors[] with any matched sector slugs
//
// Position text is genuinely informative — "Senior Renewable Energy Advisor"
// is a strong sector signal, "Country Director" is not. The keyword filter
// is conservative; companies whose positions don't hit any keywords keep
// empty sectors[] (the matcher will still surface them as warm intros but
// won't prioritize them).
//
// Idempotent: re-running with the same data produces the same sectors[].
// Returns: { processed, enriched, unchanged, errors, top_sector_counts }
// ============================================================================

interface ScoutedRow {
  id: string;
  name: string;
  sectors: string[] | null;
}

interface ContactPositionRow {
  scouted_company_id: string;
  position: string | null;
}

export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createServerClient();

  // ---- Load active sector config (slug + keywords) ----
  const { data: sectorsData, error: sErr } = await supabase
    .from('sectors')
    .select('slug, label, keywords, active')
    .eq('active', true);
  if (sErr) {
    return NextResponse.json({ error: `load sectors: ${sErr.message}` }, { status: 500 });
  }
  const sectors = (sectorsData || []) as SectorRow[];

  // ---- Paginate scouted_companies (auto-promoted only) ----
  const PAGE = 1000;
  const scouted: ScoutedRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('scouted_companies')
      .select('id, name, sectors')
      .eq('discovered_via', 'linkedin_import')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: `load scouted page ${offset}: ${error.message}` }, { status: 500 });
    }
    const page = (data || []) as ScoutedRow[];
    scouted.push(...page);
    if (page.length < PAGE) break;
  }

  // ---- Paginate linkedin_contacts.position ----
  const positionsByScoutedId = new Map<string, string[]>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('linkedin_contacts')
      .select('scouted_company_id, position')
      .not('scouted_company_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: `load contacts page ${offset}: ${error.message}` }, { status: 500 });
    }
    const page = (data || []) as ContactPositionRow[];
    for (const row of page) {
      if (!row.scouted_company_id) continue;
      const arr = positionsByScoutedId.get(row.scouted_company_id) || [];
      if (row.position && row.position.trim()) arr.push(row.position.trim());
      positionsByScoutedId.set(row.scouted_company_id, arr);
    }
    if (page.length < PAGE) break;
  }

  // ---- Classify each company and queue updates ----
  let enriched = 0;
  let unchanged = 0;
  const errors: string[] = [];
  const sectorCounts: Record<string, number> = {};

  // Chunk updates: Supabase doesn't expose UPDATE...VALUES syntax, so we issue
  // one update per row. With ~1,000 rows that's slow but acceptable for a
  // one-shot job. Cap concurrency to avoid REST throttling.
  const CONCURRENCY = 10;
  const queue = [...scouted];
  let active = 0;
  let done = 0;

  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < CONCURRENCY && queue.length > 0) {
        const row = queue.shift()!;
        active += 1;
        (async () => {
          const positions = positionsByScoutedId.get(row.id) || [];
          const blob = [row.name, ...positions].join(' \n ');
          const matched = matchSectors(blob, sectors);
          if (matched.length === 0) {
            unchanged += 1;
          } else {
            const existing = new Set((row.sectors || []).map((s) => s.toLowerCase()));
            const newSet = new Set([...existing, ...matched]);
            if (newSet.size === existing.size) {
              unchanged += 1;
            } else {
              const sectorsList = Array.from(newSet);
              const { error } = await supabase
                .from('scouted_companies')
                .update({ sectors: sectorsList, updated_at: new Date().toISOString() })
                .eq('id', row.id);
              if (error) {
                errors.push(`${row.name}: ${error.message}`);
              } else {
                enriched += 1;
                for (const s of matched) sectorCounts[s] = (sectorCounts[s] || 0) + 1;
              }
            }
          }
          active -= 1;
          done += 1;
          if (queue.length > 0) {
            next();
          } else if (active === 0) {
            resolve();
          }
        })().catch((err) => {
          errors.push(`${row.name}: ${err instanceof Error ? err.message : String(err)}`);
          active -= 1;
          done += 1;
          if (active === 0 && queue.length === 0) resolve();
        });
      }
    };
    next();
  });

  return NextResponse.json({
    processed: done,
    enriched,
    unchanged,
    top_sector_counts: sectorCounts,
    errors,
  });
}
