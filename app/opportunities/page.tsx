'use client';
import { useState } from 'react';
import Link from 'next/link';

const SECTORS = ['Agri-food', 'Renewable Energy', 'Water Technology', 'Digital & ICT', 'Health Services', 'Infrastructure', 'Other'];
const GEOGRAPHIES = ['West Africa', 'North Africa', 'Latin America', 'Southeast Asia', 'Eastern Europe', 'Middle East & North Africa'];
const ORG_TYPES = ['SME', 'NGO', 'Prime Contractor', 'Consortium Lead'];
const REVENUE_RANGES = ['Under €1M', '€1M – €5M', '€5M – €20M', 'Over €20M'];

interface Opportunity {
  id: string;
  funder: string;
  funderAbbrev: string;
  title: string;
  description: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  deadline: string;
  geographies: string[];
  sectors: string[];
  matchScore: number;
  matchRationale: string;
  recommendedApproach: string;
  instrumentType: string;
  priorEUExperienceRequired: boolean;
}

function formatBudget(min: number, max: number) {
  const fmt = (n: number) => n >= 1000000 ? `€${(n/1000000).toFixed(1)}M` : `€${(n/1000).toFixed(0)}K`;
  return `${fmt(min)} – ${fmt(max)}`;
}

function MatchScore({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--accent)' : score >= 60 ? '#60A5FA' : 'var(--text-muted)';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '26px', fontWeight: '700', color, fontFamily: 'DM Serif Display, serif' }}>{score}%</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Match</div>
    </div>
  );
}

function OpportunityCard({ opp, onViewDetails }: { opp: Opportunity; onViewDetails: (o: Opportunity) => void }) {
  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '20px',
      marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', color: 'var(--accent)', border: '1px solid rgba(240,165,0,0.2)' }}>
            {opp.funderAbbrev}
          </span>
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {opp.instrumentType}
          </span>
        </div>
        <MatchScore score={opp.matchScore} />
      </div>

      <h3 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px', lineHeight: 1.4, fontFamily: 'DM Serif Display, serif' }}>
        {opp.title}
      </h3>

      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '12px' }}>
        {opp.description}
      </p>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>💰 {formatBudget(opp.budgetMin, opp.budgetMax)}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📅 {opp.deadline}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📍 {opp.geographies.join(', ')}</span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '16px', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent)' }}>Why this fits: </span>{opp.matchRationale}
      </p>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onViewDetails(opp)}
          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}
        >
          View Full Details
        </button>
        <button
          disabled
          title="Coming in Sprint 2"
          style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', fontSize: '13px', cursor: 'not-allowed', fontWeight: '500' }}
        >
          Start Proposal →
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div className="skeleton" style={{ height: '24px', width: '80px' }} />
        <div className="skeleton" style={{ height: '40px', width: '50px', borderRadius: '8px' }} />
      </div>
      <div className="skeleton" style={{ height: '20px', width: '85%', marginBottom: '8px' }} />
      <div className="skeleton" style={{ height: '14px', width: '100%', marginBottom: '6px' }} />
      <div className="skeleton" style={{ height: '14px', width: '70%', marginBottom: '16px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <div className="skeleton" style={{ flex: 1, height: '36px', borderRadius: '8px' }} />
        <div className="skeleton" style={{ flex: 1, height: '36px', borderRadius: '8px' }} />
      </div>
    </div>
  );
}

function Modal({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}>
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--accent-dim)', color: 'var(--accent)', marginBottom: '8px', display: 'inline-block' }}>
              {opp.funderAbbrev} — {opp.instrumentType}
            </span>
            <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '22px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{opp.title}</h2>
          </div>
          <MatchScore score={opp.matchScore} />
        </div>

        <p style={{ color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '20px', fontSize: '14px' }}>{opp.description}</p>

        <div style={{ backgroundColor: 'var(--accent-dim)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Recommended Approach</div>
          <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: 1.6 }}>{opp.recommendedApproach}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          {[
            { label: 'Funder', value: opp.funder },
            { label: 'Budget', value: formatBudget(opp.budgetMin, opp.budgetMax) },
            { label: 'Deadline', value: opp.deadline },
            { label: 'Geographies', value: opp.geographies.join(', ') },
            { label: 'EU Experience Required', value: opp.priorEUExperienceRequired ? 'Yes' : 'No' },
            { label: 'Sectors', value: opp.sectors.join(', ') },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '14px', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  );
}

export default function OpportunitiesPage() {
  const [form, setForm] = useState({
    companyName: '',
    sector: '',
    geographies: [] as string[],
    organizationType: '',
    revenueRange: '',
    priorEUExperience: false,
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);
  const [error, setError] = useState('');

  const toggleGeo = (geo: string) => {
    setForm(f => ({
      ...f,
      geographies: f.geographies.includes(geo)
        ? f.geographies.filter(g => g !== geo)
        : [...f.geographies, geo],
    }));
  };

  const handleSubmit = async () => {
    if (!form.companyName || !form.sector || !form.organizationType) {
      setError('Please fill in Company Name, Sector, and Organization Type.');
      return;
    }
    setError('');
    setLoading(true);
    setOpportunities(null);
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: AbortSignal.timeout(45000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOpportunities(data.opportunities);
    } catch (err) {
      setError('Failed to fetch opportunities. Check your API key and try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
  };

  const labelStyle = { fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '6px', display: 'block', fontWeight: '600' };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' }}>
      {selectedOpp && <Modal opp={selectedOpp} onClose={() => setSelectedOpp(null)} />}

      <div style={{ marginBottom: '32px' }}>
        <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Dashboard</Link>
        <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: '16px', marginTop: '16px' }}>
          <h1 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-primary)' }}>Opportunity Engine</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>Enter your company profile to discover matched EU and multilateral funding opportunities.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Form */}
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '20px' }}>Company Profile</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input style={inputStyle} placeholder="e.g. Andalucía Solar S.L." value={form.companyName}
                onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
            </div>

            <div>
              <label style={labelStyle}>Sector *</label>
              <select style={inputStyle} value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}>
                <option value="">Select sector...</option>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Geography Focus</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {GEOGRAPHIES.map(g => (
                  <button key={g} onClick={() => toggleGeo(g)} style={{
                    padding: '5px 10px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                    border: `1px solid ${form.geographies.includes(g) ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: form.geographies.includes(g) ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    color: form.geographies.includes(g) ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Organization Type *</label>
              <select style={inputStyle} value={form.organizationType} onChange={e => setForm(f => ({ ...f, organizationType: e.target.value }))}>
                <option value="">Select type...</option>
                {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Annual Revenue</label>
              <select style={inputStyle} value={form.revenueRange} onChange={e => setForm(f => ({ ...f, revenueRange: e.target.value }))}>
                <option value="">Select range...</option>
                {REVENUE_RANGES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Prior EU Contracting Experience</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Yes', 'No'].map(v => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, priorEUExperience: v === 'Yes' }))} style={{
                    flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                    border: `1px solid ${(form.priorEUExperience && v === 'Yes') || (!form.priorEUExperience && v === 'No') ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: (form.priorEUExperience && v === 'Yes') || (!form.priorEUExperience && v === 'No') ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    color: (form.priorEUExperience && v === 'Yes') || (!form.priorEUExperience && v === 'No') ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Brief Description</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '80px', fontFamily: 'DM Sans, sans-serif' }}
                placeholder="Core competency and international experience (max 300 chars)"
                maxLength={300}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '4px' }}>{form.description.length}/300</div>
            </div>

            {error && <p style={{ fontSize: '13px', color: 'var(--error)', padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</p>}

            <button onClick={handleSubmit} disabled={loading} style={{
              width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
              backgroundColor: loading ? 'var(--bg-elevated)' : 'var(--accent)',
              color: loading ? 'var(--text-muted)' : '#0F1623',
              fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}>
              {loading ? '⏳ Scanning funding pipelines...' : 'Find Opportunities →'}
            </button>
          </div>
        </div>

        {/* Results */}
        <div>
          {!loading && !opportunities && (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '12px', padding: '60px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6 }}>
                Enter your company profile to discover<br />matched funding opportunities.
              </p>
            </div>
          )}

          {loading && (
            <div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', fontStyle: 'italic' }}>
                Scanning EU procurement portals, Global Gateway pipeline, AECID, GIZ, AFD, and World Bank databases...
              </p>
              {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
            </div>
          )}

          {opportunities && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>{opportunities.length} Opportunities Found</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Ranked by match score for {form.companyName}
                  </p>
                </div>
                <button onClick={() => setOpportunities(null)} style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  New Search
                </button>
              </div>
              {opportunities.map(opp => (
                <OpportunityCard key={opp.id} opp={opp} onViewDetails={setSelectedOpp} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
