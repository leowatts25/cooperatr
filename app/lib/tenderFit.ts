import Anthropic from '@anthropic-ai/sdk';
import { cooperatrProfileBlock, DEAL_BAND } from '@/app/lib/cooperatrProfile';
import type { TenderRow } from '@/app/lib/matcher';

// ============================================================================
// Stage 1 — Tender-fit gate
// ============================================================================
// BEFORE we spend Sonnet calls matching companies, we ask one question per
// tender: does this tender fit Cooperatr at all? Fit is scored against the
// founder's experience/geography and the priority sectors + deal band
// (see cooperatrProfile.ts). This is the gate the old pipeline never had —
// it's why EEA geospatial contracts and DoD/US-domestic procurement leaked
// through and got matched to random companies.
//
// Output is persisted on `tenders` (tender_fit_score, tender_fit_reasons,
// tender_fit_verdict, tender_fit_at). matchTender() reads the score: below the
// floor, it hard-skips company matching and records why.
//
// One cheap call per tender (no candidate loop). The profile block is cached
// ephemerally so it's free across the batch.
// ============================================================================

const client = new Anthropic({ maxRetries: 6 });

// Below this score, a tender is not worth matching companies against. Recorded,
// not silently dropped (operator can audit /admin rejected tenders).
export const TENDER_FIT_FLOOR = 45;

export interface TenderFit {
  fit_score: number;          // 0-100
  sector_fit: number;         // 0.0-1.0
  geography_fit: number;      // 0.0-1.0
  deal_band_fit: number;      // 0.0-1.0
  verdict: 'pursue' | 'maybe' | 'skip';
  reasons: string[];
}

const TENDER_FIT_SYSTEM = `You are Cooperatr's tender-fit screener. Your only job: decide whether an incoming donor/government tender fits Cooperatr's mandate, BEFORE any company matching happens. Be strict — a wrong "fits" wastes downstream effort and surfaces noise to the operator.

${cooperatrProfileBlock()}

Scoring guidance:
- sector_fit (0-1): how squarely the tender's actual scope lands in a priority sector. A keyword brush ("water" in a building-maintenance contract) is low; a genuine water-governance TA is high.
- geography_fit (0-1): where the work is delivered vs. founder reach. EU-funded development work in core/regional/linguistic geographies scores high. EU/US DOMESTIC commercial procurement (a Polish electricity supply, a US VA hospital, a German municipal IT contract) scores near 0 — there is no development-finance angle and it's outside what Cooperatr does. A Spain-based but development-oriented tender scores high.
- deal_band_fit (0-1): tender value vs. the deal band. Sweet spot ~$540k = 1.0; anywhere $50k–$1.1M is strong; $1.1M–$3.25M is partial (needs a consortium); below $50k or above $5M is low. Unknown value = 0.6 (neutral, don't punish missing data).

verdict (keep fit_score and verdict consistent):
- "pursue"  fit_score >= 70 — squarely in our lane: a priority sector, a clear development-finance angle, deliverable geography.
- "maybe"   fit_score 45-69 — a GENUINE development-finance opportunity that is plausible but not core: a non-priority sector, an adjacent scope, or a geography at the edge of founder reach. EU external-action / candidate / neighbourhood / developing-country delivery, or other donor-funded work, belongs here even when the sector isn't core. When torn between "maybe" and "skip" for a real dev-finance tender, choose "maybe" and let the operator judge.
- "skip"    fit_score < 45 — reserve for tenders with NO development-finance angle at all: EU / EFTA / UK / US / other high-income DOMESTIC commercial or facilities procurement (locksmiths, building maintenance, equipment leasing, embassy O&M, municipal IT), or wrong sector AND wrong geography. Do NOT match companies.

KEY BOUNDARY — the test for "skip" is "is there a real development-finance angle?", NOT "is it a core sector?". A legitimate EU-funded / candidate-country / neighbourhood project in a non-core sector (e.g. a hospital-construction TA in Moldova, an EU enlargement transport TA in the Western Balkans) is a "maybe" (~45-60), NOT a "skip". Only the genuinely-irrelevant domestic/commercial procurement should fall below 45.

fit_score is your overall 0-100 judgment, not a mechanical average — a tender that is sector-perfect but pure domestic commercial procurement should still score low because geography/dev-finance fit kills it; conversely, a real dev-finance tender in a soft sector should not be driven below 45 by sector alone.

Output exactly ONE call to emit_tender_fit. No preamble.`;

const tenderFitTool: Anthropic.Tool = {
  name: 'emit_tender_fit',
  description: 'Emit the structured tender-fit assessment for Cooperatr.',
  input_schema: {
    type: 'object',
    properties: {
      fit_score: { type: 'number', minimum: 0, maximum: 100, description: 'Overall 0-100 fit to Cooperatr. Not a mechanical average.' },
      sector_fit: { type: 'number', minimum: 0, maximum: 1 },
      geography_fit: { type: 'number', minimum: 0, maximum: 1 },
      deal_band_fit: { type: 'number', minimum: 0, maximum: 1 },
      verdict: { type: 'string', enum: ['pursue', 'maybe', 'skip'] },
      reasons: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 short concrete reasons. Cite sector token, the delivery geography, the dev-finance angle (or its absence), and where the value sits vs the band.',
      },
    },
    required: ['fit_score', 'sector_fit', 'geography_fit', 'deal_band_fit', 'verdict', 'reasons'],
  },
};

function tenderFitPrompt(t: TenderRow, recentFeedback?: string): string {
  const value =
    t.value_usd_min == null && t.value_usd_max == null
      ? 'unknown'
      : `${t.value_usd_min ?? '?'} – ${t.value_usd_max ?? '?'} USD`;
  const fb = recentFeedback ? `\n\n## Recent operator feedback (recalibration signal)\nThe operator rejected or flagged past matches for these reasons — weight your judgment accordingly:\n${recentFeedback}` : '';
  return `## Tender to screen
Source: ${t.source} (${t.source_ref})
Title: ${t.title || '—'}
Donor: ${t.donor || '—'}
Buyer: ${t.buyer || '—'}
Country: ${t.country || '—'}  (region: ${t.region || '—'})
Sectors (keyword-tagged): ${(t.sectors || []).join(', ') || '—'}
Type: ${t.type || '—'}
Value: ${value}  (deal band: home $${DEAL_BAND.homeMinUsd.toLocaleString()}–$${DEAL_BAND.homeMaxUsd.toLocaleString()}, sweet ~$${DEAL_BAND.sweetSpotUsd.toLocaleString()})

Description:
${(t.description || '').slice(0, 2200)}${fb}

Screen this tender now via emit_tender_fit. No preamble.`;
}

export async function scoreTenderFit(tender: TenderRow, recentFeedback?: string): Promise<TenderFit> {
  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: TENDER_FIT_SYSTEM, cache_control: { type: 'ephemeral' } },
  ];

  const t0 = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: system as Anthropic.Messages.MessageCreateParams['system'],
    tools: [tenderFitTool],
    tool_choice: { type: 'tool', name: 'emit_tender_fit' },
    messages: [{ role: 'user', content: tenderFitPrompt(tender, recentFeedback) }],
  });
  const ms = Date.now() - t0;

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error(`tenderFit returned no tool use (stop=${response.stop_reason})`);
  }
  const out = toolBlock.input as TenderFit;
  console.log(`[tenderFit] ${ms}ms tender=${tender.source_ref} fit=${out.fit_score} verdict=${out.verdict}`);
  return out;
}
