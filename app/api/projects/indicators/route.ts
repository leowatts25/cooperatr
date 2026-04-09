import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const projectId = req.nextUrl.searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('indicators')
      .select('*')
      .eq('project_id', projectId)
      .order('category', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ indicators: data });
  } catch (error) {
    console.error('Get indicators error:', error);
    return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { id, current_value } = await req.json();

    const { error } = await supabase
      .from('indicators')
      .update({
        current_value,
        last_updated: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update indicator error:', error);
    return NextResponse.json({ error: 'Failed to update indicator' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const { project_id, name, category, target_value, unit, reporting_period } = await req.json();

    const { data, error } = await supabase
      .from('indicators')
      .insert({
        project_id,
        name,
        category: category || 'output',
        target_value: target_value || 0,
        current_value: 0,
        unit: unit || 'units',
        reporting_period: reporting_period || 'quarterly',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (error) {
    console.error('Create indicator error:', error);
    return NextResponse.json({ error: 'Failed to create indicator' }, { status: 500 });
  }
}
