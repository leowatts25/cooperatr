import Link from 'next/link';

export default function PartnersPage() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' }}>
      <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Dashboard</Link>

      <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: '16px', margin: '16px 0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h1 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-primary)' }}>Partner Vetting</h1>
          <span style={{
            fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px',
            backgroundColor: 'rgba(42,58,82,0.8)', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>SPRINT 2</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Automated CSDDD and sanctions compliance screening for consortium partners.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { label: 'CSDDD', desc: 'EU Corporate Sustainability Due Diligence Directive' },
          { label: 'Sanctions', desc: 'EU, UN, OFAC, and UK consolidated sanctions lists' },
          { label: 'GDPR', desc: 'EU data residency and processing compliance' },
          { label: 'HRDD', desc: 'UN Guiding Principles human rights due diligence' },
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

      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)',
        borderRadius: '12px', padding: '64px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔎</div>
        <h3 className="font-serif" style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          No partners screened yet
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7, maxWidth: '420px', margin: '0 auto 24px' }}>
          Add consortium partners to screen them against CSDDD requirements, sanctions lists,
          and human rights due diligence frameworks. Automated vetting launches in Sprint 2.
        </p>
        <button disabled style={{
          backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)',
          fontSize: '13px', padding: '10px 20px', borderRadius: '8px',
          border: '1px solid var(--border)', cursor: 'not-allowed',
        }}>
          Add Partner — Coming in Sprint 2
        </button>
      </div>
    </div>
  );
}
