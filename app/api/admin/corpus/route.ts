import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { checkApprovedUser } from '@/app/lib/auth-check';

export const maxDuration = 30;

// ============================================================================
// Persist + list reviewed corpus entries.
//
// Two-step lifecycle:
//   1. POST /api/admin/corpus/extract   →  returns { pattern, guardrails }
//   2. (admin reviews, edits, clears flags)
//   3. POST /api/admin/corpus           →  inserts corpus_source + proposal_pattern
//
// Insertion REQUIRES that all guardrail flags are either false OR explicitly
// acknowledged by the reviewer (`acknowledge_flags: true`). This is a
// belt-and-suspenders guard on top of the extractor's own controls.
// ============================================================================

type SourceTier = 'public_disclosure' | 'own_authored' | 'industry_standard' | 'cleared_third_party';
type LegalReview = 'self' | 'counsel' | 'attorney_reviewed';
type Outcome = 'won' | 'lost' | 'shortlisted' | 'unknown';
type SourceStatus = 'destroyed' | 'archived_offline' | 'public_link';

type PersistBody = {
  // Source provenance (corpus_sources row)
  source: {
    source_tier: SourceTier;
    legal_review?: LegalReview;
    donor?: string;
    sector?: string;
    geography_class?: string;
    award_size_band?: string;
    outcome?: Outcome;
    year?: number;
    source_description?: string;
    public_url?: string;
    source_hash?: string;          // From extract endpoint
    source_status?: SourceStatus;
  };

  // Pattern artifact (proposal_patterns row) — typically the reviewer-edited
  // output of /extract.
  pattern: {
    donor?: string;
    sector?: string;
    geography_class?: string;
    award_size_band?: string;
    section_inventory?: unknown;
    toc_archetype?: string;
    m_and_e_framework?: string;
    indicator_set_refs?: string[];
    budget_ratios?: Record<string, number>;
    evaluation_dimensions?: string[];
    signaling_phrases?: string[];
    win_archetype?: string;
    failure_archetype?: string;
    compliance_sections_required?: string[];
    structural_notes?: string;
  };

  // Guardrail report from /extract (or fresh, if reviewer re-ran extraction).
  // If any flag is true, `acknowledge_flags` must also be true to persist.
  guardrails?: {
    flag_proper_nouns?: boolean;
    flag_verbatim_quotes?: boolean;
    flag_absolute_figures?: boolean;
    flag_notes?: string;
  };
  acknowledge_flags?: boolean;
};

// ============================================================================
// GET — list reviewed patterns (admin only)
// ============================================================================
// Query params:
//   ?donor=AECID
//   ?sector=agrifood
//   ?geography_class=sub-saharan-africa
//   ?reviewed_only=true    (default true — unreviewed patterns aren't
//                            available to retrieval-time consumers)
// ============================================================================

export async function GET(req: NextRequest) {
  const auth = await checkApprovedUser(req);
  if (!auth.authorized) return auth.response!;

  const supabase = createServerClient();
  const url = new URL(req.url);
  const donor = url.searchParams.get('donor');
  const sector = url.searchParams.get('sector');
  const geo = url.searchParams.get('geography_class');
  const reviewedOnly = url.searchParams.get('reviewed_only') !== 'false';

  let query = supabase
    .from('proposal_patterns')
    .select(`
      id, donor, sector, geography_class, award_size_band,
      toc_archetype, m_and_e_framework,
      indicator_set_refs, evaluation_dimensions, signaling_phrases,
      win_archetype, failure_archetype, structural_notes,
      compliance_sections_required, budget_ratios,
      human_reviewed, flag_proper_nouns, flag_verbatim_quotes,
      flag_absolute_figures, flag_notes,
      created_at, reviewed_at,
      corpus_sources ( source_tier, legal_review, outcome, year, source_description )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (donor) query = query.eq('donor', donor);
  if (sector) query = query.eq('sector', sector);
  if (geo) query = query.eq('geography_class', geo);
  if (reviewedOnly) query = query.eq('human_reviewed', true);

  const { data, error } = await query;
  if (error) {
    console.error('[corpus:list] error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ patterns: data || [] });
}

// ============================================================================
// POST — persist a reviewed extraction
// ============================================================================

export async function POST(req: NextRequest) {
  const auth = await checkApprovedUser(req);
  if (!auth.authorized) return auth.response!;

  let body: PersistBody;
  try {
    body = (await req.json()) as PersistBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { source, pattern, guardrails, acknowledge_flags } = body;

  if (!source || !source.source_tier) {
    return NextResponse.json(
      { error: 'source.source_tier is required' },
      { status: 400 },
    );
  }
  if (!pattern) {
    return NextResponse.json({ error: 'pattern is required' }, { status: 400 });
  }

  // Guardrail enforcement — refuse to persist flagged patterns unless the
  // reviewer explicitly acknowledged them.
  const hasFlag =
    guardrails &&
    (guardrails.flag_proper_nouns ||
      guardrails.flag_verbatim_quotes ||
      guardrails.flag_absolute_figures);
  if (hasFlag && !acknowledge_flags) {
    return NextResponse.json(
      {
        error:
          'Guardrail flags raised. Set acknowledge_flags: true to persist anyway, or edit the pattern to clear them.',
        flags: guardrails,
      },
      { status: 409 },
    );
  }

  const supabase = createServerClient();

  // Dedupe: if a source with the same hash already exists, return its id
  // and refuse to insert a duplicate. (The reviewer can manually merge
  // patterns under one source if they want multiple extracts.)
  if (source.source_hash) {
    const { data: existing } = await supabase
      .from('corpus_sources')
      .select('id')
      .eq('source_hash', source.source_hash)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        {
          error: 'A source with this hash already exists. Use existing source_id to attach another pattern.',
          existing_source_id: existing.id,
        },
        { status: 409 },
      );
    }
  }

  // 1. Insert corpus_sources row
  const sourceRow = {
    source_tier: source.source_tier,
    legal_review: source.legal_review || 'self',
    donor: source.donor || pattern.donor || null,
    sector: source.sector || pattern.sector || null,
    geography_class: source.geography_class || pattern.geography_class || null,
    award_size_band: source.award_size_band || pattern.award_size_band || null,
    outcome: source.outcome || null,
    year: source.year || null,
    source_description: source.source_description || null,
    public_url: source.public_url || null,
    source_hash: source.source_hash || null,
    source_status: source.source_status || 'destroyed',
    added_by: auth.userId || null,
  };

  const { data: insertedSource, error: sourceError } = await supabase
    .from('corpus_sources')
    .insert(sourceRow)
    .select('id')
    .single();

  if (sourceError || !insertedSource) {
    console.error('[corpus:persist] source insert error:', sourceError);
    return NextResponse.json(
      { error: `Failed to insert corpus_sources: ${sourceError?.message}` },
      { status: 500 },
    );
  }

  // 2. Insert proposal_patterns row
  const patternRow = {
    source_id: insertedSource.id,
    donor: pattern.donor || source.donor || null,
    sector: pattern.sector || source.sector || null,
    geography_class: pattern.geography_class || source.geography_class || null,
    award_size_band: pattern.award_size_band || source.award_size_band || null,
    section_inventory: pattern.section_inventory ?? null,
    toc_archetype: pattern.toc_archetype || null,
    m_and_e_framework: pattern.m_and_e_framework || null,
    indicator_set_refs: pattern.indicator_set_refs || [],
    budget_ratios: pattern.budget_ratios ?? null,
    evaluation_dimensions: pattern.evaluation_dimensions || [],
    signaling_phrases: pattern.signaling_phrases || [],
    win_archetype: pattern.win_archetype || null,
    failure_archetype: pattern.failure_archetype || null,
    compliance_sections_required: pattern.compliance_sections_required || [],
    structural_notes: pattern.structural_notes || null,
    // Review state: marking reviewed at persistence time. If guardrails were
    // acknowledged, record that on flag_notes.
    human_reviewed: true,
    reviewed_by: auth.userId || null,
    reviewed_at: new Date().toISOString(),
    flag_proper_nouns: guardrails?.flag_proper_nouns || false,
    flag_verbatim_quotes: guardrails?.flag_verbatim_quotes || false,
    flag_absolute_figures: guardrails?.flag_absolute_figures || false,
    flag_notes: [
      guardrails?.flag_notes,
      hasFlag ? '[REVIEWER ACKNOWLEDGED FLAGS]' : null,
    ]
      .filter(Boolean)
      .join(' | ') || null,
  };

  const { data: insertedPattern, error: patternError } = await supabase
    .from('proposal_patterns')
    .insert(patternRow)
    .select('id')
    .single();

  if (patternError || !insertedPattern) {
    console.error('[corpus:persist] pattern insert error:', patternError);
    // Roll back the source row to avoid orphans
    await supabase.from('corpus_sources').delete().eq('id', insertedSource.id);
    return NextResponse.json(
      { error: `Failed to insert proposal_patterns: ${patternError?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    source_id: insertedSource.id,
    pattern_id: insertedPattern.id,
  });
}
