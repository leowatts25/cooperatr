'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  title: string;
  funder: string;
  status: string;
  indicators: {
    id: string;
    name: string;
    category: string;
    target_value: number;
    current_value: number;
    unit: string;
  }[];
}

export default function ReportsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects((data.projects || []).filter((p: Project) => p.status === 'active' || p.status === 'completed')))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const frameworks = [
    { name: 'GRI Standards', description: 'Global Reporting Initiative sustainability metrics', icon: '🌍', color: '#22C55E' },
    { name: 'EU CSRD/ESRS', description: 'Corporate Sustainability Reporting Directive', icon: '🇪🇺', color: '#60A5FA' },
    { name: 'SDG Indicators', description: 'UN Sustainable Development Goals alignment', icon: '🎯', color: '#F59E0B' },
    { name: 'EFRAG Guidance', description: 'European Financial Reporting Advisory Group', icon: '📐', color: '#8B5CF6' },
  ];

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Reports & Verification</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Donor-compliant impact reports mapped to international frameworks</p>
      </div>

      {/* Frameworks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {frameworks.map(fw => (
          <div key={fw.name} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>{fw.icon}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>{fw.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fw.description}</div>
          </div>
        ))}
      </div>

      {/* Project Reports */}
      <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 16 }}>Project Reports</h2>

      {loading ? (
        <div style={{ height: 200, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>No reports available yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Reports are generated from active projects with tracked indicators.</div>
          <button onClick={() => router.push('/projects')} style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            View Projects →
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {projects.map(project => {
            const indicators = project.indicators || [];
            const onTrack = indicators.filter(i => i.target_value > 0 && (i.current_value / i.target_value) >= 0.75).length;
            const atRisk = indicators.filter(i => i.target_value > 0 && (i.current_value / i.target_value) >= 0.4 && (i.current_value / i.target_value) < 0.75).length;
            const behind = indicators.filter(i => i.target_value > 0 && (i.current_value / i.target_value) < 0.4).length;

            return (
              <div key={project.id} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 24, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-primary)', marginBottom: 4 }}>{project.title}</div>
                    {project.funder && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{project.funder}</div>}
                  </div>
                  <button
                    onClick={() => router.push(`/projects/${project.id}`)}
                    style={{ padding: '8px 16px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    View Project →
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{onTrack} on track</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{atRisk} at risk</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{behind} behind</span>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{indicators.length} total indicators</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
