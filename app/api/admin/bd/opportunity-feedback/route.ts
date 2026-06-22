import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';
import { cooperatrProfileBlock } from '@/app/lib/cooperatrProfile';

export const maxDuration = 60;

const ADMIN_EMAIL = 'leowatts25@gmail.com';
const client = new Anthropic({ maxRetries: 4 });

// ============================================================================
// POST /api/admin/bd/opportunity-feedback
// Claude reviews an opportunity (tender) + the operator's freeform notes +
// the candidate companies, and returns strategic BD feedback. Persisted to
// tenders.bd_ai_feedback so it survives reloads.
//   body: { tenderId: string }
// ============================================================================
export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let body: { tenderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.tenderId) {
    return NextResponse.json({ error: 'tenderId required' }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: t, error: tErr } = await supabase
    .from('tenders')
    .select('id, title, description, donor, buyer, country, sectors, value_usd_min, value_usd_max, deadline_at, tender_fit_score, tender_fit_verdict, tender_fit_reasons, bd_notes')
    .eq('id', body.tenderId)
    .single();
  if (tErr || !t) {
    return NextResponse.json({ error: `tender not found: ${tErr?.message || 'no row'}` }, { status: 404 });
  }

  if (!t.bd_notes || !t.bd_notes.trim()) {
    return NextResponse.json({ error: 'Add some notes first — AI feedback is based on your notes.' }, { status: 400 });
  }

  // Candidate companies for context.
  const { data: matches } = await supabase
    .from('tender_matches')
    .select('score, rationale, status, company:scouted_companies(name, country, sectors, size_band)')
    .eq('tender_id', body.tenderId)
    .neq('status', 'dropped')
    .order('score', { ascending: false })
    .limit(8);

  const fitReasons = (t.tender_fit_reasons as { reasons?: string[] } | null)?.reasons || [];
  const candidateLines = (matches || [])
    .map((m) => {
      const c = m.company as unknown as { name?: string; country?: string; size_band?: string } | null;
      const star = m.status === 'pursuing' ? '★ preferred ' : '';
      return `- ${star}${c?.name || '(company)'} (${c?.country || '—'}, ${c?.size_band || '—'}) — score ${Math.round(m.score ?? 0)}: ${(m.rationale || '').slice(0, 160)}`;
    })
    .join('\n') || '(none discovered yet)';

  const value =
    t.value_usd_min == null && t.value_usd_max == null
      ? 'unknown'
      : `${t.value_usd_min ?? '?'} – ${t.value_usd_max ?? '?'} USD`;

  const system = `You are a senior development-finance BD strategist advising Cooperatr's operator on a specific opportunity. Give sharp, candid, actionable feedback — not a summary.

${cooperatrProfileBlock()}

The operator has written notes on this opportunity. React to THEM specifically: validate or challenge their thinking, fill gaps, and push the bid forward. Be concrete and concise.

Structure your reply as short markdown sections:
- **Take** — 1–2 sentences: is this worth pursuing, and why (reference their notes).
- **Build on your notes** — react to specific points they raised; correct anything off.
- **Partnering** — given the candidate companies, who/what kind of partner to line up (or what's missing).
- **Risks & gaps** — the 2–3 things most likely to sink this, including anything their notes overlook.
- **Next steps** — 2–4 concrete actions.

Keep it tight (~250-350 words). No preamble.`;

  const userPrompt = `## Opportunity
Title: ${t.title || '—'}
Donor: ${t.donor || '—'}  Buyer: ${t.buyer || '—'}  Country: ${t.country || '—'}
Sectors: ${(t.sectors || []).join(', ') || '—'}
Value: ${value}  Deadline: ${t.deadline_at || '—'}
Cooperatr fit: ${t.tender_fit_score ?? '—'} (${t.tender_fit_verdict ?? '—'})${fitReasons.length ? `\nFit reasons: ${fitReasons.join(' · ')}` : ''}

## Candidate companies
${candidateLines}

## Operator's notes
${t.bd_notes}

Give your BD feedback now.`;

  let feedback: string;
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1100,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    feedback = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  } catch (err) {
    console.error('[opportunity-feedback] claude error', err);
    return NextResponse.json({ error: `AI feedback failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  const at = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('tenders')
    .update({ bd_ai_feedback: feedback, bd_ai_feedback_at: at })
    .eq('id', body.tenderId);
  if (upErr) {
    console.error('[opportunity-feedback] save failed', upErr.message);
  }

  return NextResponse.json({ feedback, at });
}
