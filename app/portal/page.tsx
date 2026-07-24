'use client';

import { useEffect, useState } from 'react';
import { createAuthClient, signOut } from '@/app/lib/supabase-auth';

// ============================================================================
// /portal — the CLIENT-facing view. A client's CEO signs in and sees ONLY
// their own company's profile + the tenders ranked for them. Data is scoped
// server-side to the authenticated user (owner_user_id); nothing leaks across
// clients. Read-only for now.
// ============================================================================

interface Client {
  id: string; name: string; website: string | null; description: string | null;
  sectors: string[] | null; geographies: string[] | null; size_band: string | null;
  capabilities: string | null; ceo_name: string | null; market: string | null;
}
interface Match {
  id: string; score: number | null; rationale: string | null;
  fit_dimensions: Record<string, number> | null; partner_stack: string[] | null; risks: string[] | null;
  tender: { id: string; source: string; url: string | null; title: string | null; donor: string | null;
            country: string | null; value_usd_min: number | null; value_usd_max: number | null; deadline_at: string | null } | null;
}

export default function PortalPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-client' | 'signed-out'>('loading');
  const [client, setClient] = useState<Client | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createAuthClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/auth?next=/portal'; return; }
      try {
        const res = await fetch('/api/portal', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.status === 401) { window.location.href = '/auth?next=/portal'; return; }
        const data = await res.json();
        if (!data.client) { setStatus('no-client'); return; }
        setClient(data.client);
        setMatches(data.matches || []);
        setStatus('ready');
      } catch { setStatus('no-client'); }
    }
    load();
  }, []);

  if (status === 'loading') {
    return <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading your portal…</div>;
  }
  if (status === 'no-client') {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>No portal assigned yet</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>Your account isn&apos;t linked to a client company yet. Please contact your Cooperatr contact to set it up.</p>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--accent)' }}>Cooperatr · Client portal</div>
        </div>
        <button onClick={signOut} style={ghostBtn}>Sign out</button>
      </div>

      {/* Company header */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 8 }}>{client!.name}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {client!.size_band && <span style={chip('#F59E0B')}>{client!.size_band}</span>}
          {(client!.sectors || []).map((s) => <span key={s} style={chip('#EC4899')}>{s.replace(/_/g, ' ')}</span>)}
          {(client!.geographies || []).slice(0, 6).map((g) => <span key={g} style={chip('#22C55E')}>📍 {g}</span>)}
        </div>
        {client!.description && <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55 }}>{client!.description}</p>}
      </div>

      <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        Funding opportunities matched for you · {matches.length}
      </h2>

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>No opportunities yet — your Cooperatr team is curating them.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {matches.map((m) => <PortalMatch key={m.id} match={m} />)}
        </div>
      )}

      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 32 }}>
        Curated by Cooperatr for {client!.name}. Opportunities are ranked by fit; your Cooperatr team can walk you through any of them.
      </div>
    </div>
  );
}

function PortalMatch({ match }: { match: Match }) {
  const t = match.tender;
  const score = Math.round(match.score ?? 0);
  const color = score >= 65 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#FB923C';
  const dl = t?.deadline_at ? new Date(t.deadline_at) : null;
  const rolling = !dl || isNaN(dl.getTime()) || dl.getTime() < Date.now();
  const value = t && (t.value_usd_min != null || t.value_usd_max != null)
    ? `$${Math.round((t.value_usd_min ?? t.value_usd_max ?? 0) / 1000)}k` : null;
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'grid', gridTemplateColumns: '58px 1fr', gap: 14, alignItems: 'start' }}>
      <div style={{ background: '#0F1623', border: `2px solid ${color}`, borderRadius: 10, padding: '9px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 3 }}>fit</div>
      </div>
      <div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {t?.donor && <span style={chip('#8B5CF6')}>{t.donor}</span>}
          {t?.country && <span style={chip('#22C55E')}>📍 {t.country.length > 24 ? t.country.slice(0, 24) + '…' : t.country}</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {t?.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{t.title} ↗</a> : t?.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          {value && <span>{value}</span>}
          <span style={{ color: rolling ? '#22C55E' : '#F59E0B' }}>{rolling ? 'Open / rolling' : `Deadline ${dl!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</span>
        </div>
        {match.rationale && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 8 }}>{match.rationale}</div>}
      </div>
    </div>
  );
}

function chip(c: string): React.CSSProperties {
  return { fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, background: `${c}20`, color: c };
}
const ghostBtn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 16 };
