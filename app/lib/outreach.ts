import Anthropic from '@anthropic-ai/sdk';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/app/lib/supabase';
import { researchClient, type ClientProfile } from '@/app/lib/clientResearch';
import { scoreClientTender, type ClientRow } from '@/app/lib/clientMatching';
import { sendEmail } from '@/app/lib/email';

// ============================================================================
// Outreach engine — the platform acquires its own users.
// ----------------------------------------------------------------------------
// Pipeline per prospect: research (web → profile) → match (score against the
// prospect's market universe, keep the best tender as the "hook") → draft
// (personalized email leading with the hook + tokenized preview link) → send
// (Resend) → track (viewed / replied / activated).
// Every send is gated on a human approving the draft in /admin/outreach — the
// engine writes drafts, it never emails anyone on its own.
// ============================================================================

const anthropic = new Anthropic({ maxRetries: 4 });
type Supabase = ReturnType<typeof createServerClient>;

export interface ProspectRow {
  id: string;
  name: string;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  country: string | null;
  market: string;
  status: string;
  profile: ClientProfile | null;
  looking_for: string | null;
  hook_tender_id: string | null;
  match_score: number | null;
  match_rationale: string | null;
  draft_subject: string | null;
  draft_html: string | null;
  preview_token: string | null;
}

async function getProspect(supabase: Supabase, id: string): Promise<ProspectRow> {
  const { data, error } = await supabase.from('prospects').select('*').eq('id', id).single();
  if (error || !data) throw new Error(`prospect not found: ${error?.message || id}`);
  return data as ProspectRow;
}

// ── Step 1: research ────────────────────────────────────────────────────────
export async function researchProspect(supabase: Supabase, id: string): Promise<ProspectRow> {
  const p = await getProspect(supabase, id);
  const profile = await researchClient({ name: p.name, website: p.website });
  if (!profile) throw new Error('research produced no profile');
  const { data, error } = await supabase.from('prospects').update({
    profile,
    name: profile.name || p.name,
    status: 'researched',
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw new Error(`research save: ${error.message}`);
  return data as ProspectRow;
}

// ── Step 2: match — find the hook tender ────────────────────────────────────
// Scores the prospect against the top tenders of its own market universe and
// keeps the single best as the outreach hook. Small pool (default 6): we need
// one great door-opener, not a portfolio.
export async function matchProspect(
  supabase: Supabase,
  id: string,
  opts: { poolSize?: number } = {},
): Promise<ProspectRow> {
  const { poolSize = 10 } = opts;
  const p = await getProspect(supabase, id);
  if (!p.profile) throw new Error('prospect has no profile — run research first');

  const market = p.market || 'intl_dev';
  const basePool = () => {
    let q = supabase
      .from('tenders')
      .select('id, source, source_ref, title, description, donor, buyer, country, sectors, value_usd_min, value_usd_max')
      .eq('passes_filter', true)
      .eq('market', market);
    if (market === 'intl_dev') q = q.neq('tender_fit_verdict', 'skip');
    return q.order('tender_fit_score', { ascending: false, nullsFirst: false });
  };

  // Prefer tenders that overlap the prospect's own sectors — a generic
  // "top tenders" pool produces weak hooks for niche prospects. Fall back to
  // the generic pool when the sector slice is thin.
  const sectors = p.profile.sectors || [];
  type PoolTender = { id: string; source: string; source_ref: string; title: string | null; description: string | null; donor: string | null; buyer: string | null; country: string | null; sectors: string[] | null; value_usd_min: number | null; value_usd_max: number | null };
  let tenders: PoolTender[] = [];
  if (sectors.length) {
    const { data } = await basePool().overlaps('sectors', sectors).limit(poolSize);
    tenders = (data || []) as PoolTender[];
  }
  if (tenders.length < 3) {
    const { data, error: tErr } = await basePool().limit(poolSize);
    if (tErr) throw new Error(`tender pool: ${tErr.message}`);
    const seen = new Set(tenders.map((t) => t.id));
    for (const t of (data || []) as PoolTender[]) if (!seen.has(t.id)) tenders.push(t);
    tenders = tenders.slice(0, poolSize);
  }
  if (tenders.length === 0) throw new Error(`no tenders in market '${market}'`);

  const asClient: ClientRow = {
    id: p.id,
    name: p.profile.name || p.name,
    description: p.profile.description,
    sectors: p.profile.sectors,
    geographies: p.profile.geographies,
    size_band: p.profile.size_band,
    capabilities: p.profile.capabilities,
    past_wins: p.profile.past_wins,
    certifications: p.profile.certifications,
    ceo_name: p.profile.ceo_name,
    ceo_background: p.profile.ceo_background,
    market,
  };

  let best: { tenderId: string; score: number; rationale: string; dims: Record<string, number> } | null = null;
  const queue = [...tenders];
  const CONCURRENCY = 3;
  const errors: string[] = [];
  async function worker() {
    while (queue.length) {
      const t = queue.shift()!;
      try {
        const s = await scoreClientTender(asClient, t);
        if (!best || s.score > best.score) {
          best = { tenderId: t.id, score: s.score, rationale: s.rationale, dims: s.fit_dimensions };
        }
      } catch (err) {
        errors.push(`${t.source_ref}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!best) throw new Error(`matching failed for all tenders: ${errors.slice(0, 2).join('; ')}`);
  const b = best as { tenderId: string; score: number; rationale: string; dims: Record<string, number> };

  const { data, error } = await supabase.from('prospects').update({
    hook_tender_id: b.tenderId,
    match_score: b.score,
    match_rationale: b.rationale,
    fit_dimensions: b.dims,
    status: 'matched',
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw new Error(`match save: ${error.message}`);
  return data as ProspectRow;
}

// ── Step 3: draft the outreach email ────────────────────────────────────────
const draftTool: Anthropic.Tool = {
  name: 'emit_outreach_email',
  description: 'Emit the outreach email draft.',
  input_schema: {
    type: 'object',
    required: ['subject', 'body_paragraphs'],
    properties: {
      subject: { type: 'string', description: 'Subject line: specific, no hype, leads with the opportunity. Max ~9 words.' },
      body_paragraphs: {
        type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5,
        description: 'Email body as 3-5 short paragraphs (plain text, no HTML). Para 1: the specific opportunity found for them. Para 2: why THEY fit (2-3 concrete facts from their profile). Para 3: what Cooperatr is (one sentence) + the preview link CTA. Optional 4: soft close.',
      },
    },
  },
};

// Below this fit score we refuse to draft: a weak hook makes a bad first
// impression and burns the sending domain. The admin sees the block and can
// re-match later when better tenders land (or override via OUTREACH_MIN_SCORE).
const MIN_HOOK_SCORE = Number(process.env.OUTREACH_MIN_SCORE || 55);

export async function draftOutreach(supabase: Supabase, id: string): Promise<ProspectRow> {
  const p = await getProspect(supabase, id);
  if (!p.hook_tender_id) throw new Error('prospect has no hook tender — run match first');
  if (p.match_score != null && p.match_score < MIN_HOOK_SCORE) {
    throw new Error(`hook fit too weak to email (${Math.round(p.match_score)} < ${MIN_HOOK_SCORE}) — no outreach drafted; re-match when better tenders land`);
  }
  const { data: tender, error: tErr } = await supabase
    .from('tenders')
    .select('title, donor, buyer, country, value_usd_max, currency, deadline_at, url, source')
    .eq('id', p.hook_tender_id).single();
  if (tErr || !tender) throw new Error(`hook tender: ${tErr?.message || 'missing'}`);

  const token = p.preview_token || randomBytes(16).toString('hex');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cooperatr.com';
  const previewUrl = `${siteUrl}/preview/${token}`;

  const system = `You write first-touch B2B outreach emails for Cooperatr, a business-development platform for cross-border public and development funding (HQ Madrid; active across the EU and US).

The recipient has never heard of us. The email must earn its read in the first line by being CONCRETELY USEFUL: we found a specific funding opportunity that fits their actual work. Rules:
- Tone: peer-to-peer BD note from a person, not a marketing blast. No hype words (revolutionary, game-changing, excited). No exclamation marks.
- Lead with the opportunity (funder, what it funds, value if known, deadline if known) — not with who we are.
- The "why you" paragraph must cite 2-3 SPECIFIC facts from their profile (a named past project, a capability, their geography, the CEO's background). Generic flattery kills the email.
- One sentence max about Cooperatr, then the preview-link CTA ("I put the full match rationale and a few other live fits here: <link>").
- Under 140 words total. Short paragraphs. No bullet lists.
- Do NOT invent facts about them or the tender beyond what is given.`;

  const value = tender.value_usd_max ? `${tender.currency === 'EUR' ? '€' : '$'}${Number(tender.value_usd_max).toLocaleString('en-US')}` : null;
  const userPrompt = `## The opportunity (the hook)
Title: ${tender.title}
Funder: ${tender.donor || tender.buyer || '—'}   Country/region: ${tender.country || '—'}
${value ? `Value: ${value}` : ''}   ${tender.deadline_at ? `Deadline: ${String(tender.deadline_at).slice(0, 10)}` : ''}

## Why they fit (our match rationale)
${p.match_rationale || '—'}

## The prospect
Company: ${p.name}${p.contact_name ? `   Contact: ${p.contact_name}` : ''}
Profile: ${JSON.stringify(p.profile || {}).slice(0, 1200)}
${p.looking_for ? `They are looking for: ${p.looking_for}` : ''}

## Preview link to include
${previewUrl}

Write the email now via emit_outreach_email.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system,
    tools: [draftTool],
    tool_choice: { type: 'tool', name: 'emit_outreach_email' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('draft: no tool use');
  const draft = block.input as { subject: string; body_paragraphs: string[] };

  const paras = draft.body_paragraphs.map((t) => `<p style="font-size:15px;line-height:1.65;color:#374151;margin:0 0 14px">${t.replace(previewUrl, `<a href="${previewUrl}" style="color:#1f6cc5;font-weight:600">${previewUrl}</a>`)}</p>`).join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:540px;margin:0 auto;color:#111827">
${paras}
<p style="font-size:13px;color:#9ca3af;margin-top:22px">Leo Watts · Cooperatr — cross-border funding intelligence · Madrid</p>
<p style="font-size:12px;color:#9ca3af">You're receiving this one-off note because your public work matched a live funding opportunity. Reply "no thanks" and we won't write again.</p>
</div>`;

  const { data, error } = await supabase.from('prospects').update({
    draft_subject: draft.subject,
    draft_html: html,
    preview_token: token,
    status: 'drafted',
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('*').single();
  if (error) throw new Error(`draft save: ${error.message}`);
  return data as ProspectRow;
}

// ── Step 4: send (human-approved) ───────────────────────────────────────────
export async function sendOutreach(supabase: Supabase, id: string, replyTo: string): Promise<{ ok: boolean; error?: string }> {
  const p = await getProspect(supabase, id);
  if (!p.contact_email) return { ok: false, error: 'no contact_email on prospect' };
  if (!p.draft_subject || !p.draft_html) return { ok: false, error: 'no draft — run draft first' };
  const sent = await sendEmail({ to: p.contact_email, subject: p.draft_subject, html: p.draft_html, replyTo });
  if (sent.ok) {
    await supabase.from('prospects').update({
      status: 'contacted', emailed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id);
  }
  return sent;
}
