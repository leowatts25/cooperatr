import { createServerClient } from '@/app/lib/supabase';

// ============================================================================
// Corpus retrieval — pulls relevant proposal patterns for the Opportunity
// Engine to inject as few-shot context.
//
// Phase 1 (this file): metadata-based filtering. Match by donor / sector /
// geography_class with graceful fallback to broader sets.
// Phase 2 (future): pgvector cosine similarity over embedding column once
// patterns are embedded.
// ============================================================================

export type RetrievalOptions = {
  sector?: string | null;          // e.g. 'agrifood', 'cleantech_energy'
  geography?: string | null;       // e.g. 'south-asia', 'sea', 'latam', 'global'
  donor_focus?: string[];          // e.g. ['USAID', 'EU-NDICI', 'GCF']
  side?: 'donor' | 'bidder' | 'both' | null;
  engagement_type?: string | null; // optional filter
  limit?: number;                  // default 3
  locale?: 'en' | 'es';            // for header formatting
};

export type RetrievedPattern = {
  id: string;
  donor: string | null;
  donor_archetype: string | null;
  sector: string | null;
  geography_class: string | null;
  award_size_band: string | null;
  side_perspective: string | null;
  engagement_type: string | null;
  toc_archetype: string | null;
  win_archetype: string | null;
  signaling_phrases: string[] | null;
  intervention_logic: string | null;
  structural_notes: string | null;
  partnership_architecture: string | null;
  source_description: string | null;
};

export type PatternContext = {
  formatted: string;        // Markdown block to inject into prompt
  pattern_ids: string[];    // For analytics / feedback loop
  total_retrieved: number;
  retrieval_strategy: 'exact_match' | 'sector_match' | 'broad_fallback' | 'no_match';
};

// ============================================================================
// Compact pattern formatter
// ============================================================================
//
// Goal: ~150-250 words per pattern when injected as prompt context. Heavy
// trim of intervention_logic and structural_notes since the full versions
// would blow the prompt budget for 3 patterns.
// ============================================================================

function trimTo(text: string | null | undefined, maxWords: number): string {
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ').trim() + '…';
}

function formatPattern(p: RetrievedPattern, idx: number, locale: 'en' | 'es'): string {
  const lines: string[] = [];
  const header = locale === 'es' ? 'PATRÓN' : 'PATTERN';
  const winLabel = locale === 'es' ? 'Arquetipo ganador' : 'Win archetype';
  const signalLabel = locale === 'es' ? 'Frases de señalización' : 'Signaling phrases';
  const interventionLabel = locale === 'es' ? 'Lógica de intervención' : 'Intervention logic';
  const partnershipLabel = locale === 'es' ? 'Arquitectura de socios' : 'Partnership architecture';

  // Header: donor / sector / geo / size / engagement type / side
  const tagBits = [
    p.donor || 'unknown-donor',
    p.sector || 'unknown-sector',
    p.geography_class || 'unknown-geo',
    p.award_size_band || 'unknown-size',
    p.engagement_type || 'unknown-engagement',
    p.side_perspective ? `${p.side_perspective}-side` : 'unknown-side',
  ];
  lines.push(`### ${header} ${idx + 1} — ${tagBits.join(' / ')}`);

  if (p.donor_archetype) {
    lines.push(`*${p.donor_archetype}*`);
  }

  if (p.win_archetype) {
    lines.push(`**${winLabel}:** ${trimTo(p.win_archetype, 60)}`);
  }

  if (p.signaling_phrases && p.signaling_phrases.length > 0) {
    const phrases = p.signaling_phrases.slice(0, 8).join('; ');
    lines.push(`**${signalLabel}:** ${phrases}`);
  }

  if (p.intervention_logic) {
    lines.push(`**${interventionLabel}:** ${trimTo(p.intervention_logic, 80)}`);
  }

  if (p.partnership_architecture) {
    lines.push(`**${partnershipLabel}:** ${trimTo(p.partnership_architecture, 50)}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Retrieval logic
// ============================================================================
//
// Strategy (in priority order):
//   1. Exact match on sector + geography + (any of donor_focus)
//   2. Sector + geography match, donor agnostic
//   3. Sector match only, with broader geography
//   4. Broad fallback: any reviewed patterns
//
// Always prefer human_reviewed=true. Always include some side='donor'
// patterns (they teach the engine what evaluators want).
// ============================================================================

export async function getRelevantPatterns(opts: RetrievalOptions): Promise<PatternContext> {
  const supabase = createServerClient();
  const limit = opts.limit ?? 3;
  const locale = opts.locale ?? 'en';

  const selectColumns = `
    id, donor, donor_archetype, sector, geography_class, award_size_band,
    side_perspective, engagement_type, toc_archetype,
    win_archetype, signaling_phrases, intervention_logic,
    structural_notes, partnership_architecture,
    corpus_sources ( source_description )
  `;

  // Strategy 1: exact sector + geography + donor focus
  let strategy: PatternContext['retrieval_strategy'] = 'no_match';
  let rows: unknown[] = [];

  if (opts.sector && opts.geography) {
    let q = supabase
      .from('proposal_patterns')
      .select(selectColumns)
      .eq('human_reviewed', true)
      .eq('sector', opts.sector)
      .eq('geography_class', opts.geography)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.donor_focus && opts.donor_focus.length > 0) {
      q = q.in('donor', opts.donor_focus);
    }
    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      rows = data;
      strategy = 'exact_match';
    }
  }

  // Strategy 2: sector + geography (donor agnostic)
  if (rows.length === 0 && opts.sector && opts.geography) {
    const { data, error } = await supabase
      .from('proposal_patterns')
      .select(selectColumns)
      .eq('human_reviewed', true)
      .eq('sector', opts.sector)
      .eq('geography_class', opts.geography)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data && data.length > 0) {
      rows = data;
      strategy = 'sector_match';
    }
  }

  // Strategy 3: sector only (any geography)
  if (rows.length === 0 && opts.sector) {
    const { data, error } = await supabase
      .from('proposal_patterns')
      .select(selectColumns)
      .eq('human_reviewed', true)
      .eq('sector', opts.sector)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data && data.length > 0) {
      rows = data;
      strategy = 'sector_match';
    }
  }

  // Strategy 4: broad fallback
  if (rows.length === 0) {
    const { data, error } = await supabase
      .from('proposal_patterns')
      .select(selectColumns)
      .eq('human_reviewed', true)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (!error && data && data.length > 0) {
      rows = data;
      strategy = 'broad_fallback';
    }
  }

  // Flatten the joined corpus_sources object
  type RawRow = Record<string, unknown> & {
    corpus_sources?: { source_description?: string | null } | null;
  };
  const patterns: RetrievedPattern[] = (rows as RawRow[]).map((r) => ({
    id: r.id as string,
    donor: (r.donor as string) || null,
    donor_archetype: (r.donor_archetype as string) || null,
    sector: (r.sector as string) || null,
    geography_class: (r.geography_class as string) || null,
    award_size_band: (r.award_size_band as string) || null,
    side_perspective: (r.side_perspective as string) || null,
    engagement_type: (r.engagement_type as string) || null,
    toc_archetype: (r.toc_archetype as string) || null,
    win_archetype: (r.win_archetype as string) || null,
    signaling_phrases: (r.signaling_phrases as string[]) || null,
    intervention_logic: (r.intervention_logic as string) || null,
    structural_notes: (r.structural_notes as string) || null,
    partnership_architecture: (r.partnership_architecture as string) || null,
    source_description: r.corpus_sources?.source_description || null,
  }));

  if (patterns.length === 0) {
    return {
      formatted: '',
      pattern_ids: [],
      total_retrieved: 0,
      retrieval_strategy: 'no_match',
    };
  }

  const heading =
    locale === 'es'
      ? '## Patrones de referencia (extraídos de propuestas anteriores)\n\nLas siguientes plantillas estructurales provienen de propuestas previas reales. Úsalas como inspiración para forma y enfoque, NO copies su lenguaje verbatim. Cada idea generada debe estar adaptada al perfil específico de la empresa.\n'
      : '## Reference patterns (extracted from prior proposals)\n\nThe following structural templates come from real prior proposals. Use them as inspiration for shape and approach, do NOT copy their language verbatim. Each generated idea must be adapted to the specific company profile.\n';

  const formatted =
    heading +
    '\n' +
    patterns.map((p, i) => formatPattern(p, i, locale)).join('\n\n---\n\n') +
    '\n';

  return {
    formatted,
    pattern_ids: patterns.map((p) => p.id),
    total_retrieved: patterns.length,
    retrieval_strategy: strategy,
  };
}

// ============================================================================
// Heuristic to map company profile fields to corpus retrieval parameters
// ============================================================================
//
// The Opportunity Engine's company profile has fields like `sector`,
// `geographies` (array), and others. This translator converts them to the
// corpus-canonical taxonomy (which uses different geography classes and a
// fixed sector enum).
// ============================================================================

const SECTOR_MAP: Record<string, string> = {
  // Pass-through for already-canonical values
  agrifood: 'agrifood',
  cleantech_energy: 'cleantech_energy',
  health_pharma: 'health_pharma',
  infra_mobility: 'infra_mobility',
  digital_tech: 'digital_tech',
  circular_manufacturing: 'circular_manufacturing',
  generalist: 'generalist',
  // Common aliases users might enter
  agriculture: 'agrifood',
  'agri-food': 'agrifood',
  food: 'agrifood',
  renewable: 'cleantech_energy',
  energy: 'cleantech_energy',
  climate: 'cleantech_energy',
  water: 'cleantech_energy',
  health: 'health_pharma',
  pharma: 'health_pharma',
  infrastructure: 'infra_mobility',
  transport: 'infra_mobility',
  mobility: 'infra_mobility',
  digital: 'digital_tech',
  tech: 'digital_tech',
  ai: 'digital_tech',
  circular: 'circular_manufacturing',
  manufacturing: 'circular_manufacturing',
  waste: 'circular_manufacturing',
};

const COUNTRY_TO_GEOCLASS: Record<string, string> = {
  // South Asia
  bangladesh: 'south-asia',
  india: 'south-asia',
  pakistan: 'south-asia',
  'sri lanka': 'south-asia',
  nepal: 'south-asia',
  bhutan: 'south-asia',
  // Southeast Asia
  vietnam: 'sea',
  cambodia: 'sea',
  laos: 'sea',
  thailand: 'sea',
  philippines: 'sea',
  indonesia: 'sea',
  malaysia: 'sea',
  myanmar: 'sea',
  'east timor': 'sea',
  // Sub-Saharan Africa
  ghana: 'sub-saharan-africa',
  nigeria: 'sub-saharan-africa',
  kenya: 'sub-saharan-africa',
  ethiopia: 'sub-saharan-africa',
  tanzania: 'sub-saharan-africa',
  uganda: 'sub-saharan-africa',
  rwanda: 'sub-saharan-africa',
  senegal: 'sub-saharan-africa',
  cameroon: 'sub-saharan-africa',
  'cote divoire': 'sub-saharan-africa',
  liberia: 'sub-saharan-africa',
  mozambique: 'sub-saharan-africa',
  zambia: 'sub-saharan-africa',
  malawi: 'sub-saharan-africa',
  'south africa': 'sub-saharan-africa',
  // LATAM
  mexico: 'latam',
  guatemala: 'latam',
  'el salvador': 'latam',
  honduras: 'latam',
  'costa rica': 'latam',
  panama: 'latam',
  colombia: 'latam',
  peru: 'latam',
  brazil: 'latam',
  argentina: 'latam',
  chile: 'latam',
  'dominican republic': 'latam',
  // MENA
  morocco: 'mena',
  egypt: 'mena',
  tunisia: 'mena',
  jordan: 'mena',
  lebanon: 'mena',
  // Europe
  spain: 'europe',
  portugal: 'europe',
  italy: 'europe',
  france: 'europe',
  germany: 'europe',
  // Default
};

export function profileToRetrievalOptions(profile: {
  sector?: string;
  geographies?: string[];
  donor_focus?: string[];
  locale?: 'en' | 'es';
}): RetrievalOptions {
  const sectorRaw = (profile.sector || '').toLowerCase().trim();
  const sector = SECTOR_MAP[sectorRaw] || (sectorRaw ? 'generalist' : null);

  // Pick the first recognized geography from the geographies array
  let geography: string | null = null;
  if (profile.geographies && profile.geographies.length > 0) {
    for (const g of profile.geographies) {
      const key = g.toLowerCase().trim();
      if (COUNTRY_TO_GEOCLASS[key]) {
        geography = COUNTRY_TO_GEOCLASS[key];
        break;
      }
      // If user provided a geography class directly
      if (
        ['south-asia', 'sea', 'sub-saharan-africa', 'latam', 'mena', 'europe', 'global'].includes(key)
      ) {
        geography = key;
        break;
      }
    }
  }
  if (!geography) geography = 'global';

  return {
    sector,
    geography,
    donor_focus: profile.donor_focus,
    locale: profile.locale ?? 'en',
    limit: 3,
  };
}
