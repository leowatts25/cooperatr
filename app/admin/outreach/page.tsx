'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

// ============================================================================
// /admin/outreach — the outreach engine queue.
// Pipeline per prospect: sourced → researched → matched → drafted →
// contacted → replied → activated. Every send requires a human click from a
// reviewed draft.
// ============================================================================

interface HookTender {
  id: string; title: string | null; donor: string | null; country: string | null;
  value_usd_max: number | null; currency: string | null; deadline_at: string | null; url: string | null;
}

interface Prospect {
  id: string;
  name: string;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  country: string | null;
  market: string;
  status: string;
  looking_for: string | null;
  match_score: number | null;
  match_rationale: string | null;
  draft_subject: string | null;
  draft_html: string | null;
  preview_token: string | null;
  preview_viewed_at: string | null;
  emailed_at: string | null;
  notes: string | null;
  hook_tender: HookTender | null;
}

const STATUS_ORDER = ['sourced', 'researched', 'matched', 'drafted', 'contacted', 'replied', 'activated', 'dead'];
const STATUS_COLOR: Record<string, string> = {
  sourced: '#94A3B8', researched: '#0EA5E9', matched: '#8B5CF6', drafted: '#D97706',
  contacted: '#1f6cc5', replied: '#16A34A', activated: '#16A34A', dead: '#DC2626',
};

export default function AdminOutreachPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});   // id → running step label
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', website: '', contact_name: '', contact_email: '', country: '', market: 'intl_dev', looking_for: '' });
  const [adding, setAdding] = useState(false);

  const api = useCallback((path = '') => `/api/admin/prospects${path}?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(api());
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [api]);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) { router.push('/'); return; }
      setIsAdmin(true);
    }
    init();
  }, [router]);
  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin, fetchAll]);

  async function addProspect() {
    if (!form.name.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'add failed');
      setForm({ name: '', website: '', contact_name: '', contact_email: '', country: '', market: 'intl_dev', looking_for: '' });
      await fetchAll();
    } catch (e) { alert(e instanceof Error ? e.message : 'add failed'); } finally { setAdding(false); }
  }

  async function runSteps(id: string, steps: string[], label: string) {
    setBusy((b) => ({ ...b, [id]: label }));
    setErrs((e) => ({ ...e, [id]: '' }));
    try {
      const res = await fetch(api('/pipeline'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: id, steps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'pipeline failed');
      await fetchAll();
    } catch (e) {
      setErrs((er) => ({ ...er, [id]: e instanceof Error ? e.message : 'failed' }));
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch(api(), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
    await fetchAll();
  }

  if (!isAdmin) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Checking access…</div></div>;

  const counts = STATUS_ORDER.map((s) => ({ s, n: prospects.filter((p) => p.status === s).length })).filter((x) => x.n > 0);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1150, margin: '0 auto' }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Outreach</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          The platform finds the fit; you approve every email. Pipeline: research → match → draft → send → activate.
        </p>
      </div>

      {/* Funnel counts */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 20px' }}>
        {counts.map(({ s, n }) => (
          <span key={s} style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: STATUS_COLOR[s] }}>
            {s} · {n}
          </span>
        ))}
      </div>

      {/* Add prospect */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 22, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company name" style={inputStyle(170)} />
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" style={inputStyle(190)} />
        <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="Contact name" style={inputStyle(140)} />
        <input value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} placeholder="Contact email" style={inputStyle(190)} />
        <select value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} style={inputStyle(150)}>
          <option value="intl_dev">International dev</option>
          <option value="us_domestic">US domestic</option>
        </select>
        <input value={form.looking_for} onChange={(e) => setForm({ ...form, looking_for: e.target.value })} placeholder="Looking for (e.g. EU partner for Peru project)" style={inputStyle(260)} />
        <button onClick={addProspect} disabled={adding || !form.name.trim()} style={btnStyle(adding || !form.name.trim())}>
          {adding ? 'Adding…' : '+ Add prospect'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 76 }} />)}</div>
      ) : prospects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📮</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)' }}>No prospects yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Add a company above, then run the pipeline on it.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {prospects.map((p) => {
            const open = openId === p.id;
            const running = busy[p.id];
            return (
              <div key={p.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOpenId(open ? null : p.id)}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{p.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: '#fff', background: STATUS_COLOR[p.status] || '#94A3B8' }}>{p.status}</span>
                  {p.match_score != null && <span style={{ fontSize: 12, fontWeight: 700, color: p.match_score >= 65 ? 'var(--success)' : 'var(--text-muted)' }}>fit {Math.round(p.match_score)}</span>}
                  {p.hook_tender?.title && <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎯 {p.hook_tender.title}</span>}
                  {p.preview_viewed_at && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>👁 viewed</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{p.market === 'us_domestic' ? 'US' : 'Intl'} {open ? '▴' : '▾'}</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {running ? (
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>⏳ {running}…</span>
                  ) : (
                    <>
                      {p.status === 'sourced' && <ActionBtn onClick={() => runSteps(p.id, ['research'], 'Researching')}>1 · Research</ActionBtn>}
                      {p.status === 'sourced' && <ActionBtn onClick={() => runSteps(p.id, ['research', 'match', 'draft'], 'Running full pipeline')}>⚡ Research → match → draft</ActionBtn>}
                      {p.status === 'researched' && <ActionBtn onClick={() => runSteps(p.id, ['match'], 'Matching')}>2 · Match</ActionBtn>}
                      {p.status === 'matched' && <ActionBtn onClick={() => runSteps(p.id, ['draft'], 'Drafting')}>3 · Draft email</ActionBtn>}
                      {p.status === 'drafted' && (
                        <>
                          <ActionBtn primary onClick={() => { if (confirm(`Send this email to ${p.contact_email || '(no email set!)'}?`)) runSteps(p.id, ['send'], 'Sending'); }}>
                            ✉️ Send via Resend
                          </ActionBtn>
                          <ActionBtn onClick={() => { navigator.clipboard.writeText(p.draft_html || ''); }}>Copy HTML</ActionBtn>
                          <ActionBtn onClick={() => setStatus(p.id, 'contacted')}>Mark contacted (sent manually)</ActionBtn>
                          <ActionBtn onClick={() => runSteps(p.id, ['draft'], 'Redrafting')}>↻ Redraft</ActionBtn>
                        </>
                      )}
                      {p.status === 'contacted' && <ActionBtn onClick={() => setStatus(p.id, 'replied')}>Mark replied</ActionBtn>}
                      {(p.status === 'contacted' || p.status === 'replied') && <ActionBtn primary onClick={() => setStatus(p.id, 'activated')}>Mark activated 🎉</ActionBtn>}
                      {p.status !== 'dead' && p.status !== 'activated' && <ActionBtn onClick={() => setStatus(p.id, 'dead')}>✕ Dead</ActionBtn>}
                    </>
                  )}
                  {errs[p.id] && <span style={{ fontSize: 12, color: '#EF4444' }}>{errs[p.id]}</span>}
                </div>

                {/* Expanded detail */}
                {open && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gap: 12 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{p.website}</a>}
                      {p.contact_name && <span>{p.contact_name}</span>}
                      {p.contact_email && <span>{p.contact_email}</span>}
                      {p.looking_for && <span>🧩 {p.looking_for}</span>}
                    </div>
                    {p.match_rationale && (
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, background: 'var(--bg-elevated)', borderRadius: 8, padding: 12 }}>
                        <strong>Match rationale:</strong> {p.match_rationale}
                      </div>
                    )}
                    {p.preview_token && (
                      <div style={{ fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Preview link: </span>
                        <a href={`/preview/${p.preview_token}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{siteUrl}/preview/{p.preview_token.slice(0, 10)}…</a>
                      </div>
                    )}
                    {p.draft_subject && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          Subject: {p.draft_subject}
                        </div>
                        <div style={{ padding: 14, background: '#fff' }} dangerouslySetInnerHTML={{ __html: p.draft_html || '' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
      padding: '7px 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
      border: primary ? 'none' : '1px solid var(--border)',
      background: primary ? 'var(--accent)' : 'var(--bg-elevated)',
      color: primary ? '#fff' : 'var(--text-primary)',
    }}>
      {children}
    </button>
  );
}

function inputStyle(width: number): React.CSSProperties {
  return {
    width, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  };
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '9px 16px', borderRadius: 8, border: 'none',
    background: disabled ? 'var(--bg-elevated)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 13, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
  };
}
