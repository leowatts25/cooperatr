'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser, ADMIN_EMAIL } from '@/app/lib/supabase-auth';
import { useTranslation } from '@/app/lib/i18n/context';

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
  translations: Record<string, { title?: string; description?: string }> | null;
  source_language: string | null;
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

type TabKey = 'tenders' | 'contacts';

export default function AdminTendersPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <AdminTendersPageInner />
    </Suspense>
  );
}

function AdminTendersPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: TabKey = searchParams.get('view') === 'contacts' ? 'contacts' : 'tenders';
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<TabKey>(initialTab);

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

  function switchTab(next: TabKey) {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 'contacts') params.set('view', 'contacts');
    else params.delete('view');
    const qs = params.toString();
    router.replace(`/admin/tenders${qs ? '?' + qs : ''}`, { scroll: false });
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
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {(['tenders', 'contacts'] as const).map((key) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === key ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, fontWeight: 600, textTransform: 'capitalize',
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === 'tenders' ? <TendersView /> : <ContactsView />}
    </div>
  );
}

function TendersView() {
  const { locale } = useTranslation();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [totals, setTotals] = useState<{ all: number; passing: number }>({ all: 0, passing: 0 });
  const [loading, setLoading] = useState(true);
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
    fetchTenders('', true);
  }, [fetchTenders]);

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

  return (
    <div>
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
          {tenders.map((t) => <TenderRow key={t.id} tender={t} locale={locale} />)}
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

function TenderRow({ tender, locale }: { tender: Tender; locale: string }) {
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
        {(() => {
          const tr = tender.translations?.[locale] || tender.translations?.en;
          const displayTitle = tr?.title || tender.title || tender.source_ref;
          const isTranslated = !!tr?.title && tr.title !== tender.title;
          return (
            <>
              {tender.url
                ? <a href={tender.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                    {displayTitle} ↗
                  </a>
                : displayTitle}
              {isTranslated && tender.source_language && tender.source_language !== locale && (
                <span style={{ fontSize: 10, marginLeft: 8, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {tender.source_language} → {locale}
                </span>
              )}
            </>
          );
        })()}
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

// ============================================================================
// Contacts tab — imported LinkedIn contacts grouped by company_name
// ============================================================================

interface ContactGroup {
  company_name: string;
  count: number;
  contacts: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    position: string | null;
    linkedin_url: string | null;
    connected_on: string | null;
    company_name: string | null;
  }>;
}

interface ContactsResponse {
  groups: ContactGroup[];
  totals: { contacts: number; companies: number; returned: number };
}

interface ImportResult {
  imported: number;
  skipped_empty: number;
  skipped_dupe: number;
  errors: string[];
  total_rows?: number;
  error?: string;
  detail?: string;
}

function ContactsView() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [totals, setTotals] = useState<ContactsResponse['totals']>({ contacts: 0, companies: 0, returned: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);

  const fetchContacts = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/linkedin/contacts?${params}`);
      const data = (await res.json()) as ContactsResponse;
      setGroups(data.groups || []);
      setTotals(data.totals || { contacts: 0, companies: 0, returned: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(''); }, [fetchContacts]);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => fetchContacts(search), 250);
    return () => clearTimeout(id);
  }, [search, fetchContacts]);

  async function runImport() {
    setImporting(true);
    setLastImport(null);
    try {
      const params = new URLSearchParams({ adminEmail: ADMIN_EMAIL });
      const res = await fetch(`/api/admin/linkedin/import?${params}`, { method: 'POST' });
      const data = (await res.json()) as ImportResult;
      setLastImport(data);
      await fetchContacts(search);
    } catch (err) {
      console.error(err);
      setLastImport({ imported: 0, skipped_empty: 0, skipped_dupe: 0, errors: [String(err)] });
    } finally {
      setImporting(false);
    }
  }

  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setExpanded(next);
  }

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>
          LinkedIn contacts
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Imported from <code>.local/Connections.csv</code>. Grouped by company to surface network density before the matcher uses it for warm-intro routing.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <Stat label="Total contacts" value={totals.contacts} />
        <Stat label="Companies" value={totals.companies} accent />

        <div style={{ flex: 1 }} />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by company…"
          style={{
            padding: '7px 12px',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 13,
            minWidth: 200,
          }}
        />

        <button
          onClick={runImport}
          disabled={importing}
          style={{
            padding: '8px 14px',
            background: importing ? 'var(--bg-surface)' : 'var(--accent)',
            color: importing ? 'var(--text-muted)' : '#fff',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            cursor: importing ? 'wait' : 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          {importing ? 'Importing…' : 'Import from .local/Connections.csv'}
        </button>
      </div>

      {lastImport && (
        <div style={{
          marginBottom: 20,
          padding: 12,
          background: lastImport.error ? '#EF444415' : '#22C55E15',
          border: `1px solid ${lastImport.error ? '#EF444444' : '#22C55E44'}`,
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--text-primary)',
        }}>
          {lastImport.error ? (
            <>
              <strong>⚠ Import failed</strong>: {lastImport.error}
              {lastImport.detail && <div style={{ marginTop: 4, color: 'var(--text-muted)' }}>{lastImport.detail}</div>}
            </>
          ) : (
            <>
              <strong>✓ Import complete</strong>
              {' · '}
              imported {lastImport.imported} ·
              skipped (empty) {lastImport.skipped_empty} ·
              skipped (dupe) {lastImport.skipped_dupe}
              {lastImport.errors && lastImport.errors.length > 0 && (
                <div style={{ marginTop: 6, color: '#F59E0B' }}>
                  warnings: {lastImport.errors.slice(0, 3).join(' · ')}{lastImport.errors.length > 3 ? '…' : ''}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[1, 2, 3, 4].map((i) => <div key={i} style={{ height: 60, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}
        </div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>
            No contacts imported yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Drop your LinkedIn Connections.csv at <code>.local/Connections.csv</code> and click <strong>Import</strong>.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {groups.map((g) => {
            const key = g.company_name;
            const isOpen = expanded.has(key);
            return (
              <div key={key} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <button
                  onClick={() => toggle(key)}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    color: 'var(--text-primary)', fontSize: 14,
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 14 }}>{isOpen ? '▾' : '▸'}</span>
                  <strong style={{ flex: 1 }}>{g.company_name}</strong>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
                    background: g.count >= 5 ? 'var(--accent)' : 'var(--bg-elevated, #1a2333)',
                    color: g.count >= 5 ? '#fff' : 'var(--text-primary)',
                  }}>{g.count}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '0 16px 12px 42px', display: 'grid', gap: 6 }}>
                    {g.contacts.map((c) => (
                      <div key={c.id} style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '(no name)'}</strong>
                        {c.position && <span style={{ color: 'var(--text-muted)' }}>{c.position}</span>}
                        {c.connected_on && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>connected {new Date(c.connected_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 11 }}>↗</a>}
                      </div>
                    ))}
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
