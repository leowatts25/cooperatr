'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  title: string;
  funder: string;
  status: string;
  budget_total: number;
  budget_spent: number;
  start_date: string;
  end_date: string;
  geographies: string[];
  milestones: { id: string; status: string }[];
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  setup: '#60A5FA',
  active: '#22C55E',
  completed: '#8B5CF6',
  suspended: '#F59E0B',
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 24 }}>Projects</h1>
        <div style={{ display: 'grid', gap: 16 }}>
          {[1, 2].map(i => (
            <div key={i} style={{ height: 140, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Projects</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Active and completed project implementations</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>No active projects yet</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Projects are created when proposals are awarded. Start by finding opportunities.</div>
          <button onClick={() => router.push('/opportunities')} style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            Find Opportunities →
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {projects.map(project => {
            const totalMilestones = project.milestones?.length || 1;
            const completedMilestones = project.milestones?.filter(m => m.status === 'completed').length || 0;
            const progressPct = Math.round((completedMilestones / totalMilestones) * 100);

            return (
              <div
                key={project.id}
                onClick={() => router.push(`/projects/${project.id}`)}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 12,
                  padding: 24,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#8B5CF644')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>{project.title}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase',
                        background: `${STATUS_COLORS[project.status] || '#7A90A8'}22`,
                        color: STATUS_COLORS[project.status] || '#7A90A8',
                      }}>
                        {project.status}
                      </span>
                      {project.funder && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{project.funder}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: '#8B5CF6' }}>{progressPct}%</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{completedMilestones}/{totalMilestones} milestones</div>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                  <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 3, background: '#8B5CF6', transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  {project.budget_total > 0 && <span>€{project.budget_total.toLocaleString()}</span>}
                  {project.geographies?.length > 0 && <span>{project.geographies.join(', ')}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
