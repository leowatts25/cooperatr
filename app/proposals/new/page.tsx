'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation, type TranslationKey } from '@/app/lib/i18n/context';

function NewProposalContent() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const ideaId = searchParams.get('ideaId') || searchParams.get('opportunityId');
  const companyId =
    searchParams.get('companyId') ||
    (typeof window !== 'undefined' ? localStorage.getItem('cooperatr_companyId') : null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!ideaId) {
      router.push('/opportunities');
    }
  }, [ideaId, router]);

  async function handleGenerate() {
    if (!ideaId) {
      setError(t('propnew.errorMissing'));
      return;
    }
    setGenerating(true);
    setError('');
    setStatus(t('propnew.statusRouting'));
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId, companyId, locale }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus(`${data.specialistLabel || 'Specialist'} ${t('propnew.statusDrafted')}`);
      router.push(`/proposals/${data.proposalId}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('propnew.errorFailed'));
      setGenerating(false);
      setStatus('');
    }
  }

  const sections: { labelKey: TranslationKey; hintKey: TranslationKey }[] = [
    { labelKey: 'propnew.section.exec.label', hintKey: 'propnew.section.exec.hint' },
    { labelKey: 'propnew.section.tech.label', hintKey: 'propnew.section.tech.hint' },
    { labelKey: 'propnew.section.fin.label', hintKey: 'propnew.section.fin.hint' },
    { labelKey: 'propnew.section.compliance.label', hintKey: 'propnew.section.compliance.hint' },
  ];

  return (
    <div style={{ padding: '40px 24px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>📝</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 12 }}>
        {t('propnew.title')}
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
        {t('propnew.description')}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 28,
          textAlign: 'left',
        }}
      >
        {sections.map((section) => (
          <div
            key={section.labelKey}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 10,
              padding: 14,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t(section.labelKey)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {t(section.hintKey)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 16px',
          borderRadius: 10,
          border: '1px solid var(--accent)',
          backgroundColor: 'var(--accent-dim)',
          marginBottom: 20,
          fontSize: 12,
          color: 'var(--text-primary)',
          textAlign: 'left',
        }}
      >
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>{t('propnew.howItWorks.title')}</div>
        {t('propnew.howItWorks.body')}
      </div>

      {error && (
        <p
          style={{
            fontSize: 13,
            color: '#EF4444',
            padding: '10px 16px',
            background: 'rgba(239,68,68,0.1)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: '14px 32px',
          borderRadius: 10,
          border: 'none',
          background: generating ? 'var(--bg-elevated)' : 'var(--accent)',
          color: generating ? 'var(--text-muted)' : '#0F1623',
          fontSize: 15,
          fontWeight: 600,
          cursor: generating ? 'not-allowed' : 'pointer',
          width: '100%',
          maxWidth: 320,
        }}
      >
        {generating ? t('propnew.buttonGenerating') : t('propnew.button')}
      </button>

      {generating && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, fontStyle: 'italic' }}>
          {status || t('propnew.taking')}
        </p>
      )}
    </div>
  );
}

function LoadingFallback() {
  // Suspense fallback can't use hooks before mount; static EN ok
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>;
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewProposalContent />
    </Suspense>
  );
}
