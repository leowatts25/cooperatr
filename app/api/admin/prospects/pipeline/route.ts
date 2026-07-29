import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { researchProspect, matchProspect, draftOutreach, sendOutreach } from '@/app/lib/outreach';

export const maxDuration = 300;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/prospects/pipeline — run pipeline steps for one prospect.
//   body: { prospectId: string, steps: Array<'research'|'match'|'draft'|'send'> }
// Steps run sequentially; the response reports how far it got. 'send' actually
// emails the prospect via Resend, so the UI only offers it from an approved
// draft — the engine never sends without a human clicking.
// ============================================================================
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { prospectId?: string; steps?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.prospectId) return NextResponse.json({ error: 'prospectId required' }, { status: 400 });
  const steps = (body.steps || []).filter((s) => ['research', 'match', 'draft', 'send'].includes(s));
  if (steps.length === 0) return NextResponse.json({ error: 'steps required' }, { status: 400 });

  const supabase = createServerClient();
  const completed: string[] = [];
  try {
    for (const step of steps) {
      if (step === 'research') await researchProspect(supabase, body.prospectId);
      if (step === 'match') await matchProspect(supabase, body.prospectId);
      if (step === 'draft') await draftOutreach(supabase, body.prospectId);
      if (step === 'send') {
        const sent = await sendOutreach(supabase, body.prospectId, ADMIN_EMAIL);
        if (!sent.ok) return NextResponse.json({ completed, error: `send: ${sent.error}` }, { status: 502 });
      }
      completed.push(step);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prospects/pipeline]', msg);
    return NextResponse.json({ completed, error: msg }, { status: 500 });
  }

  const { data } = await supabase
    .from('prospects')
    .select('*, hook_tender:tenders(id, title, donor, country, value_usd_max, currency, deadline_at, url)')
    .eq('id', body.prospectId).single();
  return NextResponse.json({ completed, prospect: data });
}
