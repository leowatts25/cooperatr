import Anthropic from '@anthropic-ai/sdk';
import { cooperatrProfileBlock } from '@/app/lib/cooperatrProfile';
import type { TenderRow, ScoutedCompanyRow } from '@/app/lib/matcher';

// ============================================================================
// Stage 3 — Opportunity-engine expansion
// ============================================================================
// For a strong (tender × SME) match, don't stop at "this SME could bid". Take
// the tender and expand its impact: who else joins the coalition, which impact
// investors / blended-finance instruments could amplify it, and what the
// bigger play looks like. This is the "opportunity engine" logic the operator
// asked for — turning a single procurement into a structured deal.
//
// Only runs for matches above EXPANSION_SCORE_FLOOR so we don't pay for it on
// weak pairings. Stored on tender_matches.opportunity_expansion.
// ============================================================================

const client = new Anthropic({ maxRetries: 6 });

// Only expand matches that are actually worth pursuing.
export const EXPANSION_SCORE_FLOOR = 65;

export interface OpportunityExpansion {
  consortium_partners: string[];     // named role + archetype, e.g. "local M&E firm in Senegal"
  impact_investors: string[];        // funds / instruments that could amplify
  blended_finance_angle: string;     // one-paragraph thesis
  expanded_impact: string;           // what the bigger play achieves
}

const EXPANSION_SYSTEM = `You are Cooperatr's opportunity engine. Given a tender and an SME that fits it, design how to EXPAND the opportunity beyond a simple bid: the coalition, the capital stack, and the bigger impact play. Be concrete and realistic for a one-person Spain-based intermediary — name partner archetypes and instrument types, not fantasy.

${cooperatrProfileBlock()}

Produce:
- consortium_partners: 2-4 complementary partners the SME needs to win AND to widen impact (role + concrete archetype, e.g. "local water-utility operator in-country", "EU-based prime with NDICI track record", "regional NGO for community engagement").
- impact_investors: 1-3 fund types / named instrument families that could co-finance or scale this (e.g. blended-finance vehicles, DFI windows, foundations active in the sector/region). Prefer real categories the plan references (Global Gateway, NDICI/EFSD+, AECID, AFD, DFC, EIB/EBRD/AfDB/IDB, impact funds).
- blended_finance_angle: one tight paragraph on how grant + concessional + commercial capital could be layered to de-risk and scale.
- expanded_impact: one tight paragraph on the larger outcome if structured as a deal rather than a one-off contract.

Output exactly ONE call to emit_expansion. No preamble.`;

const expansionTool: Anthropic.Tool = {
  name: 'emit_expansion',
  description: 'Emit the structured opportunity-expansion play.',
  input_schema: {
    type: 'object',
    properties: {
      consortium_partners: { type: 'array', items: { type: 'string' } },
      impact_investors: { type: 'array', items: { type: 'string' } },
      blended_finance_angle: { type: 'string' },
      expanded_impact: { type: 'string' },
    },
    required: ['consortium_partners', 'impact_investors', 'blended_finance_angle', 'expanded_impact'],
  },
};

export async function expandOpportunity(
  tender: TenderRow,
  company: ScoutedCompanyRow,
  matchRationale: string,
): Promise<OpportunityExpansion> {
  const value =
    tender.value_usd_min == null && tender.value_usd_max == null
      ? 'unknown'
      : `${tender.value_usd_min ?? '?'} – ${tender.value_usd_max ?? '?'} USD`;

  const prompt = `## Tender
Title: ${tender.title || '—'}
Donor: ${tender.donor || '—'}  Buyer: ${tender.buyer || '—'}
Country: ${tender.country || '—'}  Sectors: ${(tender.sectors || []).join(', ') || '—'}
Value: ${value}
Description: ${(tender.description || '').slice(0, 1400)}

## Anchor SME (already matched)
Name: ${company.name}  (${company.country || '—'})
Sectors: ${(company.sectors || []).join(', ') || '—'}  Size: ${company.size_band || '—'}
Why it fits: ${matchRationale.slice(0, 500)}

Design the expansion now via emit_expansion. No preamble.`;

  const system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [
    { type: 'text', text: EXPANSION_SYSTEM, cache_control: { type: 'ephemeral' } },
  ];

  const t0 = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: system as Anthropic.Messages.MessageCreateParams['system'],
    tools: [expansionTool],
    tool_choice: { type: 'tool', name: 'emit_expansion' },
    messages: [{ role: 'user', content: prompt }],
  });
  const ms = Date.now() - t0;

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error(`expansion returned no tool use (stop=${response.stop_reason})`);
  }
  console.log(`[expansion] ${ms}ms tender=${tender.source_ref} company=${company.name}`);
  return toolBlock.input as OpportunityExpansion;
}
