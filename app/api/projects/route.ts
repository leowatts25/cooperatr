import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const companyId = req.nextUrl.searchParams.get('companyId');
    const projectId = req.nextUrl.searchParams.get('id');

    if (projectId) {
      const { data, error } = await supabase
        .from('projects')
        .select('*, milestones(*), indicators(*), proposals(title, status)')
        .eq('id', projectId)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 404 });
      return NextResponse.json({ project: data });
    }

    let query = supabase
      .from('projects')
      .select('*, milestones(id, status), proposals(title)')
      .order('created_at', { ascending: false });

    if (companyId) query = query.eq('company_id', companyId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ projects: data });
  } catch (error) {
    console.error('Get projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const { id, ...updates } = body;

    if (body.milestoneId) {
      const { milestoneId, ...milestoneUpdates } = updates;
      void milestoneId;
      const { error } = await supabase
        .from('milestones')
        .update({ ...milestoneUpdates, updated_at: new Date().toISOString() })
        .eq('id', body.milestoneId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
