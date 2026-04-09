'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/app/components/AuthGuard';

interface Stats {
  opportunities: number;
  savedOpportunities: number;
  proposals: number;
  projects: number;
  indicators: number;
  partners: number;
}

interface RecentItem {
  id: string;
  title: string;
  status?: string;
  funder?: string;
  match_score?: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: '#60A5FA',
  saved: '#F0A500',
  draft: '#7A90A8',
  in_review: '#F59E0B',
  submitted: '#22C55E',
  setup: '#60A5FA',
  active: '#22C55E',
  pending: '#7A90A8',
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
};

function DashboardContent() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ opportunities: 0, savedOpportunities: 0, proposals: 0, projects: 0, indicators: 0, partners: 0 });
  const [recentOpps, setRecentOpps] = useState<RecentItem[]>([]);
  const [recentProposals, setRecentProposals] = useState<RecentItem[]>([]);
  const [recentProjects, setRecentProjects] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [oppsRes, proposalsRes, projectsRes, partnersRes] = await Promise.all([
          fetch('/api/opportunities').then(r => r.json()).catch(() => ({ opportunities: [] })),
          fetch('/api/proposals').then(r => r.json()).catch(() => ({ proposals: [] })),
          fetch('/api/projects').then(r => r.json()).catch(() => ({ projects: [] })),
          fetch('/api/partners').then(r => r.json()).catch(() => ({ partners: [] })),
        ]);

        const opps = oppsRes.opportunities || [];
        const proposals = proposalsRes.proposals || [];
        const projects = projectsRes.projects || [];
        const partners = partnersRes.partners || [];

        setStats({
          opportunities: opps.length,
          savedOpportunities: opps.filter((o: Record<string, string>) => o.status === 'saved').length,
          proposals: proposals.length,
          projects: projects.length,
          indicators: projects.reduce((sum: number, p: Record<string, unknown[]>) => sum + (p.indicators?.length || 0), 0),
          partners: partners.length,
        });

        setRecentOpps(opps.slice(0, 3));
        setRecentProposals(proposals.slice(0, 3));
        setRecentProjects(projects.slice(0, 3));
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: 120, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Opportunities Found', value: stats.opportunities, icon: '🔍', color: '#F0A500', link: '/opportunities' },
    { label: 'Proposals', value: stats.proposals, icon: '📝', color: '#60A5FA', link: '/proposals' },
    { label: 'Active Projects', value: stats.projects, icon: '📊', color: '#8B5CF6', link: '/projects' },
    { label: 'Partners Screened', value: stats.partners, icon: '🛡️', color: '#22C55E', link: '/partners' },
  ];

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15 }}>Your development finance pipeline at a glance</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {statCards.map((card) => (
          <div
            key={card.label}
            onClick={() => router.push(card.link)}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = card.color + '44')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{card.icon}</span>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: card.color }}>{card.value}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{
        background: `linear-gradient(135deg, var(--accent)11, var(--bg-surface))`,
        borderRadius: 12,
        padding: 24,
        border: '1px solid var(--accent)33',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 4 }}>
            Find New Opportunities
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Search EU and multilateral funding matched to your company profile
          </div>
        </div>
        <button
          onClick={() => router.push('/opportunities')}
          style={{
            padding: '12px 24px',
            background: 'var(--accent)',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: 'nowrap',
          }}
        >
          Search Opportunities →
        </button>
      </div>

      {/* Recent Activity Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {/* Recent Opportunities */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>Recent Opportunities</h3>
            <button onClick={() => router.push('/opportunities')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>View all →</button>
          </div>
          {recentOpps.length > 0 ? recentOpps.map((opp) => (
            <div key={opp.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{opp.title}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {opp.funder && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(opp as unknown as Record<string, string>).funder_abbrev || opp.funder}</span>}
                {opp.match_score && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{opp.match_score}%</span>}
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${STATUS_COLORS[opp.status || 'new'] || '#7A90A8'}22`, color: STATUS_COLORS[opp.status || 'new'] || '#7A90A8' }}>
                  {opp.status || 'new'}
                </span>
              </div>
            </div>
          )) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No opportunities yet</div>
          )}
        </div>

        {/* Recent Proposals */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>Recent Proposals</h3>
            <button onClick={() => router.push('/proposals')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>View all →</button>
          </div>
          {recentProposals.length > 0 ? recentProposals.map((prop) => (
            <div key={prop.id} onClick={() => router.push(`/proposals/${prop.id}`)} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{prop.title}</div>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${STATUS_COLORS[prop.status || 'draft'] || '#7A90A8'}22`, color: STATUS_COLORS[prop.status || 'draft'] || '#7A90A8' }}>
                {prop.status || 'draft'}
              </span>
            </div>
          )) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No proposals yet</div>
          )}
        </div>

        {/* Recent Projects */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-primary)', margin: 0 }}>Active Projects</h3>
            <button onClick={() => router.push('/projects')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>View all →</button>
          </div>
          {recentProjects.length > 0 ? recentProjects.map((proj) => (
            <div key={proj.id} onClick={() => router.push(`/projects/${proj.id}`)} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{proj.title}</div>
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${STATUS_COLORS[proj.status || 'setup'] || '#7A90A8'}22`, color: STATUS_COLORS[proj.status || 'setup'] || '#7A90A8' }}>
                {proj.status || 'setup'}
              </span>
            </div>
          )) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No projects yet</div>
          )}
        </div>
      </div>

      {/* AI Agents callout */}
      <div
        onClick={() => router.push('/agents')}
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 12,
          padding: 24,
          border: '1px solid var(--border)',
          marginTop: 24,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['🔍', '📝', '🛡️', '📊', '📋'].map((icon, i) => (
              <span key={i} style={{ fontSize: 20, opacity: 0.8 + i * 0.05 }}>{icon}</span>
            ))}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--text-primary)' }}>
              10 AI Agents Active
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              5 platform specialists + 5 sector experts powering your pipeline
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>View Agents →</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
