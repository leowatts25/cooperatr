import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const companyId = req.nextUrl.searchParams.get('companyId');
    const partnerId = req.nextUrl.searchParams.get('id');

    if (partnerId) {
      const { data, error } = await supabase.from('partners').select('*').eq('id', partnerId).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 404 });
      return NextResponse.json({ partner: data });
    }

    let query = supabase.from('partners').select('*').order('created_at', { ascending: false });
    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ partners: data });
  } catch (error) {
    console.error('Get partners error:', error);
    return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const { data, error } = await supabase
      .from('partners')
      .insert({
        company_id: body.company_id || null,
        name: body.name,
        country: body.country || null,
        sector: body.sector || null,
        role: body.role || null,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        website: body.website || null,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error('Create partner error:', error);
    return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id, ...updates } = await req.json();

    const { error } = await supabase
      .from('partners')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update partner error:', error);
    return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
  }
}
