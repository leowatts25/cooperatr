// Read-only BD pipeline snapshot via Supabase service-role REST client.
// Targets the live project in SUPABASE_URL (cooperatr-eu / ikqirkqseclpwykimcax).
// Usage: node --env-file=.env.local scripts/db-snapshot.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
console.log('Target project:', url);

const db = createClient(url, key, { auth: { persistSession: false } });

async function count(table, build = (q) => q) {
  const { count, error } = await build(db.from(table).select('*', { count: 'exact', head: true }));
  if (error) throw new Error(`${table}: ${error.message}`);
  return count;
}

const matches = await count('tender_matches');
const tendersTotal = await count('tenders');
const tedTotal = await count('tenders', (q) => q.eq('source', 'TED'));
const tedPassing = await count('tenders', (q) => q.eq('source', 'TED').eq('passes_filter', true));
const passingAll = await count('tenders', (q) => q.eq('passes_filter', true));

const { data: sectors, error: secErr } = await db.from('sectors').select('slug, keywords');
if (secErr) throw new Error(`sectors: ${secErr.message}`);

console.log('tender_matches total:', matches);
console.log('tenders total:', tendersTotal, '| passing(all):', passingAll);
console.log('TED tenders:', tedTotal, '| TED passing:', tedPassing);
console.log('sector keyword counts:', sectors.map((s) => `${s.slug}=${(s.keywords || []).length}`).join(', '));
