'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/app/components/AuthGuard';

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

function PartnersContent() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [screening, setScreening] = useState<string | null>(null);
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
    try {
      const companyId = localStorage.getItem('cooperatr_companyId');
      await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, company_id: companyId }),
      });
      setForm({ name: '', country: '', sector: '', role: 'subcontractor', contact_name: '', contact_email: '', website: '' });
      setShowForm(false);
      await fetchPartners();
    } catch (err) { console.error(err); }
  }

  async function screenPartner(partnerId: string) {
    setScreening(partnerId);
    try {
      await fetch('/api/partners/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId }),
        signal: AbortSignal.timeout(45000),
      });
      await fetchPartners();
    } catch (err) { console.error(err); }
    finally { setScreening(null); }
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
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Partner Vetting</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>AI-powered compliance screening across CSDDD, sanctions, GDPR, and HRDD</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: '10px 20px', background: showForm ? 'var(--bg-elevated)' : 'var(--accent)',
          color: showForm ? 'var(--text-muted)' : '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        }}>
          {showForm ? 'Cancel' : '+ Add Partner'}
        </button>
      </div>

      {/* Add Partner Form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, border: '1px solid var(--accent)33', marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Add Partner Organization</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Organization Name *</label>
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. MozParks Mozambique" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Country</label>
              <input style={inputStyle} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="e.g. Mozambique" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Sector</label>
              <input style={inputStyle} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} placeholder="e.g. Renewable Energy" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Role</label>
              <select style={inputStyle} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="prime">Prime Contractor</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="local_partner">Local Partner</option>
                <option value="consortium_member">Consortium Member</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contact Email</label>
              <input style={inputStyle} value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@org.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Website</label>
              <input style={inputStyle} value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <button onClick={addPartner} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Add Partner
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
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>No partners added yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Add consortium partners and screen them for EU compliance.</div>
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
                    {p.role && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>{p.role.replace('_', ' ')}</span>}
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase',
                      background: `${RISK_COLORS[p.overall_risk] || '#7A90A8'}22`,
                      color: RISK_COLORS[p.overall_risk] || '#7A90A8',
                    }}>
                      {p.overall_risk === 'pending' ? 'Not screened' : `${p.overall_risk} risk`}
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
                      {screening === p.id ? 'Screening...' : 'Screen'}
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
