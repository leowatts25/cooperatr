import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 30;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// GET /api/admin/linkedin/contacts
//
// Returns imported LinkedIn contacts grouped by company_name, sorted by
// contact-count desc. Used by the Contacts tab on /admin/tenders to surface
// the density of the admin's network per company before the matcher uses it
// for warm-intro routing.
//
// Query: search (optional ilike on company_name)
//        limit  (default 200, max 1000)
// ============================================================================

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  linkedin_url: string | null;
  connected_on: string | null;
  company_name: string | null;
}

export async function GET(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const search = (req.nextUrl.searchParams.get('search') || '').trim();
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '200', 10) || 200, 1000);

  const supabase = createServerClient();

  // Pull all contacts (LinkedIn networks are O(thousands), well within memory).
  // Group in-process — Supabase REST doesn't support GROUP BY directly without
  // a SQL function, and adding one for a read-only admin view is overkill.
  let query = supabase
    .from('linkedin_contacts')
    .select('id, first_name, last_name, position, linkedin_url, connected_on, company_name')
    .order('connected_on', { ascending: false, nullsFirst: false })
    .limit(5000);
  if (search) {
    query = query.ilike('company_name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const all = (data || []) as ContactRow[];

  const groups = new Map<string, { company_name: string; count: number; contacts: ContactRow[] }>();
  for (const row of all) {
    const key = (row.company_name || '').toLowerCase().trim();
    const display = row.company_name || '(no company)';
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.contacts.push(row);
    } else {
      groups.set(key, { company_name: display, count: 1, contacts: [row] });
    }
  }

  const sorted = Array.from(groups.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.company_name.localeCompare(b.company_name);
    })
    .slice(0, limit);

  return NextResponse.json({
    groups: sorted,
    totals: {
      contacts: all.length,
      companies: groups.size,
      returned: sorted.length,
    },
  });
}
