'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/app/components/AuthGuard';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface Proposal {
  id: string;
  title: string;
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
  idea_id?: string | null;
  sector_specialist?: string | null;
}

const SPECIALIST_LABEL_KEYS: Record<string, TranslationKey> = {
  agrifood: 'specialist.agrifood.short',
  cleantech_energy: 'specialist.cleantech.short',
  health_pharma: 'specialist.health.short',
  infra_mobility: 'specialist.infra.short',
  digital_tech: 'specialist.digital.short',
  circular_manufacturing: 'specialist.circular.short',
  generalist: 'specialist.generalist.short',
};

const STATUS_COLORS: Record<string, string> = { draft: '#7A90A8', in_review: '#F59E0B', submitted: '#22C55E' };

function ProposalsContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/proposals')
      .then(r => r.json())
      .then(data => setProposals(data.proposals || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>{t('prop.title')}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('prop.subtitleIdeas')}</p>
        </div>
        <button onClick={() => router.push('/opportunities')} style={{ padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          {t('prop.findOpportunities')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 100, background: 'var(--bg-surface)', borderRadius: 12, animation: 'skeleton 1.5s infinite' }} />)}
        </div>
      ) : proposals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text-primary)', marginBottom: 8 }}>{t('prop.noProposals')}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>{t('prop.noProposalsDesc')}</div>
          <button onClick={() => router.push('/opportunities')} style={{ padding: '12px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
            {t('prop.findOpportunities')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {proposals.map(p => (
            <div key={p.id} onClick={() => router.push(`/proposals/${p.id}`)}
              style={{ background: 'var(--bg-surface)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#60A5FA44')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--text-primary)', marginBottom: 4 }}>{p.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600, textTransform: 'uppercase', background: `${STATUS_COLORS[p.status] || '#7A90A8'}22`, color: STATUS_COLORS[p.status] || '#7A90A8' }}>{t(`prop.status.${p.status}` as TranslationKey)}</span>
                    {p.sector_specialist && SPECIALIST_LABEL_KEYS[p.sector_specialist] && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {t(SPECIALIST_LABEL_KEYS[p.sector_specialist])}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: '#60A5FA' }}>{p.progress}%</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('prop.complete')}</div>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-elevated)' }}>
                <div style={{ width: `${p.progress}%`, height: '100%', borderRadius: 3, background: '#60A5FA' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProposalsPage() { return <AuthGuard><ProposalsContent /></AuthGuard>; }
