// ============================================================================
// Apply migration 016 (BD pipeline stages) against the live database.
//
// 016 is pure DDL (ALTER TABLE add columns, CHECK constraint, CREATE INDEX), so
// it needs a direct Postgres connection — the Supabase REST client can't run
// DDL. We use POSTGRES_URL_NON_POOLING (direct, non-pgbouncer) so the
// statements run in a normal session.
//
// Usage: node --env-file=.env.local scripts/apply-016.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '016_bd_pipeline.sql');

let connectionString =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL');
  process.exit(1);
}
connectionString = connectionString.replace(/[?&]sslmode=[^&]*/i, '');

const sql = readFileSync(sqlPath, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log('Connected. Applying migration 016…');
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('Migration 016 applied successfully.');

  const cols = await client.query(
    `select column_name, data_type, column_default from information_schema.columns
     where table_name = 'tenders' and column_name in ('bd_status', 'bd_status_at')
     order by column_name`,
  );
  console.log('New columns:');
  for (const r of cols.rows) console.log(`  tenders.${r.column_name} (${r.data_type}) default=${r.column_default ?? '—'}`);

  const dist = await client.query(`select bd_status, count(*)::int as n from tenders group by bd_status order by n desc`);
  console.log('bd_status distribution:');
  for (const r of dist.rows) console.log(`  ${r.bd_status}: ${r.n}`);
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('Migration 016 FAILED:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
