'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

// ============================================================================
// /admin/bd — weekly BD review dashboard
// Table of scored (tender × scouted_company) pairings sorted by score desc.
// Filters: status chip + "warm-intro only" toggle.
// Action: "Pursue" → PATCH status='pursuing', then navigate to M2 stub
//   (/proposals/new?tender_id=...&company_id=...).
// ============================================================================

interface BdMatch {
  id: string;
  score: number | null;
  rationale: string | null;
  fit_dimensions: Record<string, number> | null;
  partner_stack: string[] | null;
  risks: string[] | null;
  status: string;
  notes: string | null;
  warm_intro_via_contact_id: string | null;
  matched_at: string;
  reviewed_at: string | null;
  tender: {
    id: string;
    source: string;
    source_ref: string;
    url: string | null;
    title: string | null;
    donor: string | null;
    buyer: string | null;
    country: string | null;
    sectors: string[] | null;
    value_usd_min: number | null;
    value_usd_max: number | null;
    deadline_at: string | null;
  } | null;
  company: {
    id: string;
    name: string;
    country: string | null;
    website: string | null;
    sectors: string[] | null;
    size_band: string | null;
  } | null;
  warm_contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    company_name: string | null;
    linkedin_url: string | null;
  } | null;
}

interface BdResponse {
  matches: BdMatch[];
  totals: { byStatus: Record<string, number>; returned: number };
}

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'suggested', label: 'Suggested' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'pursuing', label: 'Pursuing' },
  { key: 'dropped', label: 'Dropped' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'all', label: 'All' },
];

export default function AdminBdPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<BdMatch[]>([]);
  const [totals, setTotals] = useState<BdResponse['totals']>({ byStatus: {}, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [statusTab, setStatusTab] = useState('suggested');
  const [warmOnly, setWarmOnly] = useState(false);
  const [pursuingId, setPursuingId] = useState<string | null>(null);

  const fetchMatches = useCallback(async (status: string, warm: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, status });
      if (warm) params.set('warm_only', 'true');
      const res = await fetch(`/api/admin/bd?${params}`);
      const data = (await res.json()) as BdResponse;
      setMatches(data.matches || []);
      setTotals(data.totals || { byStatus: {}, returned: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        router.push('/');
        return;
      }
      setIsAdmin(true);
      await fetchMatches('suggested', false);
    }
    init();
  }, [router, fetchMatches]);

  async function handlePursue(match: BdMatch) {
    if (!match.tender || !match.company) return;
    setPursuingId(match.id);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      const res = await fetch(`/api/admin/bd?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId: match.id, status: 'pursuing' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Pursue failed');
      }
      // Stub hand-off to M2 (Proposal Writer). The /proposals/new page does
      // not yet read tender_id / company_id; this commit just establishes
      // the contract — full M2 wiring is a separate chunk.
      const ph = new URLSearchParams({
        tender_id: match.tender.id,
        company_id: match.company.id,
      });
      router.push(`/proposals/new?${ph}`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Pursue failed');
      setPursuingId(null);
    }
  }

  async function handleStatusChange(matchId: string, status: string) {
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      const res = await fetch(`/api/admin/bd?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, status }),
      });
      if (!res.ok) throw new Error('status update failed');
      await fetchMatches(statusTab, warmOnly);
    } catch (err) {
      console.error(err);
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>Checking access…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>
          BD scanner — Weekly review
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Scored (tender × company) pairings. Pursue moves the match into M2 and hands the pair off to the Proposal Writer.
        </p>
      </div>

      {/* Status chips + warm toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATUS_TABS.map((tab) => {
          const count = tab.key === 'all'
            ? Object.values(totals.byStatus).reduce((a, b) => a + b, 0)
            : (totals.byStatus[tab.key] || 0);
          const active = statusTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setStatusTab(tab.key); fetchMatches(tab.key, warmOnly); }}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {tab.label} <span style={{ opacity: 0.7, fontWeight: 500 }}>· {count}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={warmOnly}
            onChange={(e) => { setWarmOnly(e.target.checked); fetchMatches(statusTab, e.target.checked); }}
          />
          Warm intros only
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 100, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <EmptyState statusTab={statusTab} warmOnly={warmOnly} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              onPursue={handlePursue}
              onStatusChange={handleStatusChange}
              pursuing={pursuingId === m.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ statusTab, warmOnly }: { statusTab: string; warmOnly: boolean }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: 60,
      background: 'var(--bg-surface)',
      borderRadius: 16,
      border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
        No matches in <em>{statusTab}</em>{warmOnly ? ' with warm intros' : ''}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Matches appear here after the daily ingest+match cron runs against ingested tenders.
      </div>
    </div>
  );
}

function MatchRow({
  match,
  onPursue,
  onStatusChange,
  pursuing,
}: {
  match: BdMatch;
  onPursue: (m: BdMatch) => void;
  onStatusChange: (id: string, status: string) => void;
  pursuing: boolean;
}) {
  const t = match.tender;
  const c = match.company;
  const w = match.warm_contact;
  const score = Math.round(match.score ?? 0);
  const scoreColor = score >= 85 ? '#22C55E' : score >= 65 ? '#F59E0B' : score >= 40 ? '#FB923C' : '#EF4444';
  const valueLabel = formatValue(t?.value_usd_min ?? null, t?.value_usd_max ?? null);
  const deadline = t?.deadline_at ? new Date(t.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${w ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: '14px 18px',
      display: 'grid',
      gridTemplateColumns: '72px 1fr auto',
      gap: 16,
      alignItems: 'start',
    }}>
      {/* Score block */}
      <div style={{
        background: '#0F1623',
        border: `2px solid ${scoreColor}`,
        borderRadius: 10,
        padding: '10px 6px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>score</div>
      </div>

      {/* Main column */}
      <div>
        {/* Top tag row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={badgeStyle('source')}>{t?.source || '—'}</span>
          {t?.donor && <span style={badgeStyle('donor')}>{t.donor}</span>}
          {t?.country && <span style={badgeStyle('country')}>📍 {t.country}</span>}
          {(t?.sectors || []).map((s) => <span key={s} style={badgeStyle('sector')}>{s.replace(/_/g, ' ')}</span>)}
          {w && (
            <span style={{ ...badgeStyle('warm'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              🤝 warm: {[w.first_name, w.last_name].filter(Boolean).join(' ') || '(contact)'}
              {w.position && <em style={{ opacity: 0.8, fontStyle: 'normal' }}> · {w.position}</em>}
            </span>
          )}
        </div>

        {/* Tender title */}
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t?.url
            ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                {t.title || t.source_ref} ↗
              </a>
            : t?.title || t?.source_ref || '(deleted tender)'}
        </div>

        {/* Tender meta */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          {t?.buyer && <span>{t.buyer}</span>}
          {valueLabel && <span>{valueLabel}</span>}
          {deadline && <span style={{ color: '#F59E0B' }}>Deadline {deadline}</span>}
        </div>

        {/* Company row */}
        <div style={{
          fontSize: 13, color: 'var(--text-primary)', marginBottom: 8,
          padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <strong>{c?.name || '(deleted company)'}</strong>
          {c?.country && <span style={{ color: 'var(--text-muted)' }}>· {c.country}</span>}
          {c?.size_band && <span style={badgeStyle('size')}>{c.size_band}</span>}
          {(c?.sectors || []).map((s) => <span key={s} style={badgeStyle('sectorSm')}>{s.replace(/_/g, ' ')}</span>)}
          {c?.website && <a href={c.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 11 }}>↗ site</a>}
        </div>

        {/* Rationale */}
        {match.rationale && (
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 8 }}>
            {match.rationale}
          </div>
        )}

        {/* Fit dimensions + extras */}
        {match.fit_dimensions && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            {Object.entries(match.fit_dimensions).map(([k, v]) => (
              <span key={k}>
                <strong style={{ color: 'var(--text-primary)' }}>{k}</strong> {(v * 100).toFixed(0)}
              </span>
            ))}
          </div>
        )}
        {match.partner_stack && match.partner_stack.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Partners:</strong> {match.partner_stack.join(' · ')}
          </div>
        )}
        {match.risks && match.risks.length > 0 && (
          <div style={{ fontSize: 12, color: '#F59E0B', marginTop: 4 }}>
            <strong>Risks:</strong> {match.risks.join(' · ')}
          </div>
        )}
      </div>

      {/* Action column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch', minWidth: 130 }}>
        <button
          onClick={() => onPursue(match)}
          disabled={pursuing || match.status === 'pursuing' || !t || !c}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: pursuing || match.status === 'pursuing' ? 'var(--bg-elevated)' : 'var(--accent)',
            color: pursuing || match.status === 'pursuing' ? 'var(--text-muted)' : '#0F1623',
            fontSize: 12,
            fontWeight: 700,
            cursor: pursuing || match.status === 'pursuing' ? 'not-allowed' : 'pointer',
          }}
        >
          {pursuing ? 'Pursuing…' : match.status === 'pursuing' ? '✓ Pursuing' : 'Pursue →'}
        </button>
        <select
          value={match.status}
          onChange={(e) => onStatusChange(match.id, e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            fontSize: 11,
          }}
        >
          <option value="suggested">suggested</option>
          <option value="reviewed">reviewed</option>
          <option value="pursuing">pursuing</option>
          <option value="dropped">dropped</option>
          <option value="won">won</option>
          <option value="lost">lost</option>
        </select>
      </div>
    </div>
  );
}

function badgeStyle(kind: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    source: ['#0EA5E9', '#0EA5E920'],
    donor: ['#8B5CF6', '#8B5CF620'],
    country: ['#22C55E', '#22C55E20'],
    sector: ['#EC4899', '#EC489920'],
    sectorSm: ['#EC4899', '#EC489915'],
    size: ['#F59E0B', '#F59E0B20'],
    warm: ['#F59E0B', '#F59E0B25'],
  };
  const [fg, bg] = colors[kind] || ['#7A90A8', '#7A90A820'];
  return {
    fontSize: kind === 'sectorSm' ? 10 : 10,
    padding: '2px 8px',
    borderRadius: 8,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    background: bg,
    color: fg,
  };
}

function formatValue(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`);
  if (min === max && min != null) return fmt(min);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}
