import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 60;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/linkedin/import
//
// One-shot importer for the admin's LinkedIn Connections export. Reads from
// .local/Connections.csv at repo root, skips the disclaimer preamble (LinkedIn
// puts 2-3 lines of notes before the real CSV header), and upserts each valid
// row into linkedin_contacts keyed on (owner_id, linkedin_url) — see
// migration 012. Rows with empty Company or Position are dropped (no signal
// for the matcher's warm-intro routing).
//
// Date format: "DD Mon YYYY" (e.g. "15 Mar 2023"). Parsed into a real DATE.
//
// Why a query-string admin gate (vs. a session): matches the existing
// /api/admin/* pattern in this repo. The endpoint is invoked manually from
// the dashboard, not from a public route.
//
// Returns: { imported, skipped_empty, skipped_dupe, errors }
// ============================================================================

interface ImportRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  position: string;
  company_name: string;
  connected_on: string | null; // ISO YYYY-MM-DD
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

function parseConnectedOn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Expected: "13 May 2026" → "2026-05-13"
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const [, dd, monRaw, yyyy] = m;
  const mon = MONTHS[monRaw.toLowerCase()];
  if (!mon) return null;
  const day = dd.padStart(2, '0');
  return `${yyyy}-${mon}-${day}`;
}

// Minimal RFC-4180-ish CSV row splitter. Handles double-quoted fields with
// embedded commas. Newlines inside quoted fields are rare in LinkedIn exports
// (positions are short) so we deliberately don't handle them here — anything
// odd gets caught by the validator below.
function splitCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"' && cur === '') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(raw: string): { header: string[]; rows: string[][] } {
  // Normalize line endings, drop trailing empties.
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Skip the disclaimer preamble. LinkedIn typically emits:
  //   Notes:
  //   "When exporting your connection data, ..."
  //   <blank>
  //   First Name,Last Name,...
  // We scan forward until we hit a line that starts with "First Name".
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^First Name\s*,/i.test(lines[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find LinkedIn CSV header (expected a line starting with "First Name,")');
  }
  const header = splitCsvRow(lines[headerIdx]);

  const rows: string[][] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    rows.push(splitCsvRow(line));
  }
  return { header, rows };
}

function pick(cols: string[], header: string[], name: string): string {
  const idx = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  return idx === -1 ? '' : (cols[idx] || '').trim();
}

export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Repo root: __dirname → app/api/admin/linkedin/import → 5 levels up.
  // process.cwd() is more robust on Vercel (project root). Use cwd.
  const csvPath = join(process.cwd(), '.local', 'Connections.csv');
  let raw: string;
  try {
    raw = await readFile(csvPath, 'utf8');
  } catch (err) {
    return NextResponse.json(
      {
        error:
          'Could not read .local/Connections.csv from repo root. Drop your LinkedIn export there first (Connections.csv, not the full ZIP).',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseCsv(raw);
  } catch (err) {
    return NextResponse.json(
      { error: 'CSV parse failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
  const { header, rows } = parsed;

  // Look up the admin's auth.users id — that's the owner_id we stamp on every
  // imported contact. We do this via the service-role client so we don't need
  // a session here.
  const supabase = createServerClient();
  const { data: adminAuth, error: adminErr } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', ADMIN_EMAIL)
    .single();
  if (adminErr || !adminAuth) {
    return NextResponse.json(
      { error: 'Could not look up admin user id', detail: adminErr?.message },
      { status: 500 },
    );
  }
  const ownerId = adminAuth.id as string;

  // Normalize + filter rows.
  const validRows: ImportRow[] = [];
  let skippedEmpty = 0;
  const parseErrors: string[] = [];

  for (const cols of rows) {
    const company = pick(cols, header, 'Company');
    const position = pick(cols, header, 'Position');
    if (!company || !position) {
      skippedEmpty += 1;
      continue;
    }
    const firstName = pick(cols, header, 'First Name') || null;
    const lastName = pick(cols, header, 'Last Name') || null;
    const url = pick(cols, header, 'URL') || null;
    const email = pick(cols, header, 'Email Address') || null;
    const connectedRaw = pick(cols, header, 'Connected On') || null;
    const connectedOn = parseConnectedOn(connectedRaw);
    if (connectedRaw && !connectedOn) {
      parseErrors.push(`unparseable Connected On for ${firstName || ''} ${lastName || ''}: "${connectedRaw}"`);
    }
    validRows.push({
      first_name: firstName,
      last_name: lastName,
      email,
      linkedin_url: url,
      position,
      company_name: company,
      connected_on: connectedOn,
    });
  }

  // Upsert in chunks. Rows with linkedin_url use the unique (owner_id,
  // linkedin_url) target from migration 012. Rows without a URL go through
  // plain insert (no dedupe possible).
  const CHUNK = 200;
  let imported = 0;
  let skippedDupe = 0;
  const errors: string[] = [...parseErrors];

  const withUrl = validRows.filter((r) => r.linkedin_url);
  const withoutUrl = validRows.filter((r) => !r.linkedin_url);

  for (let i = 0; i < withUrl.length; i += CHUNK) {
    const chunk = withUrl.slice(i, i + CHUNK).map((r) => ({ ...r, owner_id: ownerId }));
    // We can't directly detect dupes from upsert count alone (it returns the
    // total touched, not just new inserts), so we pre-query the existing
    // (owner_id, linkedin_url) pairs in this chunk.
    const urls = chunk.map((r) => r.linkedin_url as string);
    const { data: existing } = await supabase
      .from('linkedin_contacts')
      .select('linkedin_url')
      .eq('owner_id', ownerId)
      .in('linkedin_url', urls);
    const existingSet = new Set<string>((existing || []).map((e: { linkedin_url: string }) => e.linkedin_url));
    const newCount = chunk.filter((r) => !existingSet.has(r.linkedin_url as string)).length;
    const dupeCount = chunk.length - newCount;

    const { error } = await supabase
      .from('linkedin_contacts')
      .upsert(chunk, { onConflict: 'owner_id,linkedin_url', ignoreDuplicates: false });
    if (error) {
      errors.push(`upsert chunk ${i}-${i + chunk.length}: ${error.message}`);
      continue;
    }
    imported += newCount;
    skippedDupe += dupeCount;
  }

  // No-URL rows go in as inserts; can't dedupe.
  if (withoutUrl.length > 0) {
    const insertRows = withoutUrl.map((r) => ({ ...r, owner_id: ownerId }));
    const { error } = await supabase.from('linkedin_contacts').insert(insertRows);
    if (error) {
      errors.push(`no-url insert: ${error.message}`);
    } else {
      imported += insertRows.length;
    }
  }

  return NextResponse.json({
    imported,
    skipped_empty: skippedEmpty,
    skipped_dupe: skippedDupe,
    errors,
    total_rows: rows.length,
  });
}
