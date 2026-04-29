'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

interface Proposal {
  id: string;
  title: string;
  status: string;
  executive_summary: string;
  technical_section: string;
  financial_section: string;
  compliance_section: string;
  progress: number;
  created_at: string;
  updated_at: string;
  opportunity_id: string | null;
  idea_id: string | null;
  company_id: string;
  sector_specialist: string | null;
  specialist_rationale: string | null;
}

const SPECIALIST_LABEL_KEYS: Record<string, TranslationKey> = {
  agrifood: 'specialist.agrifood.long',
  cleantech_energy: 'specialist.cleantech.long',
  health_pharma: 'specialist.health.long',
  infra_mobility: 'specialist.infra.long',
  digital_tech: 'specialist.digital.long',
  circular_manufacturing: 'specialist.circular.long',
  generalist: 'specialist.generalist.long',
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#7A90A8',
  in_review: '#F59E0B',
  submitted: '#22C55E',
};

type SectionKey = 'executive_summary' | 'technical_section' | 'financial_section' | 'compliance_section';
const SECTIONS: { key: SectionKey; labelKey: TranslationKey; icon: string }[] = [
  { key: 'executive_summary', labelKey: 'propws.section.executive', icon: '📋' },
  { key: 'technical_section', labelKey: 'propws.section.technical', icon: '🔧' },
  { key: 'financial_section', labelKey: 'propws.section.financial', icon: '💰' },
  { key: 'compliance_section', labelKey: 'propws.section.compliance', icon: '🛡️' },
];

export default function ProposalWorkspace() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('executive_summary');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/proposals?id=${params.id}`)
      .then(r => r.json())
      .then(data => setProposal(data.proposal))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function updateStatus(status: string) {
    setSaving(true);
    try {
      await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposal?.id, status }),
      });
      setProposal(prev => prev ? { ...prev, status } : null);
    } finally {
      setSaving(false);
    }
  }

  async function createProject() {
    if (!proposal) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, companyId: proposal.company_id }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (data.projectId) {
        router.push(`/projects/${data.projectId}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ height: 32, width: 400, background: 'var(--bg-elevated)', borderRadius: 8, animation: 'skeleton 1.5s infinite' }} />
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 80, background: 'var(--bg-elevated)', borderRadius: 12, marginTop: 12, animation: 'skeleton 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (!proposal) {
    return (
      <div style={{ padding: 80, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 18 }}>{t('propws.notFound')}</p>
        <button onClick={() => router.push('/proposals')} style={{ marginTop: 16, padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          {t('propws.backToProposals')}
        </button>
      </div>
    );
  }

  const specialistLabel = proposal.sector_specialist && SPECIALIST_LABEL_KEYS[proposal.sector_specialist]
    ? t(SPECIALIST_LABEL_KEYS[proposal.sector_specialist])
    : proposal.sector_specialist;

  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <button onClick={() => router.push('/proposals')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, marginBottom: 8, padding: 0 }}>
        {t('propws.backArrow')}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--text-primary)', marginBottom: 8 }}>{proposal.title}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              background: `${STATUS_COLORS[proposal.status] || '#7A90A8'}22`,
              color: STATUS_COLORS[proposal.status] || '#7A90A8',
            }}>
              {t(`prop.status.${proposal.status}` as TranslationKey)}
            </span>
            {specialistLabel && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('propws.draftedBy')} {specialistLabel}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {proposal.status === 'draft' && (
            <button onClick={() => updateStatus('in_review')} disabled={saving} style={{
              padding: '10px 20px', background: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>
              {t('propws.markInReview')}
            </button>
          )}
          {proposal.status === 'in_review' && (
            <button onClick={() => updateStatus('submitted')} disabled={saving} style={{
              padding: '10px 20px', background: '#22C55E22', color: '#22C55E', border: '1px solid #22C55E44',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>
              {t('propws.markSubmitted')}
            </button>
          )}
          {proposal.status === 'submitted' && (
            <button onClick={createProject} disabled={saving} style={{
              padding: '10px 20px', background: 'var(--accent)', color: '#000', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
            }}>
              {saving ? t('propws.creatingProject') : t('propws.awardProject')}
            </button>
          )}
        </div>
      </div>

      {/* Specialist rationale */}
      {proposal.specialist_rationale && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid var(--accent)',
            backgroundColor: 'var(--accent-dim)',
            marginBottom: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: 'var(--accent)',
              whiteSpace: 'nowrap',
              paddingTop: 2,
            }}
          >
            {t('propws.routing')}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)', margin: 0 }}>
            {proposal.specialist_rationale}
          </p>
        </div>
      )}

      {/* Progress */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: 16, border: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('propws.completeness')}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{proposal.progress}%</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)' }}>
          <div style={{ width: `${proposal.progress}%`, height: '100%', borderRadius: 3, background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {SECTIONS.map(section => {
          const content = proposal[section.key];
          const isExpanded = expandedSection === section.key;
          return (
            <div key={section.key} style={{ background: 'var(--bg-surface)', borderRadius: 12, border: `1px solid ${isExpanded ? 'var(--accent)33' : 'var(--border)'}`, overflow: 'hidden' }}>
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.key)}
                style={{
                  width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{section.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{t(section.labelKey)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {content ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#22C55E22', color: '#22C55E', fontWeight: 600 }}>{t('propws.generated')}</span>
                  ) : (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#7A90A822', color: '#7A90A8', fontWeight: 600 }}>{t('propws.pending')}</span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </div>
              </button>
              {isExpanded && content && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7, paddingTop: 16 }}>
                    {content}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
