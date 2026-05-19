'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

interface Tender {
  id: string;
  source: string;
  source_ref: string;
  url: string | null;
  title: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  sectors: string[];
  type: string | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
  currency: string | null;
  published_at: string | null;
  deadline_at: string | null;
  passes_filter: boolean;
  filter_reasons: string[];
}

interface IngestResult {
  ok: boolean;
  timestamp: string;
  totals: { fetched: number; normalized: number; upserted: number; passedFilter: number };
  sources: Array<{ source: string; fetched: number; normalized: number; upserted: number; passedFilter: number; errors: string[] }>;
}

const SECTOR_OPTIONS: Array<{ slug: string; label: string }> = [
  { slug: '', label: 'All sectors' },
  { slug: 'agri_food', label: 'Agri-food' },
  { slug: 'renewable_energy', label: 'Renewable energy' },
  { slug: 'water_tech', label: 'Water tech' },
  { slug: 'circular_esg', label: 'Circular / ESG' },
  { slug: 'critical_minerals', label: 'Critical minerals' },
  { slug: 'human_rights', label: 'Human rights' },
];

export default function AdminTendersPage() {
  const router = useRouter();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [totals, setTotals] = useState<{ all: number; passing: number }>({ all: 0, passing: 0 });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sectorFilter, setSectorFilter] = useState('');
  const [passesOnly, setPassesOnly] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [lastIngest, setLastIngest] = useState<IngestResult | null>(null);

  const fetchTenders = useCallback(async (sector: string, passes: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      if (sector) params.set('sector', sector);
      if (passes) params.set('passes_only', 'true');
      const res = await fetch(`/api/admin/tenders?${params}`);
      const data = await res.json();
      setTenders(data.tenders || []);
      setTotals(data.totals || { all: 0, passing: 0 });
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
      await fetchTenders('', true);
    }
    init();
  }, [router, fetchTenders]);

  async function triggerIngest() {
    setTriggering(true);
    setLastIngest(null);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      const res = await fetch(`/api/admin/tenders/trigger?${params}`, { method: 'POST' });
      const data = await res.json();
      setLastIngest(data);
      await fetchTenders(sectorFilter, passesOnly);
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
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
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>
          BD scanner — Tenders
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Raw ingested tenders from donor feeds. Matcher and weekly report come next.
        </p>
      </div>

      {/* Stats + controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Stat label="Total ingested" value={totals.all} />
        <Stat label="Pass filter" value={totals.passing} accent />

        <div style={{ flex: 1 }} />

        <select
          value={sectorFilter}
          onChange={(e) => { setSectorFilter(e.target.value); fetchTenders(e.target.value, passesOnly); }}
          style={selectStyle}
        >
          {SECTOR_OPTIONS.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={passesOnly}
            onChange={(e) => { setPassesOnly(e.target.checked); fetchTenders(sectorFilter, e.target.checked); }}
          />
          Passes filter only
        </label>

        <button
          onClick={triggerIngest}
          disabled={triggering}
          style={{
            padding: '8px 14px',
            background: triggering ? 'var(--bg-surface)' : 'var(--accent)',
            color: triggering ? 'var(--text-muted)' : '#fff',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            cursor: triggering ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {triggering ? 'Ingesting…' : 'Run ingest now'}
        </button>
      </div>

      {/* Last ingest result */}
      {lastIngest && (
        <div style={{
          marginBottom: 20,
          padding: 12,
          background: lastIngest.ok ? '#22C55E15' : '#EF444415',
          border: `1px solid ${lastIngest.ok ? '#22C55E44' : '#EF444444'}`,
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-primary)',
        }}>
          <strong>{lastIngest.ok ? '✓ Ingest complete' : '⚠ Ingest had errors'}</strong>
          {' · '}
          fetched {lastIngest.totals.fetched} ·
          normalized {lastIngest.totals.normalized} ·
          passed filter {lastIngest.totals.passedFilter} ·
          upserted {lastIngest.totals.upserted}
          {lastIngest.sources.map((s) => s.errors.length > 0 && (
            <div key={s.source} style={{ marginTop: 6, color: '#EF4444' }}>
              {s.source}: {s.errors.join(' · ')}
            </div>
          ))}
        </div>
      )}

      {/* Tender list */}
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 84, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}
        </div>
      ) : tenders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
            No tenders ingested yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Click <strong>Run ingest now</strong> to fetch from TED.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {tenders.map((t) => <TenderRow key={t.id} tender={t} />)}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      padding: '8px 14px',
      background: 'var(--bg-surface)',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: accent ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

const selectStyle = {
  padding: '7px 12px',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
};

function TenderRow({ tender }: { tender: Tender }) {
  const valueLabel = formatValue(tender.value_usd_min, tender.value_usd_max);
  const dateLabel = tender.published_at ? new Date(tender.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const deadlineLabel = tender.deadline_at ? new Date(tender.deadline_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: `1px solid ${tender.passes_filter ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 12,
      padding: '14px 18px',
      opacity: tender.passes_filter ? 1 : 0.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={badgeStyle('source')}>{tender.source}</span>
        {tender.donor && <span style={badgeStyle('donor')}>{tender.donor}</span>}
        {tender.country && <span style={badgeStyle('country')}>📍 {tender.country}</span>}
        {tender.type && tender.type !== 'unknown' && <span style={badgeStyle('type')}>{tender.type}</span>}
        {tender.sectors.map((s) => <span key={s} style={badgeStyle('sector')}>{s.replace(/_/g, ' ')}</span>)}
        <div style={{ flex: 1 }} />
        {tender.passes_filter
          ? <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>✓ pass</span>
          : <span style={{ fontSize: 11, color: '#7A90A8' }}>filtered</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {tender.url
          ? <a href={tender.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
              {tender.title || tender.source_ref} ↗
            </a>
          : tender.title || tender.source_ref}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {tender.buyer && <span>{tender.buyer}</span>}
        <span>Published {dateLabel}</span>
        {deadlineLabel && <span style={{ color: '#F59E0B' }}>Deadline {deadlineLabel}</span>}
        {valueLabel && <span>{valueLabel}</span>}
        <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{tender.source_ref}</span>
      </div>
    </div>
  );
}

function badgeStyle(kind: string): React.CSSProperties {
  const colors: Record<string, [string, string]> = {
    source: ['#0EA5E9', '#0EA5E920'],
    donor: ['#8B5CF6', '#8B5CF620'],
    country: ['#22C55E', '#22C55E20'],
    type: ['#F59E0B', '#F59E0B20'],
    sector: ['#EC4899', '#EC489920'],
  };
  const [fg, bg] = colors[kind] || ['#7A90A8', '#7A90A820'];
  return {
    fontSize: 10,
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
  const fmt = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1000).toFixed(0)}k`;
  if (min === max && min != null) return fmt(min);
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}
