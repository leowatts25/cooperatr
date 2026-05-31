// ============================================================================
// Apply migration 015 (BD matcher recalibration) against the live database.
//
// 015 is DDL (ALTER TABLE add column, CREATE INDEX) plus one DML insert, so it
// needs a direct Postgres connection — the Supabase REST client can't run DDL.
// We use POSTGRES_URL_NON_POOLING (the direct, non-pgbouncer connection) so
// DDL statements run in a normal session.
//
// Usage: node --env-file=.env.local scripts/apply-015.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '015_recalibration.sql');

let connectionString =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL');
  process.exit(1);
}
// Strip any sslmode param — Supabase's direct connection presents a
// self-signed cert chain. We handle SSL via the explicit ssl option below
// (rejectUnauthorized: false), so a sslmode=require/verify-full in the URL
// would otherwise force cert validation and fail.
connectionString = connectionString.replace(/[?&]sslmode=[^&]*/i, '');

const sql = readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected. Applying migration 015…');
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('Migration 015 applied successfully.');

  // Verify columns + sector landed.
  const cols = await client.query(
    `select table_name, column_name from information_schema.columns
     where (table_name = 'tenders' and column_name like 'tender_fit%')
        or (table_name = 'tender_matches' and column_name in ('opportunity_expansion','feedback','feedback_signal','feedback_at'))
     order by table_name, column_name`,
  );
  console.log('New columns:');
  for (const r of cols.rows) console.log(`  ${r.table_name}.${r.column_name}`);

  const sec = await client.query(`select slug, label from sectors where slug = 'capacity_building'`);
  console.log('Sector:', sec.rows[0] ? `${sec.rows[0].slug} (${sec.rows[0].label})` : 'MISSING');
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('Migration 015 FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
