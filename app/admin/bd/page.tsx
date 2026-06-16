'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';
import { useTranslation } from '@/app/lib/i18n/context';

// Helper: pick the best translation for the user's current locale, with
// fallback chain locale → en → null.
function pickTranslation(
  translations: Record<string, { title?: string; description?: string }> | null | undefined,
  locale: string,
): { title?: string; description?: string } | null {
  if (!translations) return null;
  return translations[locale] || translations.en || null;
}

// ============================================================================
// /admin/bd — BD pipeline (3 stages)
//   ① Verify   — confirm AI-screened tenders as real opportunities
//   ② Match    — two columns: verified tenders ↔ ranked company candidates
//   ③ Pursuing — pairs moved forward to the proposal stage
// ============================================================================

type Stage = 'verify' | 'match' | 'pursue';

interface TenderFitReasons {
  sector_fit?: number;
  geography_fit?: number;
  deal_band_fit?: number;
  reasons?: string[];
}

interface TenderItem {
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
  translations: Record<string, { title?: string; description?: string }> | null;
  source_language: string | null;
  tender_fit_score: number | null;
  tender_fit_verdict: string | null;
  tender_fit_reasons: TenderFitReasons | null;
  bd_status: string;
  match_count: number;
  top_score: number;
}

interface TendersResponse {
  tenders: TenderItem[];
  totals: { byStage: Record<string, number>; returned: number };
}

interface BdMatch {
  id: string;
  score: number | null;
  rationale: string | null;
  fit_dimensions: Record<string, number> | null;
  partner_stack: string[] | null;
  risks: string[] | null;
  status: string;
  notes: string | null;
  opportunity_expansion: {
    consortium_partners?: string[];
    impact_investors?: string[];
    blended_finance_angle?: string;
    expanded_impact?: string;
  } | null;
  feedback: string | null;
  feedback_signal: string | null;
  feedback_at: string | null;
  warm_intro_via_contact_id: string | null;
  matched_at: string;
  reviewed_at: string | null;
  tender: (Omit<TenderItem, 'bd_status' | 'match_count' | 'top_score'>) | null;
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

interface MatchesResponse {
  matches: BdMatch[];
  totals: { byStatus: Record<string, number>; returned: number };
}

const STAGES: Array<{ key: Stage; label: string; hint: string }> = [
  { key: 'verify', label: '① Verify tenders', hint: 'Confirm the good opportunities' },
  { key: 'match', label: '② Match companies', hint: 'Rank candidates per tender' },
  { key: 'pursue', label: '③ Pursuing', hint: 'Moved forward' },
];

export default function AdminBdPage() {
  const router = useRouter();
  const { locale } = useTranslation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [stage, setStage] = useState<Stage>('verify');

  useEffect(() => {
    async function init() {
      const user = await getCurrentUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        router.push('/');
        return;
      }
      setIsAdmin(true);
    }
    init();
  }, [router]);

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>Checking access…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>
          BD pipeline
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Verify good tenders → match them to ranked companies → pursue the best pairs.
        </p>
      </div>

      {/* Stage switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {STAGES.map((s) => {
          const active = stage === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>{s.label}</div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75, marginTop: 2 }}>{s.hint}</div>
            </button>
          );
        })}
      </div>

      {stage === 'verify' && <VerifyStage locale={locale} />}
      {stage === 'match' && <MatchStage locale={locale} />}
      {stage === 'pursue' && <PursueStage locale={locale} />}
    </div>
  );
}

// ============================================================================
// Stage 1 — Verify tenders
// ============================================================================

function VerifyStage({ locale }: { locale: string }) {
  const [tenders, setTenders] = useState<TenderItem[]>([]);
  const [byStage, setByStage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [includeSkip, setIncludeSkip] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTenders = useCallback(async (skip: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, resource: 'tenders', stage: 'pending' });
      if (skip) params.set('include_skip', 'true');
      const res = await fetch(`/api/admin/bd?${params}`);
      const data = (await res.json()) as TendersResponse;
      setTenders(data.tenders || []);
      setByStage(data.totals?.byStage || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenders(includeSkip); }, [fetchTenders, includeSkip]);

  async function setBdStatus(tenderId: string, bd_status: 'verified' | 'rejected') {
    setBusyId(tenderId);
    try {
      const res = await fetch(`/api/admin/bd?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId, bd_status }),
      });
      if (!res.ok) throw new Error('update failed');
      // Optimistic: drop from the pending list.
      setTenders((prev) => prev.filter((t) => t.id !== tenderId));
      setByStage((prev) => ({
        ...prev,
        pending: Math.max(0, (prev.pending || 0) - 1),
        [bd_status]: (prev[bd_status] || 0) + 1,
      }));
    } catch (err) {
      console.error(err);
      alert('Could not update tender');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Pending <strong style={{ color: 'var(--text-primary)' }}>{byStage.pending ?? 0}</strong>
          {'  ·  '}Verified <strong style={{ color: '#22C55E' }}>{byStage.verified ?? 0}</strong>
          {'  ·  '}Rejected <strong style={{ color: 'var(--text-muted)' }}>{byStage.rejected ?? 0}</strong>
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={includeSkip} onChange={(e) => setIncludeSkip(e.target.checked)} />
          Show low-fit (skip-rated)
        </label>
      </div>

      {loading ? (
        <SkeletonList />
      ) : tenders.length === 0 ? (
        <Empty icon="✅" title="No tenders awaiting review" sub="New tenders appear here after the ingest + tender-fit cron runs. Verified ones move to Step 2." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {tenders.map((t) => (
            <TenderCard
              key={t.id}
              tender={t}
              locale={locale}
              busy={busyId === t.id}
              actions={
                <>
                  <button onClick={() => setBdStatus(t.id, 'verified')} disabled={busyId === t.id} style={primaryBtn(busyId === t.id)}>
                    ✓ Verify
                  </button>
                  <button onClick={() => setBdStatus(t.id, 'rejected')} disabled={busyId === t.id} style={ghostBtn}>
                    ✗ Reject
                  </button>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Stage 2 — Match (two columns: verified tenders ↔ ranked companies)
// ============================================================================

function MatchStage({ locale }: { locale: string }) {
  const [tenders, setTenders] = useState<TenderItem[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matches, setMatches] = useState<BdMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [finding, setFinding] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchTenders = useCallback(async () => {
    setLoadingTenders(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, resource: 'tenders', stage: 'verified' });
      const res = await fetch(`/api/admin/bd?${params}`);
      const data = (await res.json()) as TendersResponse;
      setTenders(data.tenders || []);
      setSelectedId((cur) => cur || data.tenders?.[0]?.id || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTenders(false);
    }
  }, []);

  const fetchMatches = useCallback(async (tenderId: string) => {
    setLoadingMatches(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, resource: 'matches', tender_id: tenderId, status: 'all' });
      const res = await fetch(`/api/admin/bd?${params}`);
      const data = (await res.json()) as MatchesResponse;
      // Hide ones already moved to pursue/won/lost — those live in Step 3.
      setMatches((data.matches || []).filter((m) => !['pursuing', 'won', 'lost'].includes(m.status)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  useEffect(() => { fetchTenders(); }, [fetchTenders]);
  useEffect(() => { if (selectedId) fetchMatches(selectedId); }, [selectedId, fetchMatches]);

  async function findCompanies(tenderId: string) {
    setFinding(true);
    try {
      const res = await fetch(`/api/admin/bd/find-companies?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'find failed');
      await fetchMatches(tenderId);
      await fetchTenders();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Find companies failed');
    } finally {
      setFinding(false);
    }
  }

  async function moveToPursue(matchId: string) {
    setActionId(matchId);
    try {
      const res = await fetch(`/api/admin/bd?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, status: 'pursuing' }),
      });
      if (!res.ok) throw new Error('update failed');
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err) {
      console.error(err);
      alert('Could not move to pursue');
    } finally {
      setActionId(null);
    }
  }

  async function dropMatch(matchId: string) {
    setActionId(matchId);
    try {
      const res = await fetch(`/api/admin/bd?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, status: 'dropped' }),
      });
      if (!res.ok) throw new Error('update failed');
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err) {
      console.error(err);
    } finally {
      setActionId(null);
    }
  }

  const selected = tenders.find((t) => t.id === selectedId) || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
      {/* Left column — verified tenders */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 10 }}>
          Verified tenders
        </div>
        {loadingTenders ? (
          <SkeletonList rows={3} h={72} />
        ) : tenders.length === 0 ? (
          <Empty icon="📥" title="No verified tenders yet" sub="Verify tenders in Step 1 to start matching." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {tenders.map((t) => {
              const active = t.id === selectedId;
              const title = pickTranslation(t.translations, locale)?.title || t.title || t.source_ref;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'rgba(31,108,197,0.08)' : 'var(--bg-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <FitBadge score={t.tender_fit_score} verdict={t.tender_fit_verdict} />
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: t.match_count >= 5 ? '#22C55E20' : t.match_count > 0 ? '#F59E0B20' : 'var(--bg-elevated)',
                      color: t.match_count >= 5 ? '#22C55E' : t.match_count > 0 ? '#F59E0B' : 'var(--text-muted)',
                    }}>
                      {t.match_count} {t.match_count === 1 ? 'company' : 'companies'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                    {title?.slice(0, 90)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {[t.source, t.country, t.donor].filter(Boolean).join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right column — ranked companies for the selected tender */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
            Ranked companies {selected ? `· ${matches.length}` : ''}
          </div>
          <div style={{ flex: 1 }} />
          {selected && (
            <button onClick={() => findCompanies(selected.id)} disabled={finding} style={primaryBtn(finding)}>
              {finding ? 'Finding…' : matches.length > 0 ? '↻ Find more' : '🔎 Find companies'}
            </button>
          )}
        </div>

        {!selected ? (
          <Empty icon="←" title="Select a verified tender" sub="Pick a tender on the left to see its ranked company candidates." />
        ) : loadingMatches ? (
          <SkeletonList rows={3} />
        ) : matches.length === 0 ? (
          <Empty
            icon="🔎"
            title="No companies matched yet"
            sub={finding ? 'Searching the market…' : 'Click “Find companies” to run discovery + matching for this tender (takes ~1 min).'}
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                locale={locale}
                busy={actionId === m.id}
                onPursue={() => moveToPursue(m.id)}
                onDrop={() => dropMatch(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Stage 3 — Pursuing
// ============================================================================

function PursueStage({ locale }: { locale: string }) {
  const [matches, setMatches] = useState<BdMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('pursuing');

  const fetchMatches = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL, resource: 'matches', status });
      const res = await fetch(`/api/admin/bd?${params}`);
      const data = (await res.json()) as MatchesResponse;
      setMatches(data.matches || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMatches(statusTab); }, [fetchMatches, statusTab]);

  async function changeStatus(matchId: string, status: string) {
    try {
      const res = await fetch(`/api/admin/bd?adminEmail=${encodeURIComponent(ADMIN_EMAIL)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, status }),
      });
      if (!res.ok) throw new Error('update failed');
      await fetchMatches(statusTab);
    } catch (err) {
      console.error(err);
    }
  }

  const tabs = [
    { key: 'pursuing', label: 'Pursuing' },
    { key: 'won', label: 'Won' },
    { key: 'lost', label: 'Lost' },
    { key: 'dropped', label: 'Dropped' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const active = statusTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              style={{
                padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent)' : 'var(--bg-surface)',
                color: active ? '#fff' : 'var(--text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList />
      ) : matches.length === 0 ? (
        <Empty icon="🎯" title={`Nothing in ${statusTab}`} sub="Move matches here from Step 2 with the Pursue button." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {matches.map((m) => (
            <MatchRow key={m.id} match={m} locale={locale} mode="pursue" onStatusChange={(s) => changeStatus(m.id, s)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared presentational components
// ============================================================================

function TenderCard({
  tender,
  locale,
  actions,
  busy,
}: {
  tender: TenderItem;
  locale: string;
  actions: React.ReactNode;
  busy: boolean;
}) {
  const t = tender;
  const translated = pickTranslation(t.translations, locale);
  const displayTitle = translated?.title || t.title || t.source_ref || '(tender)';
  const isTranslated = !!translated?.title && translated.title !== t.title;
  const valueLabel = formatValue(t.value_usd_min, t.value_usd_max);
  const deadline = t.deadline_at ? new Date(t.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 18px',
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      gap: 16,
      alignItems: 'start',
      opacity: busy ? 0.6 : 1,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <FitBadge score={t.tender_fit_score} verdict={t.tender_fit_verdict} />
          <span style={badgeStyle('source')}>{t.source}</span>
          {t.donor && <span style={badgeStyle('donor')}>{t.donor}</span>}
          {t.country && <span style={badgeStyle('country')}>📍 {t.country}</span>}
          {(t.sectors || []).map((s) => <span key={s} style={badgeStyle('sector')}>{s.replace(/_/g, ' ')}</span>)}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          {t.url
            ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{displayTitle} ↗</a>
            : displayTitle}
        </div>
        {isTranslated && t.title && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6, opacity: 0.7 }}>
            Original: {t.title}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          {t.buyer && <span>{t.buyer}</span>}
          {valueLabel && <span>{valueLabel}</span>}
          {deadline && <span style={{ color: '#F59E0B' }}>Deadline {deadline}</span>}
        </div>
        {t.tender_fit_reasons?.reasons && t.tender_fit_reasons.reasons.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {t.tender_fit_reasons.reasons.join(' · ')}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
        {actions}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  locale,
  mode = 'match',
  busy,
  onPursue,
  onDrop,
  onStatusChange,
}: {
  match: BdMatch;
  locale: string;
  mode?: 'match' | 'pursue';
  busy?: boolean;
  onPursue?: () => void;
  onDrop?: () => void;
  onStatusChange?: (status: string) => void;
}) {
  const t = match.tender;
  const c = match.company;
  const w = match.warm_contact;
  const score = Math.round(match.score ?? 0);
  const scoreColor = score >= 85 ? '#22C55E' : score >= 65 ? '#F59E0B' : score >= 40 ? '#FB923C' : '#EF4444';
  const translated = pickTranslation(t?.translations, locale);
  const displayTitle = translated?.title || t?.title || t?.source_ref || '(tender)';

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${w ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: '14px 18px',
      display: 'grid',
      gridTemplateColumns: '64px 1fr auto',
      gap: 16,
      alignItems: 'start',
      opacity: busy ? 0.6 : 1,
    }}>
      <div style={{ background: '#0F1623', border: `2px solid ${scoreColor}`, borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>score</div>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {c?.name || '(deleted company)'}
          {c?.country && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>· {c.country}</span>}
          {c?.size_band && <span style={badgeStyle('size')}>{c.size_band}</span>}
          {(c?.sectors || []).map((s) => <span key={s} style={badgeStyle('sectorSm')}>{s.replace(/_/g, ' ')}</span>)}
          {c?.website && <a href={c.website} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 11 }}>↗ site</a>}
        </div>

        {mode === 'pursue' && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
            for {t?.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>{displayTitle?.slice(0, 70)} ↗</a> : displayTitle?.slice(0, 70)}
          </div>
        )}

        {w && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ ...badgeStyle('warm'), display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              🤝 warm: {[w.first_name, w.last_name].filter(Boolean).join(' ') || '(contact)'}
              {w.position && <em style={{ opacity: 0.8, fontStyle: 'normal' }}> · {w.position}</em>}
            </span>
          </div>
        )}

        {match.rationale && (
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 8 }}>{match.rationale}</div>
        )}

        {match.fit_dimensions && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            {Object.entries(match.fit_dimensions).map(([k, v]) => (
              <span key={k}><strong style={{ color: 'var(--text-primary)' }}>{k}</strong> {(v * 100).toFixed(0)}</span>
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
        {match.opportunity_expansion && <OpportunityExpansionBlock expansion={match.opportunity_expansion} />}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 124 }}>
        {mode === 'match' ? (
          <>
            <button onClick={onPursue} disabled={busy} style={primaryBtn(!!busy)}>Pursue →</button>
            <button onClick={onDrop} disabled={busy} style={ghostBtn}>Drop</button>
          </>
        ) : (
          <select
            value={match.status}
            onChange={(e) => onStatusChange?.(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12 }}
          >
            <option value="pursuing">pursuing</option>
            <option value="won">won</option>
            <option value="lost">lost</option>
            <option value="dropped">dropped</option>
          </select>
        )}
      </div>
    </div>
  );
}

function OpportunityExpansionBlock({
  expansion,
}: {
  expansion: NonNullable<BdMatch['opportunity_expansion']>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none',
          background: 'rgba(31,108,197,0.08)', color: 'var(--text-primary)',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>🚀 Opportunity-engine expansion</span>
        <span style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-primary)', display: 'grid', gap: 8 }}>
          {expansion.consortium_partners && expansion.consortium_partners.length > 0 && (
            <div><strong style={{ color: 'var(--text-muted)' }}>Consortium:</strong> {expansion.consortium_partners.join(' · ')}</div>
          )}
          {expansion.impact_investors && expansion.impact_investors.length > 0 && (
            <div><strong style={{ color: 'var(--text-muted)' }}>Impact capital:</strong> {expansion.impact_investors.join(' · ')}</div>
          )}
          {expansion.blended_finance_angle && (
            <div><strong style={{ color: 'var(--text-muted)' }}>Blended finance:</strong> {expansion.blended_finance_angle}</div>
          )}
          {expansion.expanded_impact && (
            <div><strong style={{ color: 'var(--text-muted)' }}>Expanded impact:</strong> {expansion.expanded_impact}</div>
          )}
        </div>
      )}
    </div>
  );
}

function FitBadge({ score, verdict }: { score: number | null; verdict: string | null }) {
  if (typeof score !== 'number') {
    return <span style={{ ...badgeStyle('fit'), background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>unscored</span>;
  }
  const color = score >= 70 ? '#22C55E' : score >= 45 ? '#F59E0B' : '#EF4444';
  return (
    <span style={{ ...badgeStyle('fit'), background: `${color}20`, color }}>
      fit {Math.round(score)}{verdict ? ` · ${verdict}` : ''}
    </span>
  );
}

function SkeletonList({ rows = 4, h = 100 }: { rows?: number; h?: number }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ height: h, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />
      ))}
    </div>
  );
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 48, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 420, margin: '0 auto' }}>{sub}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Style helpers
// ----------------------------------------------------------------------------

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 8, border: 'none',
    background: disabled ? 'var(--bg-elevated)' : 'var(--accent)',
    color: disabled ? 'var(--text-muted)' : '#fff',
    fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-surface)', color: 'var(--text-muted)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

function badgeStyle(kind: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    source: ['#0EA5E9', '#0EA5E920'],
    donor: ['#8B5CF6', '#8B5CF620'],
    country: ['#22C55E', '#22C55E20'],
    sector: ['#EC4899', '#EC489920'],
    sectorSm: ['#EC4899', '#EC489915'],
    size: ['#F59E0B', '#F59E0B20'],
    warm: ['#F59E0B', '#F59E0B25'],
    fit: ['#22C55E', '#22C55E20'],
  };
  const [fg, bg] = colors[kind] || ['#7A90A8', '#7A90A820'];
  return {
    fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: 0.3, background: bg, color: fg,
  };
}

function formatValue(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`);
  if (min === max && min != null) return fmt(min);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}
