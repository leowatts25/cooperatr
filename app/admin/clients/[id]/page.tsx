'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

// ============================================================================
// /admin/clients/[id] — a client's own BD view: profile + tenders ranked FOR
// this client (client × tender). Tenant-ready: this whole view is keyed by the
// client id, so a client-facing login later just scopes to their own id.
// ============================================================================

interface Client {
  id: string; name: string; website: string | null; description: string | null;
  sectors: string[] | null; geographies: string[] | null; size_band: string | null;
  capabilities: string | null; past_wins: string[] | null; certifications: string[] | null;
  ceo_name: string | null; ceo_background: string | null; ceo_linkedin: string | null;
  market: string | null;
  last_researched_at: string | null;
}
interface Match {
  id: string; score: number | null; rationale: string | null;
  fit_dimensions: Record<string, number> | null; partner_stack: string[] | null; risks: string[] | null;
  tender: { id: string; source: string; url: string | null; title: string | null; donor: string | null;
            country: string | null; sectors: string[] | null; value_usd_min: number | null; value_usd_max: number | null;
            deadline_at: string | null; tender_fit_score: number | null; tender_fit_verdict: string | null } | null;
}

export default function ClientPortalPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = String(params?.id || '');
  const [isAdmin, setIsAdmin] = useState(false);
  const [client, setClient] = useState<Client | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clients?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}&clientId=${clientId}`);
      const data = await res.json();
      setClient(data.client || null);
      setMatches(data.matches || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) { router.push('/'); return; }
      setIsAdmin(true);
    }
    init();
  }, [router]);
  useEffect(() => { if (isAdmin && clientId) fetchData(); }, [isAdmin, clientId, fetchData]);

  async function runMatch() {
    setMatching(true); setMsg(null);
    try {
      const res = await fetch(`/api/admin/clients/match?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'match failed');
      setMsg(`Scored ${data.scored} tender${data.scored === 1 ? '' : 's'} for this client.`);
      await fetchData();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Match failed'); } finally { setMatching(false); }
  }

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; tempPassword: string | null; reused: boolean; emailed: boolean; emailError: string | null } | null>(null);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  async function inviteCeo() {
    if (!inviteEmail.trim()) return;
    setInviting(true); setInviteErr(null); setInviteResult(null);
    try {
      const res = await fetch(`/api/admin/clients/invite?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, email: inviteEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'invite failed');
      setInviteResult({ email: data.email, tempPassword: data.tempPassword, reused: data.reused, emailed: data.emailed, emailError: data.emailError });
      setInviteEmail('');
    } catch (e) { setInviteErr(e instanceof Error ? e.message : 'Invite failed'); } finally { setInviting(false); }
  }

  async function setMarket(market: string) {
    try {
      await fetch(`/api/admin/clients?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clientId, market }),
      });
      setClient((c) => (c ? { ...c, market } : c));
      setMsg('Market updated — re-match to refresh the pool.');
    } catch (e) { console.error(e); }
  }

  if (!isAdmin) return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Checking access…</div></div>;

  return (
    <div style={{ padding: '28px 24px', maxWidth: 1180, margin: '0 auto' }}>
      <Link href="/admin/clients" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← All clients</Link>

      {loading || !client ? (
        <div style={{ height: 160, background: 'var(--bg-surface)', borderRadius: 12, marginTop: 12, animation: 'skeleton 1.5s infinite' }} />
      ) : (
        <>
          {/* Profile */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', marginTop: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 26, color: 'var(--text-primary)', marginBottom: 6 }}>{client.name}</h1>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {client.size_band && <span style={chip('#F59E0B')}>{client.size_band}</span>}
                  {(client.sectors || []).map((s) => <span key={s} style={chip('#EC4899')}>{s.replace(/_/g, ' ')}</span>)}
                  {(client.geographies || []).slice(0, 6).map((g) => <span key={g} style={chip('#22C55E')}>📍 {g}</span>)}
                </div>
                {client.website && <a href={client.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent)' }}>{client.website} ↗</a>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Market
                  <select value={client.market || 'intl_dev'} onChange={(e) => setMarket(e.target.value)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12 }}>
                    <option value="intl_dev">International dev</option>
                    <option value="us_domestic">US domestic</option>
                  </select>
                </label>
                <button onClick={runMatch} disabled={matching} style={{ padding: '11px 18px', borderRadius: 8, border: 'none', background: matching ? 'var(--bg-elevated)' : 'var(--accent)', color: matching ? 'var(--text-muted)' : '#fff', fontSize: 14, fontWeight: 700, cursor: matching ? 'wait' : 'pointer' }}>
                  {matching ? 'Matching…' : matches.length ? '↻ Re-match tenders' : '🎯 Match tenders'}
                </button>
              </div>
            </div>
            {msg && <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 8 }}>{msg}</div>}
            {client.description && <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55, marginTop: 12 }}>{client.description}</p>}
            {client.capabilities && <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Capabilities:</strong> {client.capabilities}</p>}
            {client.ceo_name && <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 8 }}><strong style={{ color: 'var(--text-primary)' }}>CEO — {client.ceo_name}:</strong> {client.ceo_background || '—'}</p>}
            {(client.past_wins || []).length > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}><strong style={{ color: 'var(--text-primary)' }}>Past wins:</strong> {(client.past_wins || []).join(' · ')}</p>}

            {/* Invite the client's CEO to their own login */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', marginBottom: 6 }}>Client login</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="ceo@company.com" style={{ width: 240, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13 }} />
                <button onClick={inviteCeo} disabled={inviting || !inviteEmail.trim()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: inviting || !inviteEmail.trim() ? 'var(--bg-elevated)' : 'var(--accent)', color: inviting || !inviteEmail.trim() ? 'var(--text-muted)' : '#fff', fontSize: 13, fontWeight: 700, cursor: inviting ? 'wait' : 'pointer' }}>
                  {inviting ? 'Creating…' : '✉ Give this client a login'}
                </button>
                {inviteErr && <span style={{ fontSize: 12, color: '#EF4444' }}>{inviteErr}</span>}
              </div>
              {inviteResult && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-primary)', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 8, padding: '10px 12px' }}>
                  {inviteResult.reused
                    ? <>Linked <strong>{inviteResult.email}</strong> (existing account) to this client and reset its password. Share these — they sign in at <strong>/portal</strong>:</>
                    : <>Account created + linked. Share these — they sign in at <strong>/portal</strong>:</>}
                  <br />Email: <strong>{inviteResult.email}</strong>
                  {inviteResult.tempPassword && <><br />Password: <strong style={{ fontFamily: 'monospace' }}>{inviteResult.tempPassword}</strong></>}
                  <br />{inviteResult.emailed
                    ? <span style={{ color: '#22C55E' }}>✉ Login email sent to the client automatically.</span>
                    : <span style={{ color: '#F59E0B' }}>Email not sent{inviteResult.emailError ? ` (${inviteResult.emailError})` : ''} — share the details above manually.</span>}
                </div>
              )}
            </div>
          </div>

          {/* Matched tenders */}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            Tenders ranked for {client.name} · {matches.length}
          </div>
          {matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 44, background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)' }}>No matches yet</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Click “Match tenders” to score the open pipeline against {client.name}’s capabilities.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {matches.map((m) => <ClientMatchRow key={m.id} match={m} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClientMatchRow({ match }: { match: Match }) {
  const t = match.tender;
  const score = Math.round(match.score ?? 0);
  const color = score >= 85 ? '#22C55E' : score >= 65 ? '#F59E0B' : score >= 40 ? '#FB923C' : '#EF4444';
  const dl = t?.deadline_at ? new Date(t.deadline_at) : null;
  const rolling = !dl || isNaN(dl.getTime()) || dl.getTime() < Date.now();
  const value = t && (t.value_usd_min != null || t.value_usd_max != null)
    ? `$${Math.round((t.value_usd_min ?? t.value_usd_max ?? 0) / 1000)}k${t.value_usd_max && t.value_usd_max !== t.value_usd_min ? '+' : ''}` : null;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: '64px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: '#0F1623', border: `2px solid ${color}`, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>fit</div>
      </div>
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
          <span style={chip('#0EA5E9')}>{t?.source}</span>
          {t?.donor && <span style={chip('#8B5CF6')}>{t.donor}</span>}
          {t?.country && <span style={chip('#22C55E')}>📍 {t.country.length > 22 ? t.country.slice(0, 22) + '…' : t.country}</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t?.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{t.title} ↗</a> : t?.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          {value && <span>{value}</span>}
          <span style={{ color: rolling ? '#22C55E' : '#F59E0B' }}>{rolling ? 'Open / rolling' : `Deadline ${dl!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</span>
        </div>
        {match.rationale && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 8 }}>{match.rationale}</div>}
        {match.fit_dimensions && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {Object.entries(match.fit_dimensions).map(([k, v]) => <span key={k}><strong style={{ color: 'var(--text-primary)' }}>{k.replace(/_/g, ' ')}</strong> {(v * 100).toFixed(0)}</span>)}
          </div>
        )}
        {match.partner_stack && match.partner_stack.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}><strong style={{ color: 'var(--text-primary)' }}>Partners:</strong> {match.partner_stack.join(' · ')}</div>}
        {match.risks && match.risks.length > 0 && <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}><strong>Risks:</strong> {match.risks.join(' · ')}</div>}
      </div>
    </div>
  );
}

function chip(color: string): React.CSSProperties {
  return { fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, background: `${color}20`, color };
}
