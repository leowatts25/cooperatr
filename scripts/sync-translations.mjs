#!/usr/bin/env node
/**
 * Auto-translates any English keys in app/lib/i18n/translations.ts
 * that are missing from the Spanish block, using the Anthropic API.
 *
 * Runs both via `npm run i18n:sync` locally and as a `prebuild` safety
 * net on Vercel so deploys always ship with a complete Spanish locale.
 *
 * Behavior:
 *  - No missing keys     → no-op, exits 0
 *  - Missing keys + key  → translates and writes file in place
 *  - Missing keys, no key→ logs a warning, exits 0 (build still succeeds)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FILE = resolve(__dirname, '..', 'app/lib/i18n/translations.ts');

const MODEL = 'claude-sonnet-4-5';

// -------- file parsing --------

const content = readFileSync(FILE, 'utf8');

// Regex for translation lines:
//   '<key>': '<value>',
// Handles escaped single quotes in values.
const LINE_RE = /^(\s*)'([^']+)'\s*:\s*'((?:\\.|[^'\\])*)'\s*,\s*$/;

function parseBlock(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = line.match(LINE_RE);
    if (m) map.set(m[2], m[3]);
  }
  return map;
}

function sliceBlock(label) {
  const open = new RegExp(`\\b${label}:\\s*\\{\\s*\\n`, 'm');
  const openMatch = content.match(open);
  if (!openMatch) throw new Error(`Could not find ${label}: { block`);
  const start = openMatch.index + openMatch[0].length;
  // Find the matching closing brace (simple depth counter)
  let depth = 1;
  let i = start;
  while (i < content.length && depth > 0) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return { start, end: i, body: content.slice(start, i) };
}

const enSlice = sliceBlock('en');
const esSlice = sliceBlock('es');
const en = parseBlock(enSlice.body);
const es = parseBlock(esSlice.body);

const missing = [];
for (const [k, v] of en) {
  if (!es.has(k)) missing.push([k, v]);
}

if (missing.length === 0) {
  console.log('[i18n] ✓ Spanish locale is up to date');
  process.exit(0);
}

console.log(`[i18n] ${missing.length} missing Spanish key(s)`);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[i18n] ANTHROPIC_API_KEY not set — skipping auto-translation');
  console.warn('[i18n] Missing keys:', missing.map(([k]) => k).join(', '));
  process.exit(0);
}

// -------- translation --------

const client = new Anthropic();

const prompt = `You are translating UI strings for Cooperatr, an EU development finance platform for Andalusian SMEs. The audience is Spanish business owners and project managers.

Tone: professional, direct, confident. Use tú (informal) not usted. Preserve currency symbols (€, $), em dashes (—), and any placeholder tokens (like {name}, {count}). Keep abbreviations unchanged (EU, CDTI, AECID, USAID, CSDDD, GRI, CSRD, SDG, ESG, LIVE, etc). Match the length and tone of the English original.

Respond ONLY with a valid JSON object mapping each input key to its Spanish translation. No commentary, no markdown, no code fences.

English strings to translate:
${JSON.stringify(Object.fromEntries(missing), null, 2)}`;

const res = await client.messages.create({
  model: MODEL,
  max_tokens: 8000,
  messages: [{ role: 'user', content: prompt }],
});

const raw = res.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('\n');

// Strip any markdown fences or prose, keep the first JSON object
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error('[i18n] Could not extract JSON from Claude response:\n', raw);
  process.exit(1);
}

let translations;
try {
  translations = JSON.parse(jsonMatch[0]);
} catch (err) {
  console.error('[i18n] Invalid JSON from Claude:', err.message);
  console.error(raw);
  process.exit(1);
}

// -------- write back --------

function escapeValue(v) {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Find the last translation line in the es block to preserve indentation
const esLines = esSlice.body.split('\n');
let lastTransIdx = -1;
let indent = '    ';
for (let i = esLines.length - 1; i >= 0; i--) {
  const m = esLines[i].match(LINE_RE);
  if (m) {
    lastTransIdx = i;
    indent = m[1];
    break;
  }
}

if (lastTransIdx === -1) {
  console.error('[i18n] Could not locate insertion point in es block');
  process.exit(1);
}

const newLines = missing
  .map(([k]) => {
    const v = translations[k];
    if (v == null) {
      console.warn(`[i18n] No translation returned for "${k}" — using English`);
      return `${indent}'${k}': '${escapeValue(en.get(k))}', // TODO: translate`;
    }
    return `${indent}'${k}': '${escapeValue(v)}',`;
  });

esLines.splice(lastTransIdx + 1, 0, ...newLines);

const newEsBody = esLines.join('\n');
const newContent =
  content.slice(0, esSlice.start) + newEsBody + content.slice(esSlice.end);

writeFileSync(FILE, newContent);
console.log(`[i18n] ✓ Added ${newLines.length} Spanish translations`);
