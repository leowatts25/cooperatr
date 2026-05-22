// ============================================================================
// BD matcher dry-run — score one tender against its candidate SMEs, no DB writes.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/matcher-dry-run.ts <tender_id>
//   npx tsx --env-file=.env.local scripts/matcher-dry-run.ts --latest
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY in env.
//
// What it does:
//   1. Loads the tender row (or picks the most recently published passing one)
//   2. Retrieves up to 5 candidate scouted_companies via the live matcher logic
//   3. Calls Sonnet 4.6 once per pair and pretty-prints the structured output
//   4. Writes nothing to the database
//
// If scouted_companies is empty (likely, since SME discovery isn't built yet),
// the script prints a hint with a one-liner SQL snippet to seed a test row.
// ============================================================================

import { createServerClient } from '../app/lib/supabase';
import { matchTender } from '../app/lib/matcher';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx --env-file=.env.local scripts/matcher-dry-run.ts <tender_id|--latest>');
    process.exit(1);
  }

  const supabase = createServerClient();

  let tenderId = arg;
  if (arg === '--latest') {
    const { data, error } = await supabase
      .from('tenders')
      .select('id, source_ref, title, published_at')
      .eq('passes_filter', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();
    if (error || !data) {
      console.error('No passing tenders found. Run the ingest first.');
      process.exit(1);
    }
    tenderId = data.id;
    console.log(`[dry-run] picked latest passing tender: ${data.source_ref} — ${data.title}\n`);
  }

  // Quick precheck: any scouted_companies at all?
  const { count: companyCount } = await supabase
    .from('scouted_companies')
    .select('id', { count: 'exact', head: true });
  if (!companyCount || companyCount === 0) {
    console.warn('[dry-run] No rows in scouted_companies — the matcher will return 0 candidates.');
    console.warn('         Seed one for testing via the Supabase SQL editor, e.g.:');
    console.warn(
      "         insert into scouted_companies (name, country, sectors, size_band, description) values\n" +
        "           ('Test SME GmbH', 'DE', array['renewable_energy'], 'small',\n" +
        "            'Boutique solar PV installer in Bavaria with 8 years of EU project experience.');\n",
    );
  }

  const t0 = Date.now();
  const outcome = await matchTender(supabase, tenderId, { dryRun: true, candidateLimit: 5 });
  const ms = Date.now() - t0;

  console.log('\n============================================================');
  console.log(`DRY RUN — tender ${tenderId}`);
  console.log(`candidates retrieved: ${outcome.candidates}`);
  console.log(`scored: ${outcome.scored}`);
  console.log(`errors: ${outcome.errors.length}`);
  console.log(`elapsed: ${ms}ms`);
  console.log('============================================================\n');

  for (const [i, m] of outcome.matches.entries()) {
    console.log(`--- match ${i + 1} ---`);
    console.log(`scouted_company_id: ${m.scouted_company_id}`);
    console.log(`warm_intro_via_contact_id: ${m.warm_intro_via_contact_id || '(none)'}`);
    console.log(`score: ${m.score}`);
    console.log(`fit_dimensions: ${JSON.stringify(m.fit_dimensions)}`);
    console.log(`rationale: ${m.rationale}`);
    if (m.partner_stack && m.partner_stack.length > 0) {
      console.log(`partner_stack:`);
      for (const p of m.partner_stack) console.log(`  - ${p}`);
    }
    if (m.risks && m.risks.length > 0) {
      console.log(`risks:`);
      for (const r of m.risks) console.log(`  - ${r}`);
    }
    console.log();
  }

  if (outcome.errors.length > 0) {
    console.log('errors:');
    for (const e of outcome.errors) console.log(`  - ${e}`);
  }

  console.log('No DB writes performed (dryRun=true).');
}

main().catch((err) => {
  console.error('[dry-run] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
