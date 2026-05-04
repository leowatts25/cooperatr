'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/app/components/AuthGuard';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

const SECTORS = ['Agri-food', 'Renewable Energy', 'Water Technology', 'Digital & ICT', 'Health Services', 'Infrastructure', 'Other'];
const GEOGRAPHIES = ['West Africa', 'North Africa', 'Latin America', 'Southeast Asia', 'Eastern Europe', 'Middle East & North Africa'];
const ORG_TYPES = ['SME', 'NGO', 'Prime Contractor', 'Consortium Lead'];
const REVENUE_RANGES = ['Under €1M', '€1M – €5M', '€5M – €20M', 'Over €20M'];

// ============================================================================
// Types
// ============================================================================

interface FundingPath {
  name: string;
  type: string;
  amount_range?: string;
  timeline?: string;
  how_to_access?: string;
  fit_rationale?: string;
}
interface PartnerEntry { name: string; type?: string; country?: string; why?: string; verified?: boolean }
interface BuyerEntry { name: string; type?: string; deal_shape?: string; why?: string; verified?: boolean }
interface InvestorEntry { name: string; type?: string; ticket_size?: string; why?: string; verified?: boolean }
interface NextStep { step: string; owner?: string; timeline?: string }
interface Provenance { claim: string; source_type: string }

interface Idea {
  id?: string;
  dbId?: string;
  title: string;
  summary: string;
  tag: 'concrete' | 'creative' | 'hybrid';
  confidence: number;
  confidence_rationale?: string;
  estimated_value_min?: number;
  estimated_value_max?: number;
  currency?: string;
  estimated_timeline_months?: number;
  funding_paths?: FundingPath[];
  partners?: PartnerEntry[];
  buyers?: BuyerEntry[];
  investors?: InvestorEntry[];
  next_steps?: NextStep[];
  regulatory_requirements?: string[];
  risks?: string[];
  data_provenance?: Provenance[];
  missing_data?: string[];
  proposal_ready?: boolean;
  status?: string;
}

type DeepenMessage = { role: 'user' | 'assistant'; content: string };

// ============================================================================
// Helpers
// ============================================================================

function formatValue(min?: number, max?: number, currency = 'EUR') {
  if (!min && !max) return '—';
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency + ' ';
  const fmt = (n: number) => n >= 1000000 ? `${sym}${(n / 1000000).toFixed(1)}M` : `${sym}${(n / 1000).toFixed(0)}K`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max || 0);
}

const TAG_META: Record<string, { labelKey: TranslationKey; color: string; bg: string }> = {
  concrete: { labelKey: 'ideacard.tag.concrete', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
  creative: { labelKey: 'ideacard.tag.creative', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
  hybrid:   { labelKey: 'ideacard.tag.hybrid',   color: '#F0A500', bg: 'rgba(240,165,0,0.12)' },
};

// ============================================================================
// Subcomponents
// ============================================================================

function ConfidenceRing({ score }: { score: number }) {
  const { t } = useTranslation();
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F0A500' : '#94A3B8';
  return (
    <div style={{ textAlign: 'center', minWidth: 54 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'DM Serif Display, serif' }}>{score}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('ideacard.confidence')}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '12px 0', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>
          {title}
          {count != null && count > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({count})</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ paddingBottom: 14 }}>{children}</div>}
    </div>
  );
}

function VerifiedBadge({ verified }: { verified?: boolean }) {
  const { t } = useTranslation();
  if (verified === undefined) return null;
  return (
    <span style={{
      fontSize: 9, padding: '1px 6px', borderRadius: 10, marginLeft: 6,
      backgroundColor: verified ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
      color: verified ? '#22C55E' : '#94A3B8',
      border: `1px solid ${verified ? 'rgba(34,197,94,0.3)' : 'rgba(148,163,184,0.3)'}`,
      textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600,
    }}>
      {verified ? t('ideacard.verified') : t('ideacard.heuristic')}
    </span>
  );
}

function EntryRow({ title, meta, body }: { title: string; meta?: string; body?: string }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>{title}</div>
      {meta && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{meta}</div>}
      {body && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{body}</div>}
    </div>
  );
}

function IdeaCard({ idea, rank, onSave, onDismiss, saving }: {
  idea: Idea;
  rank: number;
  onSave?: (id: string) => void;
  onDismiss?: (id: string) => void;
  saving?: string | null;
}) {
  const { t } = useTranslation();
  const tagMeta = TAG_META[idea.tag] || TAG_META.concrete;
  const id = idea.dbId || idea.id || '';
  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: 24,
      marginBottom: 14,
      opacity: saving === id ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>#{rank}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
              backgroundColor: tagMeta.bg, color: tagMeta.color, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {t(tagMeta.labelKey)}
            </span>
            {idea.proposal_ready && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                backgroundColor: 'rgba(240,165,0,0.12)', color: '#F0A500',
                textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                {t('ideacard.proposalReady')}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 18, color: 'var(--text-primary)', lineHeight: 1.35, fontFamily: 'DM Serif Display, serif', marginBottom: 8 }}>
            {idea.title}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>
            {idea.summary}
          </p>
        </div>
        <ConfidenceRing score={idea.confidence} />
      </div>

      {/* Inline stats */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          💰 {formatValue(idea.estimated_value_min, idea.estimated_value_max, idea.currency)}
        </span>
        {idea.estimated_timeline_months && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            ⏱ ~{idea.estimated_timeline_months} {t('ideacard.months')}
          </span>
        )}
        {idea.confidence_rationale && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {idea.confidence_rationale}
          </span>
        )}
      </div>

      {/* Expandable sections */}
      {idea.funding_paths && idea.funding_paths.length > 0 && (
        <Section title={t('ideacard.section.fundingPaths')} count={idea.funding_paths.length}>
          {idea.funding_paths.map((p, i) => (
            <EntryRow
              key={i}
              title={`${p.name}${p.type ? ` · ${p.type}` : ''}`}
              meta={[p.amount_range, p.timeline].filter(Boolean).join(' · ')}
              body={[p.how_to_access, p.fit_rationale].filter(Boolean).join(' — ')}
            />
          ))}
        </Section>
      )}

      {idea.partners && idea.partners.length > 0 && (
        <Section title={t('ideacard.section.partners')} count={idea.partners.length}>
          {idea.partners.map((p, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                {p.name}
                <VerifiedBadge verified={p.verified} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {[p.type, p.country].filter(Boolean).join(' · ')}
              </div>
              {p.why && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{p.why}</div>}
            </div>
          ))}
        </Section>
      )}

      {idea.buyers && idea.buyers.length > 0 && (
        <Section title={t('ideacard.section.buyers')} count={idea.buyers.length}>
          {idea.buyers.map((b, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                {b.name}
                <VerifiedBadge verified={b.verified} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {[b.type, b.deal_shape].filter(Boolean).join(' · ')}
              </div>
              {b.why && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{b.why}</div>}
            </div>
          ))}
        </Section>
      )}

      {idea.investors && idea.investors.length > 0 && (
        <Section title={t('ideacard.section.investors')} count={idea.investors.length}>
          {idea.investors.map((inv, i) => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                {inv.name}
                <VerifiedBadge verified={inv.verified} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {[inv.type, inv.ticket_size].filter(Boolean).join(' · ')}
              </div>
              {inv.why && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{inv.why}</div>}
            </div>
          ))}
        </Section>
      )}

      {idea.next_steps && idea.next_steps.length > 0 && (
        <Section title={t('ideacard.section.nextSteps')} count={idea.next_steps.length}>
          {idea.next_steps.map((s, i) => (
            <EntryRow
              key={i}
              title={s.step}
              meta={[s.owner, s.timeline].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      )}

      {((idea.regulatory_requirements && idea.regulatory_requirements.length > 0) ||
        (idea.risks && idea.risks.length > 0)) && (
        <Section
          title={t('ideacard.section.complianceRisk')}
          count={(idea.regulatory_requirements?.length || 0) + (idea.risks?.length || 0)}
        >
          {idea.regulatory_requirements && idea.regulatory_requirements.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('ideacard.section.regulatory')}</div>
              {idea.regulatory_requirements.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>• {r}</div>
              ))}
            </div>
          )}
          {idea.risks && idea.risks.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('ideacard.section.risks')}</div>
              {idea.risks.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>• {r}</div>
              ))}
            </div>
          )}
        </Section>
      )}

      {idea.missing_data && idea.missing_data.length > 0 && (
        <Section title={t('ideacard.section.sharpen')} count={idea.missing_data.length}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {t('ideacard.section.sharpenDesc')}
          </div>
          {idea.missing_data.map((m, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '3px 0' }}>• {m}</div>
          ))}
        </Section>
      )}

      {idea.data_provenance && idea.data_provenance.length > 0 && (
        <Section title={t('ideacard.section.provenance')} count={idea.data_provenance.length}>
          {idea.data_provenance.map((p, i) => (
            <EntryRow key={i} title={p.claim} meta={p.source_type} />
          ))}
        </Section>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        {onSave && idea.status !== 'saved' && (
          <button onClick={() => id && onSave(id)} style={{
            padding: '9px 18px', borderRadius: 8, border: '1px solid #22C55E44',
            backgroundColor: '#22C55E15', color: '#22C55E', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}>
            {t('ideacard.action.save')}
          </button>
        )}
        {onDismiss && (
          <button onClick={() => id && onDismiss(id)} style={{
            padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)',
            backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
          }}>
            {t('ideacard.action.dismiss')}
          </button>
        )}
        <Link href={`/proposals/new?ideaId=${id}`} style={{ flex: 1, textDecoration: 'none' }}>
          <button style={{
            width: '100%', padding: '9px', borderRadius: 8, border: 'none',
            backgroundColor: 'var(--accent)', color: '#0F1623', fontSize: 13, cursor: 'pointer', fontWeight: 700,
          }}>
            {t('ideacard.action.startProposal')}
          </button>
        </Link>
      </div>
    </div>
  );
}

function IdeaSkeleton() {
  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="skeleton" style={{ height: 22, width: 80 }} />
        <div className="skeleton" style={{ height: 44, width: 54 }} />
      </div>
      <div className="skeleton" style={{ height: 22, width: '85%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 14, width: '70%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 36, width: '100%' }} />
    </div>
  );
}

// ============================================================================
// Deepen (Stage 2) Drawer
// ============================================================================

interface DeepenResponse {
  mode: 'ask' | 'done';
  message: string;
  topic?: string;
  patch?: Record<string, unknown>;
}

function DeepenDrawer({ profile, onClose, onComplete }: {
  profile: Record<string, unknown>;
  onClose: () => void;
  onComplete: (patch: Record<string, unknown>) => void;
}) {
  const { t, locale } = useTranslation();
  const [messages, setMessages] = useState<DeepenMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const send = useCallback(async (newMessages: DeepenMessage[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile/deepen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, messages: newMessages, locale }),
      });
      const data: DeepenResponse = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.message }]);
      if (data.mode === 'done' && data.patch) {
        setDone(true);
        onComplete(data.patch);
      }
    } catch (err) {
      console.error(err);
      setMessages([...newMessages, { role: 'assistant', content: t('deepen.error') }]);
    } finally {
      setLoading(false);
    }
  }, [profile, onComplete, t, locale]);

  // Kick off the first question on mount
  useEffect(() => {
    if (messages.length === 0) send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = () => {
    if (!input.trim() || loading) return;
    const newMessages: DeepenMessage[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    send(newMessages);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16,
        padding: 28, maxWidth: 600, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            {t('deepen.kicker')}
          </div>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: 22, color: 'var(--text-primary)' }}>
            {t('deepen.title')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            {t('deepen.subtitle')}
          </p>
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', marginBottom: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              padding: '10px 14px', marginBottom: 8, borderRadius: 10,
              backgroundColor: m.role === 'assistant' ? 'var(--bg-elevated)' : 'rgba(240,165,0,0.08)',
              border: m.role === 'assistant' ? '1px solid var(--border)' : '1px solid rgba(240,165,0,0.2)',
              alignSelf: m.role === 'assistant' ? 'flex-start' : 'flex-end',
              fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55,
            }}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 14px' }}>
              {t('deepen.thinking')}
            </div>
          )}
        </div>

        {/* Input */}
        {!done && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={t('deepen.placeholder')}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
            />
            <button onClick={handleSubmit} disabled={loading || !input.trim()} style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              backgroundColor: 'var(--accent)', color: '#0F1623', fontSize: 13, fontWeight: 600,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer', opacity: loading || !input.trim() ? 0.5 : 1,
            }}>
              {t('deepen.send')}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <button onClick={onClose} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)',
            backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
          }}>
            {done ? t('deepen.close') : t('deepen.skip')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main page
// ============================================================================

function OpportunitiesContent() {
  const { t, locale } = useTranslation();
  const [form, setForm] = useState({
    companyName: '',
    sector: '',
    geographies: [] as string[],
    organizationType: '',
    revenueRange: '',
    priorEUExperience: null as boolean | null,
    description: '',
    website: '',
    linkedinUrl: '',
  });
  const [extendedProfile, setExtendedProfile] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [insight, setInsight] = useState<string>('');
  const [savedIdeas, setSavedIdeas] = useState<Idea[]>([]);
  const [allIdeas, setAllIdeas] = useState<Idea[]>([]);
  const [error, setError] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'search' | 'saved' | 'history'>('search');
  const [saving, setSaving] = useState<string | null>(null);
  const [deepenOpen, setDeepenOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('cooperatr_companyId');
    if (stored) setCompanyId(stored);
  }, []);

  const fetchSaved = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/opportunities?companyId=${companyId}&status=saved`);
      const data = await res.json();
      setSavedIdeas(data.ideas || []);
    } catch (err) { console.error(err); }
  }, [companyId]);

  const fetchHistory = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/opportunities?companyId=${companyId}`);
      const data = await res.json();
      setAllIdeas(data.ideas || []);
    } catch (err) { console.error(err); }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === 'saved') fetchSaved();
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchSaved, fetchHistory]);

  const toggleGeo = (geo: string) => {
    setForm(f => ({
      ...f,
      geographies: f.geographies.includes(geo) ? f.geographies.filter(g => g !== geo) : [...f.geographies, geo],
    }));
  };

  const submitForIdeas = async (overrideProfile?: Record<string, unknown>) => {
    setError('');
    setLoading(true);
    setIdeas(null);
    setInsight('');
    try {
      const payload = { ...form, ...extendedProfile, ...(overrideProfile || {}), companyId, locale };
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setIdeas(data.ideas || []);
      setInsight(data.insight || '');
      if (data.companyId) {
        setCompanyId(data.companyId);
        localStorage.setItem('cooperatr_companyId', data.companyId);
      }
    } catch (err) {
      setError(t('disc.errorGenerate'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStage1 = () => {
    if (!form.companyName || !form.sector || !form.organizationType) {
      setError(t('disc.form.errorRequired'));
      return;
    }
    setError('');
    setDeepenOpen(true);
  };

  const handleDeepenComplete = (patch: Record<string, unknown>) => {
    setExtendedProfile(prev => ({ ...prev, ...patch }));
  };

  const handleDeepenClose = () => {
    setDeepenOpen(false);
    submitForIdeas();
  };

  // Re-open the deepen drawer to strengthen the profile further, then regenerate
  const handleStrengthen = () => {
    setDeepenOpen(true);
  };

  const handleSave = async (id: string) => {
    if (!id) {
      setError('Could not save: this idea has no database id (try regenerating).');
      return;
    }
    setSaving(id);
    setError('');
    try {
      const res = await fetch('/api/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'saved' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data?.error || `Save failed (HTTP ${res.status})`;
        console.error('[opportunities:save]', msg, data);
        setError(msg);
        return;
      }
      setIdeas(prev => prev ? prev.map(i => (i.dbId === id || i.id === id) ? { ...i, status: 'saved' } : i) : prev);
      setSavedIdeas(prev => prev.map(i => (i.dbId === id || i.id === id) ? { ...i, status: 'saved' } : i));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save request failed';
      console.error(err);
      setError(msg);
    } finally {
      setSaving(null);
    }
  };

  const handleDismiss = async (id: string) => {
    if (!id) {
      setError('Could not dismiss: this idea has no database id.');
      return;
    }
    setSaving(id);
    setError('');
    try {
      const res = await fetch('/api/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'dismissed' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data?.error || `Dismiss failed (HTTP ${res.status})`;
        console.error('[opportunities:dismiss]', msg, data);
        setError(msg);
        return;
      }
      setIdeas(prev => prev ? prev.filter(i => i.dbId !== id && i.id !== id) : prev);
      setSavedIdeas(prev => prev.filter(i => i.dbId !== id && i.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Dismiss request failed';
      console.error(err);
      setError(msg);
    } finally {
      setSaving(null);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };
  const labelStyle = { fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6, display: 'block', fontWeight: 600 };

  const tabs: { key: 'search' | 'saved' | 'history'; labelKey: TranslationKey; count: number | null }[] = [
    { key: 'search', labelKey: 'disc.tab.search', count: null },
    { key: 'saved', labelKey: 'disc.tab.saved', count: savedIdeas.length || null },
    { key: 'history', labelKey: 'disc.tab.history', count: allIdeas.length || null },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>
      {deepenOpen && (
        <DeepenDrawer
          profile={{ ...form, ...extendedProfile }}
          onClose={handleDeepenClose}
          onComplete={handleDeepenComplete}
        />
      )}

      {/* Top-level error banner — surfaces save/dismiss/network failures
          that previously only logged to the console. */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#EF4444', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        <Link href="/dashboard" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>{t('common.backDashboard')}</Link>
        <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: 16, marginTop: 16 }}>
          <h1 className="font-serif" style={{ fontSize: 32, color: 'var(--text-primary)' }}>{t('disc.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {t('disc.subtitle')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px', background: 'none', border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer', fontSize: 14, fontWeight: 600, transition: 'all 0.15s',
            }}
          >
            {t(tab.labelKey)} {tab.count !== null && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24, alignItems: 'start' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>{t('disc.form.profile')}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>{t('disc.form.companyName')}</label>
                <input style={inputStyle} placeholder={t('disc.form.companyNamePlaceholder')} value={form.companyName}
                  onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.sector')}</label>
                <select style={inputStyle} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}>
                  <option value="">{t('disc.form.selectSector')}</option>
                  {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.geography')}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {GEOGRAPHIES.map(g => (
                    <button key={g} onClick={() => toggleGeo(g)} style={{
                      padding: '5px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${form.geographies.includes(g) ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: form.geographies.includes(g) ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      color: form.geographies.includes(g) ? 'var(--accent)' : 'var(--text-muted)',
                    }}>{g}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.orgType')}</label>
                <select style={inputStyle} value={form.organizationType} onChange={e => setForm(f => ({ ...f, organizationType: e.target.value }))}>
                  <option value="">{t('disc.form.selectType')}</option>
                  {ORG_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.revenue')}</label>
                <select style={inputStyle} value={form.revenueRange} onChange={e => setForm(f => ({ ...f, revenueRange: e.target.value }))}>
                  <option value="">{t('disc.form.selectRevenue')}</option>
                  {REVENUE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.website')}</label>
                <input type="url" style={inputStyle} placeholder="https://yourcompany.com"
                  value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.linkedin')}</label>
                <input type="url" style={inputStyle} placeholder="https://linkedin.com/company/..."
                  value={form.linkedinUrl} onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.priorEU')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { v: true, label: t('disc.form.yes') },
                    { v: false, label: t('disc.form.no') },
                  ].map(opt => (
                    <button key={String(opt.v)} onClick={() => setForm(f => ({ ...f, priorEUExperience: f.priorEUExperience === opt.v ? null : opt.v }))} style={{
                      flex: 1, padding: 8, borderRadius: 8, fontSize: 13, cursor: 'pointer',
                      border: `1px solid ${form.priorEUExperience === opt.v ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: form.priorEUExperience === opt.v ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                      color: form.priorEUExperience === opt.v ? 'var(--accent)' : 'var(--text-muted)',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t('disc.form.description')}</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 110, fontFamily: 'DM Sans, sans-serif' }}
                  placeholder={t('disc.form.descriptionPlaceholder')} maxLength={1000}
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>{form.description.length}/1000</div>
              </div>
              {error && <p style={{ fontSize: 13, color: 'var(--error)', padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>}
              <button onClick={handleStage1} disabled={loading} style={{
                width: '100%', padding: 12, borderRadius: 8, border: 'none',
                backgroundColor: loading ? 'var(--bg-elevated)' : 'var(--accent)',
                color: loading ? 'var(--text-muted)' : '#0F1623',
                fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              }}>
                {loading ? t('disc.form.generating') : t('disc.form.discover')}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center' }}>
                {t('disc.form.deepenHint')}
              </p>
            </div>
          </div>

          {/* Results */}
          <div>
            {!loading && !ideas && (
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: '60px 32px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>💡</div>
                <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>
                  {t('disc.empty.title')}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6, marginTop: 10, maxWidth: 400, margin: '10px auto 0' }}>
                  {t('disc.empty.legendPrefix')}{' '}
                  <strong style={{ color: '#22C55E' }}>{t('ideacard.tag.concrete').toLowerCase()}</strong>,{' '}
                  <strong style={{ color: '#A855F7' }}>{t('ideacard.tag.creative').toLowerCase()}</strong>
                  {t('disc.empty.legendMid')}{' '}
                  <strong style={{ color: '#F0A500' }}>{t('ideacard.tag.hybrid').toLowerCase()}</strong>
                  {t('disc.empty.legendSuffix')}
                </p>
              </div>
            )}
            {loading && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
                  {t('disc.loading.scanning')}
                </p>
                {[1, 2, 3, 4, 5, 6].map(i => <IdeaSkeleton key={i} />)}
              </div>
            )}
            {ideas && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ideas.length} {t('disc.results.ranked')}
                    </h2>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {t('disc.results.tailoredFor')} {form.companyName}. {t('disc.results.expand')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={handleStrengthen}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        border: '1px solid var(--accent)',
                        backgroundColor: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('disc.results.strengthen')}
                    </button>
                    <button
                      onClick={() => submitForIdeas()}
                      style={{
                        padding: '8px 14px', borderRadius: 8,
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {t('disc.results.regenerate')}
                    </button>
                    <button
                      onClick={() => setIdeas(null)}
                      style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      {t('disc.results.clear')}
                    </button>
                  </div>
                </div>
                {insight && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: '14px 18px',
                      borderRadius: 12,
                      border: '1px solid var(--accent)',
                      backgroundColor: 'var(--accent-dim)',
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: 'var(--accent)',
                        whiteSpace: 'nowrap',
                        paddingTop: 2,
                      }}
                    >
                      {t('disc.results.advisorNote')}
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        lineHeight: 1.55,
                        color: 'var(--text-primary)',
                        margin: 0,
                      }}
                    >
                      {insight}
                    </p>
                  </div>
                )}
                {ideas.map((idea, i) => (
                  <IdeaCard
                    key={idea.dbId || idea.id || i}
                    idea={idea}
                    rank={i + 1}
                    onSave={handleSave}
                    onDismiss={handleDismiss}
                    saving={saving}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved Tab */}
      {activeTab === 'saved' && (
        <div>
          {savedIdeas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>{t('disc.savedEmpty.title')}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('disc.savedEmpty.desc')}</div>
            </div>
          ) : (
            <div style={{ maxWidth: 800 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{savedIdeas.length} {t('disc.saved.count')}</h2>
              {savedIdeas.map((idea, i) => (
                <IdeaCard key={idea.id || i} idea={idea} rank={i + 1} onDismiss={handleDismiss} saving={saving} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div>
          {allIdeas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📜</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>{t('disc.historyEmpty.title')}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('disc.historyEmpty.desc')}</div>
            </div>
          ) : (
            <div style={{ maxWidth: 800 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{allIdeas.length} {t('disc.history.count')}</h2>
              {allIdeas.map((idea, i) => (
                <IdeaCard key={idea.id || i} idea={idea} rank={i + 1} onSave={handleSave} onDismiss={handleDismiss} saving={saving} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesPage() {
  return <AuthGuard><OpportunitiesContent /></AuthGuard>;
}
