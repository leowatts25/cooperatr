import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

const ADMIN_EMAIL = 'leowatts25@gmail.com';

async function verifyAdmin(supabase: ReturnType<typeof createServerClient>, req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);

  return user?.email === ADMIN_EMAIL;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();

    // For admin page, check via email in query param (simplified for demo)
    const adminEmail = req.nextUrl.searchParams.get('adminEmail');
    if (adminEmail !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const status = req.nextUrl.searchParams.get('status');

    let query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users: data });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { userId, status, adminEmail } = await req.json();

    if (adminEmail !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updates: Record<string, unknown> = { status };
    if (status === 'approved') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = ADMIN_EMAIL;
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin update error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
