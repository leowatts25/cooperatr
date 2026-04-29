'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface Partner {
  id: string; name: string; country: string; sector: string; role: string;
  contact_name: string; contact_email: string; website: string;
  sanctions_status: string; csddd_status: string; gdpr_status: string; hrdd_status: string;
  overall_risk: string; risk_summary: string; created_at: string; updated_at: string;
}

const RISK_COLORS: Record<string, string> = { low: '#22C55E', medium: '#F59E0B', high: '#EF4444', pending: '#7A90A8', cleared: '#22C55E', flagged: '#EF4444', needs_review: '#F59E0B' };

const ROLE_LABEL_KEYS: Record<string, TranslationKey> = {
  prime: 'partner.role.prime',
  subcontractor: 'partner.role.subcontractor',
  local_partner: 'partner.role.local_partner',
  consortium_member: 'partner.role.consortium_member',
};

const FRAMEWORKS: { key: keyof Partner; labelKey: TranslationKey; descKey: TranslationKey; icon: string }[] = [
  { key: 'sanctions_status', labelKey: 'partner.fw.sanctions.label', descKey: 'partner.fw.sanctions.desc', icon: '🔒' },
  { key: 'csddd_status', labelKey: 'partner.fw.csddd.label', descKey: 'partner.fw.csddd.desc', icon: '📜' },
  { key: 'gdpr_status', labelKey: 'partner.fw.gdpr.label', descKey: 'partner.fw.gdpr.desc', icon: '🔐' },
  { key: 'hrdd_status', labelKey: 'partner.fw.hrdd.label', descKey: 'partner.fw.hrdd.desc', icon: '⚖️' },
];

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [error, setError] = useState<string>('');
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [screening, setScreening] = useState(false);

  useEffect(() => {
    fetch(`/api/partners?id=${params.id}`)
      .then(r => r.json())
      .then(data => setPartner(data.partner))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function rescreen() {
    if (!partner) return;
    setScreening(true);
    setError('');
    try {
      const screenRes = await fetch('/api/partners/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partner.id, locale }),
        signal: AbortSignal.timeout(60000),
      });
      const screenData = await screenRes.json();
      if (!screenRes.ok) {
        const msg = screenData?.error || `Screening failed (HTTP ${screenRes.status})`;
        console.error('[partner-screen]', msg, screenData);
        setError(msg);
        return;
      }
      const res = await fetch(`/api/partners?id=${partner.id}`);
      const data = await res.json();
      setPartner(data.partner);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screening request failed';
      console.error(err);
      setError(msg);
    } finally {
      setScreening(false);
    }
  }

  if (loading) return (
    <div style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto' }}>
      {[1, 2, 3].map(i => <div key={i} style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 12, marginBottom: 12, animation: 'skeleton 1.5s infinite' }} />)}
    </div>
  );

  if (!partner) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>{t('partner.notFound')}</p>
      <button onClick={() => router.push('/partners')} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>{t('partner.backToPartners')}</button>
    </div>
  );

  return (
    <div style={{ padding: '32px 24px', maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => router.push('/partners')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>{t('partner.backArrow')}</button>

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 8 }}>{partner.name}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {partner.country && <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{partner.country}</span>}
            {partner.sector && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{partner.sector}</span>}
            {partner.role && ROLE_LABEL_KEYS[partner.role] && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{t(ROLE_LABEL_KEYS[partner.role])}</span>}
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, textTransform: 'uppercase',
              background: `${RISK_COLORS[partner.overall_risk]}22`, color: RISK_COLORS[partner.overall_risk],
            }}>
              {partner.overall_risk === 'pending' ? t('partner.notScreened') : t(`partner.risk.${partner.overall_risk}` as TranslationKey)}
            </span>
          </div>
        </div>
        <button onClick={rescreen} disabled={screening} style={{
          padding: '10px 20px', background: screening ? 'var(--bg-elevated)' : '#22C55E22', color: screening ? 'var(--text-muted)' : '#22C55E',
          border: '1px solid #22C55E44', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          {screening ? t('partner.screening') : partner.overall_risk === 'pending' ? t('partner.runScreening') : t('partner.rescreen')}
        </button>
      </div>

      {/* Contact Info */}
      {(partner.contact_email || partner.website) && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>{t('partner.contact')}</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {partner.contact_name && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('partner.contactName')}: </span><span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{partner.contact_name}</span></div>}
            {partner.contact_email && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('partner.contactEmail')}: </span><span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{partner.contact_email}</span></div>}
            {partner.website && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('partner.web')}: </span><span style={{ fontSize: 14, color: 'var(--accent)' }}>{partner.website}</span></div>}
          </div>
        </div>
      )}

      {/* Compliance Scorecard */}
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 16 }}>{t('partner.scorecard')}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {FRAMEWORKS.map(fw => {
          const status = partner[fw.key] as string;
          const color = RISK_COLORS[status] || '#7A90A8';
          const statusKey: TranslationKey =
            status === 'pending' ? 'partner.fwStatus.pending' :
            status === 'cleared' ? 'partner.fwStatus.cleared' :
            status === 'flagged' ? 'partner.fwStatus.flagged' : 'partner.fwStatus.needs_review';
          return (
            <div key={fw.key} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: `1px solid ${color}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{fw.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t(fw.labelKey)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t(fw.descKey)}</div>
                  </div>
                </div>
              </div>
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                background: `${color}22`, color,
              }}>
                {t(statusKey)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Risk Summary */}
      {partner.risk_summary && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 12 }}>{t('partner.riskSummary')}</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7 }}>{partner.risk_summary}</p>
        </div>
      )}
    </div>
  );
}
