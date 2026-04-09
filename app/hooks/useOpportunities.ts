'use client';

import { useState, useEffect, useCallback } from 'react';

interface Opportunity {
  id: string;
  dbId?: string;
  company_id: string;
  funder: string;
  funder_abbrev: string;
  title: string;
  description: string;
  budget_min: number;
  budget_max: number;
  currency: string;
  deadline: string;
  geographies: string[];
  sectors: string[];
  match_score: number;
  match_rationale: string;
  recommended_approach: string;
  instrument_type: string;
  prior_eu_experience_required: boolean;
  status: string;
  created_at: string;
}

export function useSavedOpportunities(companyId: string | null) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId, status: 'saved' });
      const res = await fetch(`/api/opportunities?${params}`);
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (err) {
      console.error('Failed to fetch saved opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { opportunities, loading, refetch: fetch_ };
}

export function useAllOpportunities(companyId: string | null) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId });
      const res = await fetch(`/api/opportunities?${params}`);
      const data = await res.json();
      setOpportunities(data.opportunities || []);
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { opportunities, loading, refetch: fetch_ };
}

export function useUpdateOpportunityStatus() {
  const [updating, setUpdating] = useState<string | null>(null);

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id);
    try {
      await fetch('/api/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
    } catch (err) {
      console.error('Failed to update opportunity status:', err);
    } finally {
      setUpdating(null);
    }
  };

  return { updateStatus, updating };
}
