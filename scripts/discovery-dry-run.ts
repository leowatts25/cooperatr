#!/usr/bin/env tsx
// ============================================================================
// scripts/discovery-dry-run.ts — exercise the SME-discovery module locally
//
// Usage:
//   set -a; source .env.local; set +a
//   tsx scripts/discovery-dry-run.ts <tender_id>
//   tsx scripts/discovery-dry-run.ts --latest
// ============================================================================

import { createServerClient } from '../app/lib/supabase';
import { discoverCandidatesForTender } from '../app/lib/discovery';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/discovery-dry-run.ts <tender_id|--latest>');
    process.exit(2);
  }
  const supabase = createServerClient();

  let tenderId = arg;
  if (arg === '--latest') {
    const { data } = await supabase
      .from('tenders')
      .select('id, source_ref, title')
      .eq('passes_filter', true)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (!data || data.length === 0) {
      console.error('no passing tenders found');
      process.exit(1);
    }
    tenderId = data[0].id;
    console.log(`[dry-run] picked latest passing tender: ${data[0].source_ref} — ${data[0].title}`);
  }

  const { data: tenders, error } = await supabase
    .from('tenders')
    .select('id, title, description, donor, buyer, country, sectors, type, value_usd_min, value_usd_max, deadline_at, source_ref')
    .eq('id', tenderId)
    .limit(1);
  if (error || !tenders || tenders.length === 0) {
    console.error('tender not found:', error?.message || tenderId);
    process.exit(1);
  }
  const tender = tenders[0];

  console.log('\n' + '='.repeat(60));
  console.log(`DRY-RUN DISCOVERY — ${tender.source_ref}`);
  console.log(`Title:    ${tender.title}`);
  console.log(`Donor:    ${tender.donor || '-'}   Buyer: ${tender.buyer || '-'}`);
  console.log(`Country:  ${tender.country}        Sectors: ${tender.sectors?.join(', ') || '-'}`);
  console.log(`Value:    $${tender.value_usd_min || '?'}–$${tender.value_usd_max || '?'}`);
  console.log('='.repeat(60) + '\n');

  const t0 = Date.now();
  const result = await discoverCandidatesForTender(tender, supabase, { dryRun: true });
  const ms = Date.now() - t0;

  console.log(`Discovered ${result.candidates.length} candidates in ${ms}ms`);
  console.log(`Tokens: in=${result.tokens.input} cache_create=${result.tokens.cache_create} cache_read=${result.tokens.cache_read} out=${result.tokens.output}\n`);

  result.candidates.forEach((c, i) => {
    console.log(`--- candidate ${i + 1} ---`);
    console.log(`name:      ${c.name}`);
    console.log(`country:   ${c.country}    size: ${c.size_band || '?'}`);
    console.log(`sectors:   ${c.sectors.join(', ')}`);
    if (c.website) console.log(`website:   ${c.website}`);
    console.log(`description: ${c.description}`);
    if (c.past_donor_wins && c.past_donor_wins.length > 0) {
      console.log(`past_wins: ${c.past_donor_wins.join(' | ')}`);
    }
    if (c.geographic_footprint && c.geographic_footprint.length > 0) {
      console.log(`footprint: ${c.geographic_footprint.join(', ')}`);
    }
    console.log(`why_fit:   ${c.why_a_fit}\n`);
  });

  console.log('No DB writes performed (dryRun=true).');
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
