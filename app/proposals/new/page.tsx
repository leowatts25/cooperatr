'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function NewProposalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opportunityId = searchParams.get('opportunityId');
  const companyId = searchParams.get('companyId') || (typeof window !== 'undefined' ? localStorage.getItem('cooperatr_companyId') : null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!opportunityId) {
      router.push('/opportunities');
    }
  }, [opportunityId, router]);

  async function handleGenerate() {
    if (!opportunityId || !companyId) {
      setError('Missing opportunity or company information. Please search for opportunities first.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, companyId }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/proposals/${data.proposalId}`);
    } catch (err) {
      console.error(err);
      setError('Failed to generate proposal. Please try again.');
      setGenerating(false);
    }
  }

  return (
    <div style={{ padding: '40px 24px', maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📝</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 28, color: 'var(--text-primary)', marginBottom: 12 }}>
        Generate Proposal
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
        Our AI Proposal Writer will generate a complete draft with four sections:
        Executive Summary, Technical Approach, Financial Plan, and Compliance & ESG.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, textAlign: 'left' }}>
        {['Executive Summary', 'Technical Approach', 'Financial Plan', 'Compliance & ESG'].map(section => (
          <div key={section} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{section}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>AI-generated, editable</div>
          </div>
        ))}
      </div>

      {error && (
        <p style={{ fontSize: 13, color: '#EF4444', padding: '10px 16px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 16 }}>{error}</p>
      )}

      <button
        onClick={handleGenerate}
        disabled={generating}
        style={{
          padding: '14px 32px', borderRadius: 10, border: 'none',
          background: generating ? 'var(--bg-elevated)' : 'var(--accent)',
          color: generating ? 'var(--text-muted)' : '#0F1623',
          fontSize: 15, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
          width: '100%', maxWidth: 300,
        }}
      >
        {generating ? 'Generating proposal...' : 'Generate Proposal →'}
      </button>

      {generating && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 16, fontStyle: 'italic' }}>
          This may take up to 60 seconds. The AI is drafting all four sections...
        </p>
      )}
    </div>
  );
}

export default function NewProposalPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>}>
      <NewProposalContent />
    </Suspense>
  );
}
