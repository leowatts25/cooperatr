'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Milestone {
  id: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  completion_pct: number;
  sort_order: number;
}

interface Indicator {
  id: string;
  name: string;
  category: string;
  target_value: number;
  current_value: number;
  unit: string;
  reporting_period: string;
  last_updated: string;
}

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
  milestones: Milestone[];
  indicators: Indicator[];
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#7A90A8',
  in_progress: '#F0A500',
  completed: '#22C55E',
  overdue: '#EF4444',
  setup: '#60A5FA',
  active: '#22C55E',
  suspended: '#F59E0B',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 12px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      background: `${STATUS_COLORS[status] || '#7A90A8'}22`,
      color: STATUS_COLORS[status] || '#7A90A8',
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

function ProgressBar({ value, max, color = 'var(--accent)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-elevated)' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`,
          height: '100%',
          borderRadius: 4,
          background: color,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', minWidth: 40 }}>{pct}%</span>
    </div>
  );
}

export default function ProjectWorkspace() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'milestones' | 'monitoring' | 'budget'>('milestones');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects?id=${params.id}`);
      const data = await res.json();
      if (data.project) setProject(data.project);
    } catch (err) {
      console.error('Failed to fetch project:', err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  async function updateMilestoneStatus(milestoneId: string, newStatus: string) {
    setUpdatingId(milestoneId);
    try {
      await fetch('/api/projects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project?.id, milestoneId, status: newStatus, completion_pct: newStatus === 'completed' ? 100 : newStatus === 'in_progress' ? 50 : 0 }),
      });
      await fetchProject();
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateIndicatorValue(indicatorId: string, value: number) {
    setUpdatingId(indicatorId);
    try {
      await fetch('/api/projects/indicators', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: indicatorId, current_value: value }),
      });
      await fetchProject();
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateProjectStatus(status: string) {
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: project?.id, status }),
    });
    await fetchProject();
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ height: 32, width: 300, background: 'var(--bg-elevated)', borderRadius: 8, animation: 'skeleton 1.5s infinite' }} />
        <div style={{ height: 200, background: 'var(--bg-elevated)', borderRadius: 12, marginTop: 24, animation: 'skeleton 1.5s infinite' }} />
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 18 }}>Project not found</p>
        <button onClick={() => router.push('/projects')} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          Back to Projects
        </button>
      </div>
    );
  }

  const completedMilestones = project.milestones?.filter(m => m.status === 'completed').length || 0;
  const totalMilestones = project.milestones?.length || 1;
  const budgetPct = project.budget_total > 0 ? Math.round((project.budget_spent / project.budget_total) * 100) : 0;

  const tabs = [
    { key: 'milestones', label: 'Milestones', count: totalMilestones },
    { key: 'monitoring', label: 'Monitoring & Impact', count: project.indicators?.length || 0 },
    { key: 'budget', label: 'Budget', count: null },
  ] as const;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <button onClick={() => router.push('/projects')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>
            ← Back to Projects
          </button>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', margin: 0 }}>{project.title}</h1>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
            <StatusBadge status={project.status} />
            {project.funder && <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{project.funder}</span>}
            {project.geographies?.length > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>{project.geographies.join(', ')}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {project.status === 'setup' && (
            <button onClick={() => updateProjectStatus('active')} style={{ padding: '10px 20px', background: '#22C55E', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Activate Project
            </button>
          )}
        </div>
      </div>

      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Progress</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--accent)' }}>{Math.round((completedMilestones / totalMilestones) * 100)}%</div>
          <ProgressBar value={completedMilestones} max={totalMilestones} />
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Budget</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)' }}>€{(project.budget_spent || 0).toLocaleString()}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>of €{(project.budget_total || 0).toLocaleString()} ({budgetPct}%)</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Timeline</div>
          <div style={{ fontSize: 15, color: 'var(--text-primary)' }}>{project.start_date ? new Date(project.start_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBD'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>to {project.end_date ? new Date(project.end_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBD'}</div>
        </div>
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Indicators</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)' }}>{project.indicators?.length || 0}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>tracked</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {tab.label} {tab.count !== null && <span style={{ opacity: 0.6 }}>({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Milestones Tab */}
      {activeTab === 'milestones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {project.milestones?.sort((a, b) => a.sort_order - b.sort_order).map((milestone) => (
            <div key={milestone.id} style={{
              background: 'var(--bg-surface)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: updatingId === milestone.id ? 0.6 : 1,
              transition: 'opacity 0.15s',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: milestone.status === 'completed' ? '#22C55E' : milestone.status === 'in_progress' ? '#F0A500' : 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: milestone.status === 'pending' ? 'var(--text-muted)' : '#fff', fontWeight: 600, flexShrink: 0,
              }}>
                {milestone.status === 'completed' ? '✓' : milestone.sort_order + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{milestone.title}</div>
                {milestone.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{milestone.description}</div>}
                {milestone.due_date && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Due: {new Date(milestone.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {milestone.status === 'pending' && (
                  <button onClick={() => updateMilestoneStatus(milestone.id, 'in_progress')} style={{ padding: '6px 14px', background: '#F0A50022', color: '#F0A500', border: '1px solid #F0A50044', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Start
                  </button>
                )}
                {milestone.status === 'in_progress' && (
                  <button onClick={() => updateMilestoneStatus(milestone.id, 'completed')} style={{ padding: '6px 14px', background: '#22C55E22', color: '#22C55E', border: '1px solid #22C55E44', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    Complete
                  </button>
                )}
                {milestone.status === 'completed' && (
                  <StatusBadge status="completed" />
                )}
              </div>
            </div>
          ))}
          {(!project.milestones || project.milestones.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No milestones generated yet
            </div>
          )}
        </div>
      )}

      {/* Monitoring Tab */}
      {activeTab === 'monitoring' && (
        <div>
          {['output', 'outcome', 'impact'].map(category => {
            const categoryIndicators = project.indicators?.filter(i => i.category === category) || [];
            if (categoryIndicators.length === 0) return null;
            return (
              <div key={category} style={{ marginBottom: 32 }}>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 16, textTransform: 'capitalize' }}>
                  {category} Indicators
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {categoryIndicators.map(indicator => {
                    const pct = indicator.target_value > 0 ? Math.round((indicator.current_value / indicator.target_value) * 100) : 0;
                    const statusColor = pct >= 75 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444';
                    return (
                      <div key={indicator.id} style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{indicator.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: statusColor }}>{indicator.current_value.toLocaleString()}</span>
                          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ {indicator.target_value.toLocaleString()} {indicator.unit}</span>
                        </div>
                        <ProgressBar value={indicator.current_value} max={indicator.target_value} color={statusColor} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{indicator.reporting_period}</span>
                          <input
                            type="number"
                            placeholder="Update..."
                            style={{
                              width: 80, padding: '4px 8px', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                              borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, outline: 'none',
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = parseFloat((e.target as HTMLInputElement).value);
                                if (!isNaN(val)) {
                                  updateIndicatorValue(indicator.id, val);
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {(!project.indicators || project.indicators.length === 0) && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No indicators set up yet
            </div>
          )}
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 32, border: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 24 }}>Budget Overview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Total Budget</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--text-primary)' }}>€{(project.budget_total || 0).toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Spent to Date</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: budgetPct > 80 ? '#EF4444' : budgetPct > 60 ? '#F59E0B' : '#22C55E' }}>€{(project.budget_spent || 0).toLocaleString()}</div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Budget utilization</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{budgetPct}%</span>
            </div>
            <div style={{ height: 16, borderRadius: 8, background: 'var(--bg-elevated)' }}>
              <div style={{ width: `${Math.min(budgetPct, 100)}%`, height: '100%', borderRadius: 8, background: budgetPct > 80 ? '#EF4444' : budgetPct > 60 ? '#F59E0B' : '#22C55E', transition: 'width 0.3s' }} />
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 24, fontStyle: 'italic' }}>
            Remaining: €{((project.budget_total || 0) - (project.budget_spent || 0)).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
