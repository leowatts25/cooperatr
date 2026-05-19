// ============================================================================
// Lightweight in-ingester filter — sector match + value range + freshness
// ============================================================================
// Used to decide whether a freshly fetched tender deserves to enter the
// matcher pipeline. This is *not* the scoring step (that's LLM-driven and
// runs later); it's a cheap pre-screen so we don't pay for a Claude call
// on tenders that are obviously irrelevant.
//
// Rule of thumb: be generous here. The matcher does the real thinking.
// ============================================================================

export interface SectorRow {
  slug: string;
  label: string;
  keywords: string[];
}

export interface FilterResult {
  passes: boolean;
  matchedSectors: string[];
  reasons: string[];
}

// User-defined cooperatr criteria (Leo's answers in chat).
export const VALUE_USD_FLOOR = 20_000;      // tiny TA contracts welcome
export const VALUE_USD_CEILING = 5_000_000; // filters out big-prime deals we can't lead

// Geographies in scope: EU (all 27), DR, USA, plus any project country surfaced
// by the tender itself. Effectively: never filter out by geography in v1.

export function matchSectors(text: string, sectors: SectorRow[]): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const s of sectors) {
    for (const kw of s.keywords) {
      // Word-boundary match for short keywords; substring otherwise.
      const k = kw.toLowerCase().trim();
      if (!k) continue;
      const found = k.length <= 4
        ? new RegExp(`\\b${escapeRegex(k)}\\b`).test(lower)
        : lower.includes(k);
      if (found) { hits.add(s.slug); break; }
    }
  }
  return Array.from(hits);
}

export function valueInRange(min: number | null, max: number | null): {
  inRange: boolean;
  reason: string;
} {
  // If we can't read the value, let it pass — the matcher will check.
  if (min == null && max == null) {
    return { inRange: true, reason: 'value:unknown' };
  }
  const effectiveMax = max ?? min ?? 0;
  const effectiveMin = min ?? max ?? 0;
  if (effectiveMax < VALUE_USD_FLOOR) {
    return { inRange: false, reason: `value:below_floor(${effectiveMax})` };
  }
  if (effectiveMin > VALUE_USD_CEILING) {
    return { inRange: false, reason: `value:above_ceiling(${effectiveMin})` };
  }
  return { inRange: true, reason: 'value:in_range' };
}

export function applyFilter(
  candidate: { title?: string | null; description?: string | null; value_usd_min?: number | null; value_usd_max?: number | null },
  sectors: SectorRow[],
): FilterResult {
  const text = [candidate.title || '', candidate.description || ''].join(' ');
  const matched = matchSectors(text, sectors);
  const value = valueInRange(candidate.value_usd_min ?? null, candidate.value_usd_max ?? null);

  const reasons: string[] = [];
  if (matched.length > 0) {
    reasons.push(...matched.map((s) => `sector:${s}`));
  } else {
    reasons.push('sector:none_matched');
  }
  reasons.push(value.reason);

  // Pass if (a) at least one sector matched AND (b) value range is acceptable.
  // We allow sector-less tenders through too (with a flag) so a human can
  // spot-check what we're missing.
  const passes = value.inRange;

  return { passes, matchedSectors: matched, reasons };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
