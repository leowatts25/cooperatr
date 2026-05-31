// Inspect passing tenders + their matches to validate quality.
// Usage: node --env-file=.env.local scripts/inspect-matches.mjs
import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: tenders } = await db.from('tenders')
  .select('id, source, source_ref, title, country, value_usd_min, value_usd_max, filter_reasons, sectors, donor')
  .eq('passes_filter', true)
  .order('source', { ascending: true });

console.log(`\n=== PASSING TENDERS: ${tenders?.length ?? 0} ===\n`);
for (const t of tenders ?? []) {
  console.log(`[${t.source}] ${t.title}`);
  console.log(`  donor=${t.donor ?? '-'} country=${t.country ?? '-'} value=${t.value_usd_min}-${t.value_usd_max}`);
  console.log(`  sectors=${JSON.stringify(t.sectors)} reasons=${JSON.stringify(t.filter_reasons)}`);

  const { data: matches } = await db.from('tender_matches')
    .select('score, status, scouted_company_id, scouted_companies(name, country)')
    .eq('tender_id', t.id)
    .order('score', { ascending: false });
  const top = (matches ?? []).slice(0, 4);
  console.log(`  matches: ${matches?.length ?? 0}` + (matches?.length ? ` | top scores:` : ''));
  for (const m of top) {
    const c = m.scouted_companies || {};
    console.log(`    • ${m.score} — ${c.name} (${c.country})`);
  }
  console.log('');
}
