import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 60;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/linkedin/promote-to-scouted
//
// One-shot. Bridges linkedin_contacts → scouted_companies so the matcher's
// warm-intro path receives signal.
//
// Without this step, every imported LinkedIn contact has
// scouted_company_id = NULL, and the matcher's retrieval filters out NULL
// rows, meaning zero warm-intro candidates.
//
// What it does, idempotently:
//   1. Group linkedin_contacts by NORMALIZED company_name
//   2. For each distinct company that doesn't already have a scouted_companies
//      row, insert one with discovered_via='linkedin_import' and an empty
//      sectors[] (the auto-promoted rows start sector-less; enrichment is a
//      separate concern). The display name is the most-common original-case
//      spelling.
//   3. For every linkedin_contact whose scouted_company_id is NULL, set it
//      to the matching scouted_companies.id.
//
// Idempotent: safe to re-run after a new LinkedIn import — only new unique
// companies become scouted_companies, only contacts with NULL
// scouted_company_id get linked.
//
// Returns: { unique_companies, promoted, linked, skipped, errors }
// ============================================================================

interface ContactRow {
  id: string;
  company_name: string;
  scouted_company_id: string | null;
}

interface ScoutedRow {
  id: string;
  name: string;
}

// Light normalization to dedupe LinkedIn company-name variants:
//   - lowercase + trim
//   - strip leading "the "
//   - strip common corporate suffixes (s.a., s.l., gmbh, inc, ltd, llc, group, …)
//   - collapse whitespace + drop trailing punctuation
//
// We don't go further (Levenshtein, embeddings) — getting 80% dedupe at
// near-zero cost is the right tradeoff for v1.
function normalizeCompanyName(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^the\s+/, '');
  // Strip corporate suffixes from the end (only the LAST one — most names
  // have at most one of these).
  s = s.replace(
    /[,\s]+(s\.?a\.?|s\.?l\.?|s\.?l\.?u\.?|gmbh|ag|kg|s\.?p\.?a\.?|n\.?v\.?|b\.?v\.?|ltd|llc|inc|plc|group|holding|holdings|company|co|corp|corporation|llp|llp\.|llp,|llp,)\.?$/i,
    '',
  );
  s = s.replace(/[.,]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createServerClient();

  // ---- Load all linkedin_contacts with a company_name ----
  // Supabase REST caps a single SELECT response (max-rows default 1000), so
  // `.limit(10000)` silently returns at most 1000. Paginate with .range() to
  // catch everything.
  const PAGE = 1000;
  const contacts: ContactRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: cErr } = await supabase
      .from('linkedin_contacts')
      .select('id, company_name, scouted_company_id')
      .not('company_name', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (cErr) {
      return NextResponse.json({ error: `load contacts page ${offset}: ${cErr.message}` }, { status: 500 });
    }
    const page = (data || []) as ContactRow[];
    contacts.push(...page);
    if (page.length < PAGE) break;
  }

  // ---- Group by normalized company_name ----
  // For each group, also pick the most-frequent original-case spelling as the
  // display name (e.g. "Iberdrola" vs "iberdrola s.a." vs "Iberdrola Group" —
  // we prefer the cleanest variant by count, breaking ties on length).
  const groups = new Map<string, { displayName: string; count: number; contacts: ContactRow[] }>();
  const displayVotes = new Map<string, Map<string, number>>();

  for (const row of contacts) {
    if (!row.company_name || !row.company_name.trim()) continue;
    const key = normalizeCompanyName(row.company_name);
    if (!key) continue;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.contacts.push(row);
    } else {
      groups.set(key, { displayName: row.company_name.trim(), count: 1, contacts: [row] });
    }

    // Track display-name votes per normalized key
    if (!displayVotes.has(key)) displayVotes.set(key, new Map());
    const votes = displayVotes.get(key)!;
    const variant = row.company_name.trim();
    votes.set(variant, (votes.get(variant) || 0) + 1);
  }

  // Resolve display names: most-voted variant wins, ties broken by shortest
  for (const [key, group] of groups.entries()) {
    const votes = displayVotes.get(key);
    if (!votes) continue;
    let best = group.displayName;
    let bestCount = 0;
    for (const [variant, count] of votes.entries()) {
      if (count > bestCount || (count === bestCount && variant.length < best.length)) {
        best = variant;
        bestCount = count;
      }
    }
    group.displayName = best;
  }

  // ---- Load existing scouted_companies once so we don't re-insert ----
  // Same pagination story as contacts — the table will grow past 1000 once
  // we've onboarded a real network, and `.limit(10000)` would silently cap.
  const existingScouted: ScoutedRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error: sErr } = await supabase
      .from('scouted_companies')
      .select('id, name')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (sErr) {
      return NextResponse.json({ error: `load scouted page ${offset}: ${sErr.message}` }, { status: 500 });
    }
    const page = (data || []) as ScoutedRow[];
    existingScouted.push(...page);
    if (page.length < PAGE) break;
  }

  const errors: string[] = [];

  // ---- Defensive dedupe of existing scouted_companies ----
  // Earlier buggy runs (before this endpoint paginated correctly) may have
  // inserted multiple scouted_companies rows for the same normalized name.
  // Merge them: pick the canonical (smallest id, stable), re-point contacts
  // to canonical, delete the dupes. Idempotent if there are no dupes.
  const dupeGroups = new Map<string, ScoutedRow[]>();
  for (const row of existingScouted) {
    if (!row.name) continue;
    const key = normalizeCompanyName(row.name);
    if (!key) continue;
    const arr = dupeGroups.get(key) || [];
    arr.push(row);
    dupeGroups.set(key, arr);
  }

  let mergedRows = 0;
  let mergedContacts = 0;
  for (const [, rows] of dupeGroups.entries()) {
    if (rows.length < 2) continue;
    // Sort by id for stable canonical selection
    rows.sort((a, b) => a.id.localeCompare(b.id));
    const canonical = rows[0];
    const dupes = rows.slice(1);
    const dupeIds = dupes.map((r) => r.id);

    // Re-point contacts pointing at dupes → canonical
    const { error: upErr, count } = await supabase
      .from('linkedin_contacts')
      .update({ scouted_company_id: canonical.id }, { count: 'exact' })
      .in('scouted_company_id', dupeIds);
    if (upErr) {
      errors.push(`dedupe re-point ${canonical.name}: ${upErr.message}`);
      continue;
    }
    mergedContacts += count ?? 0;

    // Delete the duplicate scouted_companies rows
    const { error: delErr } = await supabase
      .from('scouted_companies')
      .delete()
      .in('id', dupeIds);
    if (delErr) {
      errors.push(`dedupe delete ${canonical.name}: ${delErr.message}`);
      continue;
    }
    mergedRows += dupeIds.length;
  }

  // Build a lookup: normalized name → scouted_companies.id (using canonical after dedupe)
  const scoutedIdByKey = new Map<string, string>();
  for (const [key, rows] of dupeGroups.entries()) {
    if (rows.length === 0) continue;
    // After dedupe the canonical is rows[0] (smallest id)
    rows.sort((a, b) => a.id.localeCompare(b.id));
    scoutedIdByKey.set(key, rows[0].id);
  }

  // ---- Insert scouted_companies for every group that doesn't already exist ----
  const toInsert: Array<{ name: string; discovered_via: string; description: string | null }> = [];
  const insertKeys: string[] = [];

  for (const [key, group] of groups.entries()) {
    if (scoutedIdByKey.has(key)) continue;
    toInsert.push({
      name: group.displayName,
      discovered_via: 'linkedin_import',
      description: `Auto-promoted from LinkedIn network: ${group.count} contact${group.count > 1 ? 's' : ''} on file.`,
    });
    insertKeys.push(key);
  }

  let promoted = 0;

  if (toInsert.length > 0) {
    // Chunk to avoid Supabase row limits and to recover the inserted IDs in order.
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunkRows = toInsert.slice(i, i + CHUNK);
      const chunkKeys = insertKeys.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('scouted_companies')
        .insert(chunkRows)
        .select('id, name');
      if (error) {
        errors.push(`scouted insert ${i}-${i + chunkRows.length}: ${error.message}`);
        continue;
      }
      const inserted = (data || []) as ScoutedRow[];
      for (let j = 0; j < inserted.length; j++) {
        const row = inserted[j];
        const key = chunkKeys[j];
        if (key && row?.id) scoutedIdByKey.set(key, row.id);
      }
      promoted += inserted.length;
    }
  }

  // ---- Link each contact (with NULL scouted_company_id) to the right scouted row ----
  // Build the contact→target mapping
  const updatesByScouted = new Map<string, string[]>();  // scouted_company_id → [contact_id, ...]
  for (const [key, group] of groups.entries()) {
    const scoutedId = scoutedIdByKey.get(key);
    if (!scoutedId) continue;
    for (const contact of group.contacts) {
      if (contact.scouted_company_id) continue; // already linked
      const arr = updatesByScouted.get(scoutedId) || [];
      arr.push(contact.id);
      updatesByScouted.set(scoutedId, arr);
    }
  }

  let linked = 0;
  for (const [scoutedId, contactIds] of updatesByScouted.entries()) {
    // Chunk update by contact_id IN (...) — Postgres has a practical limit on
    // array length, 1000 ids per chunk is comfortable.
    const CHUNK = 500;
    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const ids = contactIds.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from('linkedin_contacts')
        .update({ scouted_company_id: scoutedId }, { count: 'exact' })
        .in('id', ids);
      if (error) {
        errors.push(`link scouted=${scoutedId} chunk ${i}-${i + ids.length}: ${error.message}`);
        continue;
      }
      linked += count ?? ids.length;
    }
  }

  const alreadyLinked = contacts.filter((c) => c.scouted_company_id).length;

  return NextResponse.json({
    unique_companies: groups.size,
    existing_scouted: existingScouted.length,
    merged_duplicate_scouted_rows: mergedRows,
    merged_repointed_contacts: mergedContacts,
    promoted,
    linked,
    already_linked: alreadyLinked,
    errors,
  });
}
