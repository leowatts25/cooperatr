// Post-deploy source-quality validation. Reads the live cooperatr-eu DB.
// Answers: (1) did EU F&T NEAR/IPA/INTPA calls land? (2) is SAM.gov now
// dev-finance (foreign / intl-dev agency) not US domestic? (3) recent matches.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SERVICE_ROLE'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

// Per-source counts (last 48h) — passing vs total
for (const src of ['EU_FT', 'SAM_GOV', 'TED']) {
  const total = await db.from('tenders').select('*', { count: 'exact', head: true })
    .eq('source', src).gte('created_at', since);
  const pass = await db.from('tenders').select('*', { count: 'exact', head: true })
    .eq('source', src).eq('passes_filter', true).gte('created_at', since);
  console.log(`${src}: total_48h=${total.count ?? '?'}  passing_48h=${pass.count ?? '?'}`);
}

console.log('\n=== EU_FT passing samples ===');
{
  const { data } = await db.from('tenders')
    .select('source_ref,title,buyer,deadline_at,sectors')
    .eq('source', 'EU_FT').eq('passes_filter', true)
    .gte('created_at', since).limit(8);
  for (const t of data ?? []) console.log(`  • [${t.source_ref}] ${(t.title ?? '').slice(0, 75)} | sectors=${(t.sectors ?? []).join(',')}`);
}

console.log('\n=== SAM_GOV passing samples (should be foreign / intl-dev, NOT VA/Navy) ===');
{
  const { data } = await db.from('tenders')
    .select('source_ref,title,buyer,country,sectors')
    .eq('source', 'SAM_GOV').eq('passes_filter', true)
    .gte('created_at', since).limit(10);
  for (const t of data ?? []) console.log(`  • ${(t.title ?? '').slice(0, 60)} | buyer=${(t.buyer ?? '').slice(0, 35)} | country=${t.country ?? '-'}`);
}

console.log('\n=== SAM_GOV REJECTED samples (should be US domestic procurement) ===');
{
  const { data } = await db.from('tenders')
    .select('title,buyer,country,filter_reasons')
    .eq('source', 'SAM_GOV').eq('passes_filter', false)
    .gte('created_at', since).limit(6);
  for (const t of data ?? []) console.log(`  • ${(t.title ?? '').slice(0, 55)} | buyer=${(t.buyer ?? '').slice(0, 30)} | reasons=${(t.filter_reasons ?? []).slice(-1)}`);
}

console.log('\n=== recent matches written ===');
{
  const { data, count } = await db.from('tender_matches')
    .select('score,status,tenders(source,title),scouted_companies(name)', { count: 'exact' })
    .order('score', { ascending: false }).gte('created_at', since).limit(8);
  console.log(`total matches (48h): ${count ?? '?'}`);
  for (const m of data ?? []) console.log(`  • ${m.score} [${m.status}] ${m.tenders?.source} :: ${(m.tenders?.title ?? '').slice(0, 45)} -> ${m.scouted_companies?.name ?? '?'}`);
}
