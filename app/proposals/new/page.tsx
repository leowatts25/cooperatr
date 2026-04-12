'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewProposalContent() {
  const router = useRouter();
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
      setError('Missing idea reference. Go back and pick a saved idea.');
      return;
    }
    setGenerating(true);
    setError('');
    setStatus('Routing to the best sector specialist…');
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId, companyId }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus(`${data.specialistLabel || 'Specialist'} drafted the proposal. Opening…`);
      router.push(`/proposals/${data.proposalId}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to generate proposal. Please try again.');
      setGenerating(false);
      setStatus('');
    }
  }

  return (
    <div style={{ padding: '40px 24px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>📝</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 12 }}>
        Generate Proposal
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
        A sector specialist will draft a complete proposal tailored to your idea:
        Executive Summary, Technical Approach, Financial Plan, and Compliance &amp; ESG.
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
        {[
          { label: 'Executive Summary', hint: 'Rationale + impact' },
          { label: 'Technical Approach', hint: 'Logframe + workplan' },
          { label: 'Financial Plan', hint: 'Budget + co-financing' },
          { label: 'Compliance & ESG', hint: 'CSDDD, safeguards, gender' },
        ].map((section) => (
          <div
            key={section.label}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 10,
              padding: 14,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {section.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {section.hint}
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
        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>How it works</div>
        A router picks the best specialist (agrifood, cleantech, health, infra, digital, circular, or generalist) based on
        the idea&apos;s real center of gravity. The specialist then drafts the full proposal using their domain knowledge.
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
        {generating ? 'Drafting proposal…' : 'Generate Proposal →'}
      </button>

      {generating && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, fontStyle: 'italic' }}>
          {status || 'This may take 30–60 seconds.'}
        </p>
      )}
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      }
    >
      <NewProposalContent />
    </Suspense>
  );
}
