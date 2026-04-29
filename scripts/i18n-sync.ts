/**
 * i18n auto-sync
 *
 * Reads `translations.ts`, finds keys that exist in the source locale (en)
 * but are missing or empty in target locales, translates them via MyMemory
 * (free), and writes them back into `translations.ts` while preserving
 * formatting and any `// @manual` overrides.
 *
 * Usage:
 *   npm run i18n:sync
 *   npm run i18n:sync -- --check   (dry run, exits 1 if missing translations)
 *   I18N_EMAIL=you@example.com npm run i18n:sync   (raises daily quota)
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { i18nConfig, type TargetLocale } from './i18n.config';

type Locale = 'en' | TargetLocale;
type LocaleBlock = {
  start: number;       // index into source where this locale block opens
  end: number;         // index where the closing `}` of the block sits
  bodyStart: number;   // first char after the opening `{`
  bodyEnd: number;     // last char before the closing `}`
  body: string;
};

interface ParsedKey {
  key: string;
  value: string;
  manual: boolean;
  rawLine: string;       // exact original line including leading indent + trailing comma
  insertionAfter: number; // char index in body where this key entry ends
}

const ROOT = resolve(__dirname, '..');
const TRANSLATIONS_FILE = resolve(ROOT, i18nConfig.translationsPath);

function locateLocaleBlock(src: string, locale: Locale): LocaleBlock {
  const re = new RegExp(`(^|\\n)\\s*${locale}\\s*:\\s*{`);
  const match = re.exec(src);
  if (!match) throw new Error(`Could not find locale block for "${locale}"`);
  const start = match.index + match[0].lastIndexOf(locale);
  const bodyStart = src.indexOf('{', start) + 1;
  // walk braces to find matching close
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) throw new Error(`Unbalanced braces in "${locale}" block`);
  const bodyEnd = i;
  return { start, end: bodyEnd, bodyStart, bodyEnd, body: src.slice(bodyStart, bodyEnd) };
}

/**
 * Parse keys from a locale block body. Handles single-line entries of the form:
 *   'key.name': 'value', // optional comment, may include @manual
 */
function parseKeys(body: string): Map<string, ParsedKey> {
  const map = new Map<string, ParsedKey>();
  // Match a translation entry. Supports single- and double-quoted keys/values,
  // and escapes inside the value. Captures trailing comment on same line.
  const lineRe = /(^[ \t]*)(['"])([^'"\n]+?)\2\s*:\s*(['"])((?:\\\4|(?!\4).)*?)\4\s*,?[ \t]*(\/\/[^\n]*)?$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(body)) !== null) {
    const [raw, , , key, , value, comment] = m;
    const manual = !!comment && /@manual\b/.test(comment);
    map.set(key, {
      key,
      value: unescape(value),
      manual,
      rawLine: raw,
      insertionAfter: m.index + raw.length,
    });
  }
  return map;
}

function unescape(s: string): string {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function escapeForSingleQuote(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function translateMyMemory(text: string, source: string, target: string): Promise<string> {
  const params = new URLSearchParams({ q: text, langpair: `${source}|${target}` });
  if (i18nConfig.email) params.set('de', i18nConfig.email);
  const url = `https://api.mymemory.translated.net/get?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
  };
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error(`MyMemory returned no translation for "${text}"`);
  // MyMemory sometimes echoes back with HTML entities in unexpected places — decode lightly
  return translated
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface SyncReport {
  locale: string;
  added: number;
  skippedManual: number;
  failed: { key: string; reason: string }[];
}

async function syncLocale(src: string, locale: TargetLocale, dryRun: boolean): Promise<{ src: string; report: SyncReport }> {
  const enBlock = locateLocaleBlock(src, 'en');
  const targetBlock = locateLocaleBlock(src, locale);
  const enKeys = parseKeys(enBlock.body);
  const targetKeys = parseKeys(targetBlock.body);

  const missing: ParsedKey[] = [];
  const report: SyncReport = { locale, added: 0, skippedManual: 0, failed: [] };

  for (const enKey of enKeys.values()) {
    const existing = targetKeys.get(enKey.key);
    if (existing) {
      if (existing.manual) report.skippedManual++;
      continue; // already translated (or manually overridden)
    }
    missing.push(enKey);
  }

  if (missing.length === 0) {
    return { src, report };
  }

  console.log(`[${locale}] ${missing.length} keys missing, translating…`);

  if (dryRun) {
    report.failed = missing.map(k => ({ key: k.key, reason: 'missing (dry run)' }));
    return { src, report };
  }

  // Translate
  const translatedEntries: { key: string; value: string }[] = [];
  for (const k of missing) {
    try {
      const translated = await translateMyMemory(k.value, 'en', locale);
      translatedEntries.push({ key: k.key, value: translated });
      report.added++;
      console.log(`  ✓ ${k.key} → ${translated.slice(0, 60)}${translated.length > 60 ? '…' : ''}`);
      await sleep(i18nConfig.rateLimitMs);
    } catch (err) {
      report.failed.push({ key: k.key, reason: err instanceof Error ? err.message : String(err) });
      console.warn(`  ✗ ${k.key}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Insert translated entries into target block, just before its closing `}`.
  // We append them as a contiguous block, indented to match the existing style.
  const indentMatch = targetBlock.body.match(/^[ \t]+(?=['"])/m);
  const indent = indentMatch ? indentMatch[0] : '    ';
  const newLines = translatedEntries
    .map(e => `${indent}'${escapeForSingleQuote(e.key)}': '${escapeForSingleQuote(e.value)}',`)
    .join('\n');
  if (translatedEntries.length === 0) {
    return { src, report };
  }

  // Strip trailing whitespace from current body; append new lines + newline + body's prior trailing space.
  const newBody = `${targetBlock.body.replace(/\s*$/, '')}\n\n${indent}// Auto-translated by i18n-sync\n${newLines}\n  `;
  const updated = src.slice(0, targetBlock.bodyStart) + newBody + src.slice(targetBlock.bodyEnd);
  return { src: updated, report };
}

async function main() {
  const dryRun = process.argv.includes('--check');
  const original = readFileSync(TRANSLATIONS_FILE, 'utf8');
  let src = original;

  const reports: SyncReport[] = [];
  for (const locale of i18nConfig.targetLocales) {
    const { src: nextSrc, report } = await syncLocale(src, locale, dryRun);
    src = nextSrc;
    reports.push(report);
  }

  if (!dryRun && src !== original) {
    writeFileSync(TRANSLATIONS_FILE, src, 'utf8');
    console.log(`\nWrote updated translations to ${i18nConfig.translationsPath}`);
  }

  // Summary
  console.log('\n=== i18n sync summary ===');
  let anyMissing = false;
  for (const r of reports) {
    console.log(`[${r.locale}] added=${r.added}, manual_skipped=${r.skippedManual}, failed=${r.failed.length}`);
    if (r.failed.length) anyMissing = true;
    for (const f of r.failed) console.log(`  - ${f.key}: ${f.reason}`);
  }

  if (dryRun && anyMissing) {
    console.error('\n[i18n:check] FAIL: missing translations detected.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
