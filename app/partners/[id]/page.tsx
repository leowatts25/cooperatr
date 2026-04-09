'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Partner {
  id: string; name: string; country: string; sector: string; role: string;
  contact_name: string; contact_email: string; website: string;
  sanctions_status: string; csddd_status: string; gdpr_status: string; hrdd_status: string;
  overall_risk: string; risk_summary: string; created_at: string; updated_at: string;
}

const RISK_COLORS: Record<string, string> = { low: '#22C55E', medium: '#F59E0B', high: '#EF4444', pending: '#7A90A8', cleared: '#22C55E', flagged: '#EF4444', needs_review: '#F59E0B' };

const FRAMEWORKS = [
  { key: 'sanctions_status', label: 'Sanctions Screening', description: 'EU, UN, OFAC, UK consolidated sanctions lists', icon: '🔒' },
  { key: 'csddd_status', label: 'CSDDD Compliance', description: 'EU Corporate Sustainability Due Diligence Directive', icon: '📜' },
  { key: 'gdpr_status', label: 'GDPR Readiness', description: 'EU General Data Protection Regulation', icon: '🔐' },
  { key: 'hrdd_status', label: 'HRDD Assessment', description: 'UN Guiding Principles on Business & Human Rights', icon: '⚖️' },
] as const;

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
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
    try {
      await fetch('/api/partners/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partner.id }),
        signal: AbortSignal.timeout(45000),
      });
      const res = await fetch(`/api/partners?id=${partner.id}`);
      const data = await res.json();
      setPartner(data.partner);
    } catch (err) { console.error(err); }
    finally { setScreening(false); }
  }

  if (loading) return (
    <div style={{ padding: '40px 24px', maxWidth: 800, margin: '0 auto' }}>
      {[1, 2, 3].map(i => <div key={i} style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 12, marginBottom: 12, animation: 'skeleton 1.5s infinite' }} />)}
    </div>
  );

  if (!partner) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>Partner not found</p>
      <button onClick={() => router.push('/partners')} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Back to Partners</button>
    </div>
  );

  return (
    <div style={{ padding: '32px 24px', maxWidth: 800, margin: '0 auto' }}>
      <button onClick={() => router.push('/partners')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>← Back to Partners</button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 8 }}>{partner.name}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {partner.country && <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{partner.country}</span>}
            {partner.sector && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{partner.sector}</span>}
            {partner.role && <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{partner.role.replace('_', ' ')}</span>}
            <span style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600, textTransform: 'uppercase',
              background: `${RISK_COLORS[partner.overall_risk]}22`, color: RISK_COLORS[partner.overall_risk],
            }}>
              {partner.overall_risk === 'pending' ? 'Not Screened' : `${partner.overall_risk} Risk`}
            </span>
          </div>
        </div>
        <button onClick={rescreen} disabled={screening} style={{
          padding: '10px 20px', background: screening ? 'var(--bg-elevated)' : '#22C55E22', color: screening ? 'var(--text-muted)' : '#22C55E',
          border: '1px solid #22C55E44', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          {screening ? 'Screening...' : partner.overall_risk === 'pending' ? 'Run Screening' : 'Re-screen'}
        </button>
      </div>

      {/* Contact Info */}
      {(partner.contact_email || partner.website) && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Contact</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {partner.contact_name && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Name: </span><span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{partner.contact_name}</span></div>}
            {partner.contact_email && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email: </span><span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{partner.contact_email}</span></div>}
            {partner.website && <div><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Web: </span><span style={{ fontSize: 14, color: 'var(--accent)' }}>{partner.website}</span></div>}
          </div>
        </div>
      )}

      {/* Compliance Scorecard */}
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 16 }}>Compliance Scorecard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {FRAMEWORKS.map(fw => {
          const status = partner[fw.key as keyof Partner] as string;
          const color = RISK_COLORS[status] || '#7A90A8';
          return (
            <div key={fw.key} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: `1px solid ${color}33` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{fw.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{fw.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fw.description}</div>
                  </div>
                </div>
              </div>
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                background: `${color}22`, color,
              }}>
                {status === 'pending' ? 'Pending' : status === 'cleared' ? 'Cleared' : status === 'flagged' ? 'Flagged' : 'Needs Review'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Risk Summary */}
      {partner.risk_summary && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 12 }}>Risk Assessment Summary</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7 }}>{partner.risk_summary}</p>
        </div>
      )}
    </div>
  );
}
