import Link from 'next/link';

const proposals = [
  { title: 'Solar Electrification Programme — Sahel Region', funder: 'INTPA / Global Gateway', deadline: '2026-09-15', status: 'In Review', statusColor: '#F59E0B', pct: 72, edited: '2 days ago' },
  { title: 'Agri-food Value Chain Development — West Africa', funder: 'AECID Convocatoria Abierta', deadline: '2026-11-30', status: 'Draft', statusColor: '#7A90A8', pct: 31, edited: 'Today' },
];

export default function ProposalsPage() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px' }}>
      <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>← Dashboard</Link>
      <div style={{ borderLeft: '4px solid var(--accent)', paddingLeft: '16px', margin: '16px 0 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h1 className="font-serif" style={{ fontSize: '32px', color: 'var(--text-primary)' }}>Proposal Development</h1>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', backgroundColor: 'rgba(42,58,82,0.8)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>SPRINT 2</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>End-to-end proposal drafting calibrated to funder evaluation criteria.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {proposals.map((p, i) => (
          <div key={i} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 className="font-serif" style={{ fontSize: '17px', color: 'var(--text-primary)', marginBottom: '4px' }}>{p.title}</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.funder} · Deadline: {p.deadline} · Last edited {p.edited}</p>
              </div>
              <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px', backgroundColor: 'rgba(42,58,82,0.8)', color: p.statusColor, border: `1px solid ${p.statusColor}40`, whiteSpace: 'nowrap' as const }}>{p.status}</span>
            </div>
            <div style={{ backgroundColor: 'var(--bg-elevated)', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${p.pct}%`, backgroundColor: 'var(--accent)', borderRadius: '6px' }} />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>{p.pct}% complete</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '24px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: '12px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Full module coming in Sprint 2.{' '}
          <Link href="/opportunities" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Find an opportunity to propose →</Link>
        </p>
      </div>
    </div>
  );
}
