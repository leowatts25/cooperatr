'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

// ============================================================================
// /admin/funding — funding-sources registry (Part B: non-notice funding)
// Standing funds, financial instruments, foundations, impact capital — ongoing
// vehicles you engage with relationally, not dated tenders. Seeded with Global
// Gateway facilities/mechanisms.
// ============================================================================

interface FundingSource {
  id: string;
  name: string;
  type: string | null;
  funder: string | null;
  themes: string[] | null;
  geographies: string[] | null;
  instrument: string | null;
  access_mode: string | null;
  status: string;
  cadence: string | null;
  eligibility_notes: string | null;
  url: string | null;
  source_provenance: string | null;
  last_reviewed_at: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  standing_fund: 'Standing fund',
  financial_instrument: 'Financial instrument',
  blended_facility: 'Blended facility',
  dfi_window: 'DFI window',
  impact_fund: 'Impact fund',
  foundation: 'Foundation',
  initiative: 'Initiative',
};

export default function AdminFundingPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [sources, setSources] = useState<FundingSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('active');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchSources = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, status });
      const res = await fetch(`/api/admin/funding-sources?${params}`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) { router.push('/'); return; }
      setIsAdmin(true);
    }
    init();
  }, [router]);

  useEffect(() => { if (isAdmin) fetchSources(statusTab); }, [isAdmin, statusTab, fetchSources]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/funding-sources?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error('update failed');
      await fetchSources(statusTab);
    } catch (err) { console.error(err); } finally { setBusyId(null); }
  }

  if (!isAdmin) {
    return <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: 'var(--text-muted)' }}>Checking access…</div></div>;
  }

  const tabs = ['active', 'paused', 'closed'];

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Funding sources</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Standing funds, instruments & facilities (no dated calls) — ongoing vehicles you engage relationally. Seeded with Global Gateway.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {tabs.map((s) => {
          const active = statusTab === s;
          return (
            <button key={s} onClick={() => setStatusTab(s)} style={{
              padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent)' : 'var(--bg-surface)',
              color: active ? '#fff' : 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
            }}>{s}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>{[1, 2, 3].map((i) => <div key={i} style={{ height: 110, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}</div>
      ) : sources.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏛️</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)' }}>No {statusTab} funding sources</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {sources.map((s) => (
            <div key={s.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', opacity: busyId === s.id ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    {s.type && <span style={chip('#8B5CF6')}>{TYPE_LABEL[s.type] || s.type}</span>}
                    {s.instrument && <span style={chip('#0EA5E9')}>{s.instrument}</span>}
                    {s.access_mode && <span style={chip('#F59E0B')}>{s.access_mode.replace(/_/g, ' ')}</span>}
                    {!s.last_reviewed_at && <span style={chip('#EF4444')}>⚠ needs review</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                    {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{s.name} ↗</a> : s.name}
                  </div>
                  {s.funder && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.funder}</div>}
                  {s.eligibility_notes && <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginTop: 8 }}>{s.eligibility_notes}</div>}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    {(s.themes || []).length > 0 && <span><strong style={{ color: 'var(--text-primary)' }}>Themes:</strong> {(s.themes || []).map((t) => t.replace(/_/g, ' ')).join(', ')}</span>}
                    {(s.geographies || []).length > 0 && <span><strong style={{ color: 'var(--text-primary)' }}>Geo:</strong> {(s.geographies || []).join(', ')}</span>}
                    {s.cadence && <span><strong style={{ color: 'var(--text-primary)' }}>Cadence:</strong> {s.cadence}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
                  {!s.last_reviewed_at && (
                    <button onClick={() => patch(s.id, { markReviewed: true })} disabled={busyId === s.id} style={primaryBtn}>✓ Mark reviewed</button>
                  )}
                  {statusTab === 'active' ? (
                    <button onClick={() => patch(s.id, { status: 'closed' })} disabled={busyId === s.id} style={ghost}>Archive</button>
                  ) : (
                    <button onClick={() => patch(s.id, { status: 'active' })} disabled={busyId === s.id} style={ghost}>Reactivate</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function chip(color: string): React.CSSProperties {
  return { fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, background: `${color}20`, color };
}
const primaryBtn: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const ghost: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
