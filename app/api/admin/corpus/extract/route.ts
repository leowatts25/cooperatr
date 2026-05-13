import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import { checkApprovedUser } from '@/app/lib/auth-check';

const client = new Anthropic();

// Extraction can take time on long documents; bump above the default.
// All Vercel plans default to 300s with Fluid Compute, so this is safe.
export const maxDuration = 120;

// ============================================================================
// Clean-room extractor — distills a proposal into abstract patterns.
//
// LEGAL POSTURE: this endpoint is a one-way transformation. It receives
// source text in the request body, extracts structural abstractions, and
// returns them for human review. The source text is NEVER persisted.
// A SHA-256 hash is computed for dedupe but reveals no content.
//
// The output is NOT auto-saved. It must be reviewed by the admin and then
// posted to /api/admin/corpus to persist as a proposal_pattern row.
// ============================================================================

const SYSTEM_PROMPT = `You are Cooperatr's Clean-Room Extractor. You distill development-proposal documents into ABSTRACT STRUCTURAL PATTERNS for use in a training corpus.

# STRICT EXTRACTION RULES — output is REJECTED if it contains any of:

1. **Verbatim quotes**: NO sequence of 6+ consecutive words copied from the source. Paraphrase in your own voice.
2. **Proper nouns**: NO organization names, person names, project titles, branded methodology names, specific subcontractor names, named beneficiary groups. Geography stays at the regional class level (sub-saharan-africa, latam, mena, sea, europe, global) — never country, city, or site.
3. **Absolute figures**: NO specific budget amounts, indirect rates, headcounts, beneficiary counts, or results figures. Use ratios (0.0-1.0) and bands only.
4. **Source narratives**: NO beneficiary stories, case-study anecdotes, or specific results narratives, even paraphrased.
5. **Strategic win themes**: NO RFP-specific positioning language. Only generic donor-valued concepts.
6. **Branded/proprietary methodologies**: If the source references "the [X] Framework" or similar branded methodology, do NOT extract it. Substitute the closest public framework if one exists.

# WHAT YOU MAY EXTRACT (these are patterns, facts, or public standards):

- Section structure and length ratios
- Public methodology archetypes (logframe, theory-of-change archetypes, DCED standards)
- Standard public indicator IDs (SDG-X.Y.Z, DCED-X.Y)
- Budget category RATIOS (never absolutes)
- Donor evaluation themes the proposal emphasizes (generic concepts, not source phrases)
- Compliance framework section references (CSDDD-art-5, HRDD-UNGP, GDPR, IFC-PS-N)
- Abstract win/failure archetypes in your OWN words

# SELF-ATTESTATION

After extraction, you must honestly self-attest three guardrails:
- contains_proper_nouns: did you include any proper noun beyond geography_class?
- contains_verbatim_quotes: did you copy any 6+ word sequence?
- contains_absolute_figures: did you include any absolute financial figures (vs. ratios)?

ALL THREE MUST BE FALSE. If any cannot be false, omit that field rather than including the violating content.

Output via the emit_pattern tool. Be ruthless about leaving fields null when you can't fill them safely.`;

const extractTool: Anthropic.Tool = {
  name: 'emit_pattern',
  description: 'Emit the extracted structural pattern. Abstractions only. NO verbatim quotes, proper nouns, or absolute figures.',
  input_schema: {
    type: 'object',
    properties: {
      donor: {
        type: 'string',
        description: 'Donor identifier — e.g. AECID, EU-NDICI, EU-Global-Gateway, USAID, World-Bank, IDB, AfDB. Use the donor abbreviation form.',
      },
      sector: {
        type: 'string',
        enum: ['agrifood', 'cleantech_energy', 'health_pharma', 'infra_mobility', 'digital_tech', 'circular_manufacturing', 'generalist'],
      },
      geography_class: {
        type: 'string',
        enum: ['sub-saharan-africa', 'latam', 'mena', 'sea', 'europe', 'global'],
        description: 'Regional class only. NEVER a specific country if it would identify the project.',
      },
      award_size_band: {
        type: 'string',
        enum: ['sub-1M', '1-5M', '5-20M', '20M+'],
        description: 'Award size BAND, not absolute value.',
      },
      section_inventory: {
        type: 'array',
        description: 'Section structure of the proposal. Generic section names, page counts, and weight as % of total proposal.',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            pages: { type: 'number' },
            weight_pct: { type: 'number' },
          },
          required: ['section'],
        },
      },
      toc_archetype: {
        type: 'string',
        enum: ['pilot-scale', 'capacity-then-impact', 'platform-aggregator', 'consortium-led', 'evidence-then-policy', 'other'],
        description: 'Theory-of-change archetype.',
      },
      m_and_e_framework: {
        type: 'string',
        enum: ['logframe', 'mel-plan', 'results-chain', 'dced', 'other'],
      },
      indicator_set_refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'PUBLIC indicator IDs only (e.g. SDG-8.3.1, DCED-1.2). No proprietary names.',
      },
      budget_ratios: {
        type: 'object',
        description: 'Budget category ratios as decimals (0.0-1.0). Suggested keys: personnel, travel, subgrants, equipment, indirect, other. RATIOS ONLY.',
        properties: {
          personnel: { type: 'number' },
          travel: { type: 'number' },
          subgrants: { type: 'number' },
          equipment: { type: 'number' },
          indirect: { type: 'number' },
          other: { type: 'number' },
        },
      },
      evaluation_dimensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Generic evaluation themes the proposal emphasizes (e.g. "cost realism", "sustainability", "local ownership", "gender mainstreaming"). 3-7 items.',
      },
      signaling_phrases: {
        type: 'array',
        items: { type: 'string' },
        description: 'Generic donor-valued CONCEPTS — never verbatim sentences. Max 6 words each. e.g. "sustainability beyond program end", "local-partner co-design", "evidence-based scaling". 3-10 items.',
      },
      win_archetype: {
        type: 'string',
        description: 'ONE sentence in YOUR own words describing why this approach tends to win. No proper nouns, no numbers, no source quotes. Max 35 words.',
      },
      failure_archetype: {
        type: 'string',
        description: 'Only if outcome=lost. Why this pattern tends to fail. Your own words. Max 35 words.',
      },
      compliance_sections_required: {
        type: 'array',
        items: { type: 'string' },
        description: 'Compliance framework section references (CSDDD-art-5, HRDD-UNGP, GDPR, IFC-PS-1, EIB-ESSF, etc.).',
      },
      structural_notes: {
        type: 'string',
        description: 'Free-form structural observations IN YOUR OWN WORDS. Max 200 words. NO verbatim quotes longer than 6 consecutive words. NO proper nouns. NO absolute financial figures.',
      },
      contains_proper_nouns: {
        type: 'boolean',
        description: 'Self-check: did you include ANY proper noun beyond geography_class? Must be false.',
      },
      contains_verbatim_quotes: {
        type: 'boolean',
        description: 'Self-check: did you copy ANY 6+ word sequence from the source? Must be false.',
      },
      contains_absolute_figures: {
        type: 'boolean',
        description: 'Self-check: did you include ANY absolute financial figures (vs. ratios)? Must be false.',
      },
    },
    required: [
      'donor',
      'sector',
      'win_archetype',
      'structural_notes',
      'contains_proper_nouns',
      'contains_verbatim_quotes',
      'contains_absolute_figures',
    ],
  },
};

// ============================================================================
// Server-side guardrails — verify the model's self-attestation independently.
// ============================================================================
//
// Models will sometimes leak source content despite instructions, and they'll
// sometimes attest "no violations" when there are. So we don't trust the
// self-attestation alone; we run regex screens server-side on every text
// field that could leak source content.
// ============================================================================

type ExtractedPattern = {
  donor: string;
  sector: string;
  geography_class?: string;
  award_size_band?: string;
  section_inventory?: Array<{ section: string; pages?: number; weight_pct?: number }>;
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
  contains_proper_nouns: boolean;
  contains_verbatim_quotes: boolean;
  contains_absolute_figures: boolean;
};

type GuardrailReport = {
  flag_proper_nouns: boolean;
  flag_verbatim_quotes: boolean;
  flag_absolute_figures: boolean;
  flag_notes: string;
};

function runGuardrails(
  pattern: ExtractedPattern,
  sourceText: string,
): GuardrailReport {
  const notes: string[] = [];
  let flagProperNouns = false;
  let flagVerbatimQuotes = false;
  let flagAbsoluteFigures = false;

  // Concatenate every free-text field for screening
  const freeTextFields = [
    pattern.win_archetype || '',
    pattern.failure_archetype || '',
    pattern.structural_notes || '',
    ...(pattern.signaling_phrases || []),
    ...(pattern.evaluation_dimensions || []),
  ].join('\n');

  // --- Absolute figures: $X,XXX or EUR X,XXX or 1,234,567 etc.
  // Allow decimals between 0 and 1 (ratios) and small integers (page counts).
  const currencyPattern = /(?:\$|€|EUR|USD|GBP|£)\s*\d{1,3}(?:[,.]\d{3})+/i;
  const largeNumberPattern = /\b\d{1,3}(?:[,.]\d{3}){1,}\b/;
  if (currencyPattern.test(freeTextFields) || largeNumberPattern.test(freeTextFields)) {
    flagAbsoluteFigures = true;
    notes.push('Absolute-figure pattern detected in free text (currency or comma-separated thousands).');
  }

  // --- Verbatim quote detection: check for any 8-word sequence from
  // structural_notes / win_archetype that appears verbatim in source.
  // (Threshold 8 to allow common phrases like "monitoring evaluation and learning plan".)
  if (sourceText && (pattern.structural_notes || pattern.win_archetype)) {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const normSource = normalize(sourceText);
    const candidate = normalize(`${pattern.structural_notes || ''} ${pattern.win_archetype || ''}`);
    const words = candidate.split(' ').filter(Boolean);
    for (let i = 0; i + 8 <= words.length; i++) {
      const window = words.slice(i, i + 8).join(' ');
      if (window.length > 30 && normSource.includes(window)) {
        flagVerbatimQuotes = true;
        notes.push(`Possible verbatim sequence detected: "${window.slice(0, 60)}..."`);
        break;
      }
    }
  }

  // --- Proper-noun heuristic: capitalized multi-word sequences in free text
  // that are NOT in a known-safe vocabulary (acronyms, framework names we allow).
  const safeTerms = new Set([
    'SDG', 'DCED', 'OECD', 'GDPR', 'CSDDD', 'HRDD', 'UNGP', 'IFC', 'EIB', 'EBRD',
    'AECID', 'AfDB', 'NDICI', 'CBAM', 'EFSD', 'ESG', 'AI', 'EU', 'US', 'MENA',
    'LATAM', 'SEA', 'OEPM', 'KPI', 'RFP', 'PPP', 'CV', 'NGO', 'SME', 'DFI',
    'TOC', 'MEL', 'EPC', 'O&M', 'I&D', 'ISO', 'CO2', 'WHO', 'UNICEF', 'UNDP',
    'WFP', 'UNOPS', 'PQ', 'SRA', 'CEPI', 'EDCTP', 'GMP', 'PIDG', 'AIIB',
    'GrCF2', 'D4D', 'DPI', 'DPGA', 'CAP', 'AfCFTA',
  ]);
  const properNounRegex = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,})\b/g;
  const matches = [...freeTextFields.matchAll(properNounRegex)];
  const suspicious = matches
    .map((m) => m[1])
    .filter((nm) => !nm.split(' ').every((w) => safeTerms.has(w.toUpperCase())))
    .slice(0, 5);
  if (suspicious.length > 0) {
    flagProperNouns = true;
    notes.push(`Possible proper-noun sequences: ${suspicious.join(', ')}`);
  }

  // --- Cross-check the model's self-attestation
  if (pattern.contains_proper_nouns && !flagProperNouns) {
    flagProperNouns = true;
    notes.push('Model self-attested proper-noun violation.');
  }
  if (pattern.contains_verbatim_quotes && !flagVerbatimQuotes) {
    flagVerbatimQuotes = true;
    notes.push('Model self-attested verbatim-quote violation.');
  }
  if (pattern.contains_absolute_figures && !flagAbsoluteFigures) {
    flagAbsoluteFigures = true;
    notes.push('Model self-attested absolute-figures violation.');
  }

  return {
    flag_proper_nouns: flagProperNouns,
    flag_verbatim_quotes: flagVerbatimQuotes,
    flag_absolute_figures: flagAbsoluteFigures,
    flag_notes: notes.join(' | '),
  };
}

// ============================================================================
// POST — extract a pattern from pasted source text
// ============================================================================
//
// Request body:
//   {
//     source_text: string,              // raw proposal text (will be discarded)
//     hints?: {                         // admin-provided classification hints
//       donor?: string,
//       sector?: string,
//       geography_class?: string,
//       award_size_band?: string,
//       outcome?: 'won' | 'lost' | 'shortlisted' | 'unknown',
//       year?: number,
//       source_description?: string,
//     }
//   }
//
// Response: { pattern, guardrails, source_hash }
//   - pattern: extracted abstractions (NOT yet persisted)
//   - guardrails: server-side screen results
//   - source_hash: SHA-256 of normalized source (for dedupe; reveals no content)
//
// To persist: POST /api/admin/corpus with the reviewed pattern + hints.
// ============================================================================

export async function POST(req: NextRequest) {
  // Admin auth gate — corpus is admin-only at all stages
  const auth = await checkApprovedUser(req);
  if (!auth.authorized) return auth.response!;

  let body: { source_text?: string; hints?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sourceText = (body.source_text || '').trim();
  const hints = body.hints || {};

  if (!sourceText) {
    return NextResponse.json(
      { error: 'source_text is required' },
      { status: 400 },
    );
  }

  // Reject obviously oversized inputs (Sonnet 200k context ≈ ~800k chars,
  // but extraction quality drops on very long inputs and we want a hard
  // ceiling for now. Chunked extraction comes later.)
  const MAX_SOURCE_CHARS = 250_000;
  if (sourceText.length > MAX_SOURCE_CHARS) {
    return NextResponse.json(
      {
        error: `source_text exceeds ${MAX_SOURCE_CHARS} chars. Split the proposal by section and extract each separately.`,
      },
      { status: 413 },
    );
  }

  // Hash for dedupe / audit. Hash reveals no content.
  const sourceHash = crypto
    .createHash('sha256')
    .update(sourceText.toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex');

  // Build the extraction prompt. Hints are passed in-context but the model
  // can override if the source contradicts them.
  const userPrompt = `## Admin classification hints (model may refine)
${JSON.stringify(hints, null, 2)}

## Source text (extract abstractions ONLY — never persisted)
<source>
${sourceText}
</source>

Extract the structural pattern. Remember the strict rules: no verbatim 6+ word sequences, no proper nouns beyond geography_class, no absolute financial figures, no source narratives. Use the emit_pattern tool.`;

  const t0 = Date.now();
  console.log('[corpus:extract] calling Sonnet...');

  let response;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      // Prompt caching on the system block — the system prompt + tool schema
      // are stable across many extractions, so cache them.
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [extractTool],
      tool_choice: { type: 'tool', name: 'emit_pattern' },
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[corpus:extract] anthropic error:', msg);
    return NextResponse.json(
      { error: `Extraction failed: ${msg}` },
      { status: 502 },
    );
  }

  console.log(
    `[corpus:extract] responded in ${Date.now() - t0}ms, stop=${response.stop_reason}, out=${response.usage?.output_tokens}`,
  );

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    return NextResponse.json(
      { error: 'Model returned no tool_use block', stop_reason: response.stop_reason },
      { status: 502 },
    );
  }

  const pattern = toolBlock.input as ExtractedPattern;
  const guardrails = runGuardrails(pattern, sourceText);

  return NextResponse.json({
    pattern,
    guardrails,
    source_hash: sourceHash,
    usage: {
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens,
      cache_creation_input_tokens: response.usage?.cache_creation_input_tokens,
    },
  });
}
