import Link from 'next/link';

export default function ReportsPage() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' }}>
      <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Dashboard</Link>

      <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: '16px', margin: '16px 0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h1 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-primary)' }}>Reporting & Verification</h1>
          <span style={{
            fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px',
            backgroundColor: 'rgba(42,58,82,0.8)', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>SPRINT 2</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Donor-compliant impact reports mapped to GRI, CSRD, and SDG frameworks automatically.
        </p>
      </div>

      {/* Frameworks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { label: 'GRI Standards', desc: 'Global Reporting Initiative sustainability disclosure' },
          { label: 'EU CSRD/ESRS', desc: 'Corporate Sustainability Reporting Directive taxonomy' },
          { label: 'SDG Indicators', desc: 'UN Sustainable Development Goals mapping' },
          { label: 'EFRAG Guidance', desc: 'European Financial Reporting Advisory Group standards' },
        ].map((f) => (
          <div key={f.label} style={{
            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '16px',
          }}>
            <div style={{
              fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '4px',
              backgroundColor: 'var(--accent-dim)', color: 'var(--accent)',
              border: '1px solid rgba(240,165,0,0.2)', display: 'inline-block', marginBottom: '8px',
            }}>{f.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)',
        borderRadius: '12px', padding: '64px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 className="font-serif" style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          No reports generated yet
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7, maxWidth: '440px', margin: '0 auto 24px' }}>
          Reports are generated automatically from live project data. Once a project is active
          in the Project Management module, donor-compliant reports will appear here.
          Full reporting functionality launches in Sprint 2.
        </p>
        <Link href="/projects">
          <button style={{
            backgroundColor: 'var(--accent)', color: '#0F1623', fontWeight: '600',
            fontSize: '13px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          }}>
            View Projects →
          </button>
        </Link>
      </div>
    </div>
  );
}
