import Link from 'next/link';

export default function ProjectsPage() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' }}>
      <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Dashboard</Link>

      <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: '16px', margin: '16px 0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h1 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-primary)' }}>Project Management</h1>
          <span style={{
            fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px',
            backgroundColor: 'rgba(42,58,82,0.8)', color: 'var(--text-muted)', border: '1px solid var(--border)',
          }}>SPRINT 2</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Milestone tracking, financial reporting, and M&E from award to closeout.
        </p>
      </div>

      {/* What this module will do */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
        {[
          { icon: '📋', title: 'Work Planning', desc: 'Digital onboarding and structured work plans generated from awarded proposals.' },
          { icon: '📈', title: 'Milestone Tracking', desc: 'Real-time progress against deliverables, with automated funder reporting triggers.' },
          { icon: '📊', title: 'M&E Integration', desc: 'Indicators from Module 2 proposals carry forward as the operational monitoring spine.' },
        ].map((f) => (
          <div key={f.title} style={{
            backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: '12px', padding: '20px',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '10px' }}>{f.icon}</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>{f.title}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)',
        borderRadius: '12px', padding: '64px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📂</div>
        <h3 className="font-serif" style={{ fontSize: '20px', color: 'var(--text-primary)', marginBottom: '8px' }}>
          No active projects yet
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.7, maxWidth: '420px', margin: '0 auto 24px' }}>
          Projects will appear here once an opportunity from the Opportunity Engine converts
          to an awarded contract. Full project management functionality launches in Sprint 2.
        </p>
        <Link href="/opportunities">
          <button style={{
            backgroundColor: 'var(--accent)', color: '#0F1623', fontWeight: '600',
            fontSize: '13px', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          }}>
            Find an Opportunity →
          </button>
        </Link>
      </div>
    </div>
  );
}
