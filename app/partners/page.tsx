'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/app/components/AuthGuard';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface Partner {
  id: string;
  name: string;
  country: string;
  sector: string;
  role: string;
  overall_risk: string;
  sanctions_status: string;
  csddd_status: string;
  gdpr_status: string;
  hrdd_status: string;
  created_at: string;
}

const RISK_COLORS: Record<string, string> = { low: '#22C55E', medium: '#F59E0B', high: '#EF4444', pending: '#7A90A8' };
const STATUS_ICONS: Record<string, string> = { cleared: '✓', flagged: '⚠', needs_review: '?', pending: '○' };

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  prime: 'partner.role.prime',
  subcontractor: 'partner.role.subcontractor',
  local_partner: 'partner.role.local_partner',
  consortium_member: 'partner.role.consortium_member',
};

function PartnersContent() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [screening, setScreening] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string>('');
  const [form, setForm] = useState({ name: '', country: '', sector: '', role: 'subcontractor', contact_name: '', contact_email: '', website: '' });

  useEffect(() => {
    fetchPartners();
  }, []);

  async function fetchPartners() {
    try {
      const res = await fetch('/api/partners');
      const data = await res.json();
      setPartners(data.partners || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function addPartner() {
    if (!form.name) return;
    setScreenError('');
    try {
      const companyId = localStorage.getItem('cooperatr_companyId');
      const res = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company_id: companyId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data?.error || `Add partner failed (HTTP ${res.status})`;
        console.error('[partners:add]', msg, data);
        setScreenError(msg);
        return;
      }
      setForm({ name: '', country: '', sector: '', role: 'subcontractor', contact_name: '', contact_email: '', website: '' });
      setShowForm(false);
      await fetchPartners();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Add partner request failed';
      console.error(err);
      setScreenError(msg);
    }
  }

  async function screenPartner(partnerId: string) {
    setScreening(partnerId);
    setScreenError('');
    try {
      const res = await fetch('/api/partners/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId, locale }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || `Screening failed (HTTP ${res.status})`;
        console.error('[partner-screen]', msg, data);
        setScreenError(msg);
        return;
      }
      await fetchPartners();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screening request failed';
      console.error(err);
      setScreenError(msg);
    } finally {
      setScreening(null);
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  };

  const frameworks = ['sanctions', 'csddd', 'gdpr', 'hrdd'] as const;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>{t('partner.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('partner.subtitle')}</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px', background: showForm ? 'var(--bg-elevated)' : 'var(--accent)',
          color: showForm ? 'var(--text-muted)' : '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          {showForm ? t('partner.cancel') : t('partner.addPartner')}
        </button>
      </div>

      {/* Screening error banner */}
      {screenError && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#EF4444', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{screenError}</span>
          <button onClick={() => setScreenError('')} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Add Partner Form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, border: '1px solid var(--accent)33', marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>{t('partner.addForm')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.orgName')}</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. MozParks Mozambique" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.country')}</label>
              <input style={inputStyle} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="e.g. Mozambique" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.sector')}</label>
              <input style={inputStyle} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} placeholder="e.g. Renewable Energy" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.role')}</label>
              <select style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="prime">{t('partner.role.prime')}</option>
                <option value="subcontractor">{t('partner.role.subcontractor')}</option>
                <option value="local_partner">{t('partner.role.local_partner')}</option>
                <option value="consortium_member">{t('partner.role.consortium_member')}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.contactEmail')}</label>
              <input style={inputStyle} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@org.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('partner.website')}</label>
              <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <button onClick={addPartner} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {t('partner.addPartnerSubmit')}
          </button>
        </div>
      )}

      {/* Partners List */}
      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 100, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}
        </div>
      ) : partners.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🛡️</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>{t('partner.noPartners')}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('partner.noPartnersDesc')}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {partners.map(p => (
            <div key={p.id}
              style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onClick={() => router.push(`/partners/${p.id}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#22C55E44')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-primary)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.country && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.country}</span>}
                    {p.role && ROLE_LABEL_KEYS[p.role] && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{t(ROLE_LABEL_KEYS[p.role])}</span>}
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase',
                      background: `${RISK_COLORS[p.overall_risk] || '#7A90A8'}22`,
                      color: RISK_COLORS[p.overall_risk] || '#7A90A8',
                    }}>
                      {p.overall_risk === 'pending' ? t('partner.notScreened') : t(`partner.risk.${p.overall_risk}` as TranslationKey)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {frameworks.map(fw => {
                    const status = p[`${fw}_status`];
                    const color = status === 'cleared' ? '#22C55E' : status === 'flagged' ? '#EF4444' : status === 'needs_review' ? '#F59E0B' : '#7A90A8';
                    return (
                      <div key={fw} title={`${fw.toUpperCase()}: ${status}`} style={{
                        width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${color}22`, color, fontSize: 11, fontWeight: 700,
                      }}>
                        {STATUS_ICONS[status] || '○'}
                      </div>
                    );
                  })}
                  {p.overall_risk === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); screenPartner(p.id); }}
                      disabled={screening === p.id}
                      style={{
                        marginLeft: 8, padding: '6px 14px', borderRadius: 6, border: '1px solid #22C55E44',
                        background: '#22C55E15', color: '#22C55E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {screening === p.id ? t('partner.screening') : t('partner.screen')}
                    </button>
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

export default function PartnersPage() { return <AuthGuard><PartnersContent /></AuthGuard>; }
