// ============================================================================
// AECID ingester — Spanish development-cooperation grant calls (via BDNS)
// ============================================================================
// AECID (Agencia Española de Cooperación Internacional para el Desarrollo) runs
// its actual development-finance instruments as *subvenciones* (grant calls),
// not as PLACSP procurement. Those live in the BDNS (Base de Datos Nacional de
// Subvenciones) with a clean public JSON API — far more relevant to a dev-
// finance BD platform than AECID's office procurement, and reachable without
// the FNMT-cert issues that plague PLACSP.
//
// Strategy: query BDNS convocatorias by the agency name (high-precision, ~tens
// of results) AND by the broad theme, merge, then keep only rows whose granting
// body (organo.nivel3) is AECID. Enrich the most recent N with the detail
// endpoint (budget, deadline, regions, bases reguladoras) and upsert.
//
// Search:  GET /api/convocatorias/busqueda?descripcion=...&order=fechaRecepcion&direccion=desc
// Detail:  GET /api/convocatorias?numConv=<numeroConvocatoria>
// Tagged market='intl_dev' — AECID feeds the international-development universe.
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';

type Supabase = ReturnType<typeof createServerClient>;

const API = 'https://www.infosubvenciones.es/bdnstrans/api';
// AECID's granting body always appears at this level of the BDNS org hierarchy.
const AECID_NIVEL3 = 'COOPERACIÓN INTERNACIONAL PARA EL DESARROLLO';
// Two complementary search terms: the agency name (precise) and the theme
// (catches AECID calls whose title omits the full agency name). The nivel3
// filter below removes every non-AECID body the theme query pulls in.
const QUERIES = [
  'Agencia Española de Cooperación Internacional para el Desarrollo',
  'cooperación internacional para el desarrollo',
];

interface SearchRow {
  id: number;
  numeroConvocatoria: string;
  descripcion: string | null;
  fechaRecepcion: string | null;
  nivel1?: string | null;
  nivel2?: string | null;
  nivel3?: string | null;
}

interface Detail {
  id: number;
  codigoBDNS?: string;
  organo?: { nivel1?: string; nivel2?: string; nivel3?: string };
  descripcion?: string | null;
  descripcionFinalidad?: string | null;
  tipoConvocatoria?: string | null;
  presupuestoTotal?: number | null;
  abierto?: boolean;
  sedeElectronica?: string | null;
  urlBasesReguladoras?: string | null;
  fechaRecepcion?: string | null;
  fechaInicioSolicitud?: string | null;
  fechaFinSolicitud?: string | null;
  instrumentos?: { descripcion?: string }[];
  tiposBeneficiarios?: { descripcion?: string }[];
  regiones?: { descripcion?: string }[];
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`BDNS ${res.status} for ${url.slice(0, 90)}`);
  return res.json();
}

async function search(term: string, pageSize: number, maxPages: number): Promise<SearchRow[]> {
  const rows: SearchRow[] = [];
  for (let page = 0; page < maxPages; page++) {
    const url = `${API}/convocatorias/busqueda?page=${page}&pageSize=${pageSize}`
      + `&order=fechaRecepcion&direccion=desc&descripcion=${encodeURIComponent(term)}`;
    const json = (await getJson(url)) as { content?: SearchRow[]; totalElements?: number };
    const content = json.content || [];
    rows.push(...content);
    if (content.length < pageSize) break; // last page
  }
  return rows;
}

async function fetchDetail(numConv: string): Promise<Detail | null> {
  try {
    return (await getJson(`${API}/convocatorias?numConv=${encodeURIComponent(numConv)}`)) as Detail;
  } catch {
    return null;
  }
}

// Run async mapper over items with a bounded concurrency (be polite to BDNS).
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

function isAecid(nivel3: string | null | undefined): boolean {
  return !!nivel3 && nivel3.toUpperCase().includes(AECID_NIVEL3);
}

function buildDescription(d: Detail, fallbackTitle: string): string {
  const parts: string[] = [];
  parts.push('AECID development-cooperation grant call (Spain, BDNS).');
  if (d.descripcionFinalidad) parts.push(`Finalidad: ${d.descripcionFinalidad}.`);
  if (d.tipoConvocatoria) parts.push(`Tipo: ${d.tipoConvocatoria}.`);
  const instr = (d.instrumentos || []).map((x) => x.descripcion?.trim()).filter(Boolean);
  if (instr.length) parts.push(`Instrumento: ${instr.join(', ')}.`);
  const benef = (d.tiposBeneficiarios || []).map((x) => x.descripcion?.trim()).filter(Boolean);
  if (benef.length) parts.push(`Beneficiarios: ${benef.join('; ')}.`);
  const regs = (d.regiones || []).map((x) => x.descripcion?.trim()).filter(Boolean);
  if (regs.length) parts.push(`Regiones: ${regs.join('; ')}.`);
  if (typeof d.presupuestoTotal === 'number') parts.push(`Presupuesto: €${d.presupuestoTotal.toLocaleString('es-ES')}.`);
  if (d.urlBasesReguladoras) parts.push(`Bases reguladoras: ${d.urlBasesReguladoras}`);
  parts.push(d.abierto ? 'Estado: abierto.' : 'Estado: cerrado / pendiente.');
  return parts.join(' ') || fallbackTitle;
}

function regionField(d: Detail): string | null {
  const regs = (d.regiones || []).map((x) => x.descripcion?.trim()).filter(Boolean);
  return regs.length ? regs.join('; ') : null;
}

export interface AecidResult {
  fetched: number;
  upserted: number;
  errors: string[];
}

export async function ingestAecid(
  supabase: Supabase,
  opts?: { pageSize?: number; maxPages?: number; maxDetails?: number; concurrency?: number },
): Promise<AecidResult> {
  const pageSize = opts?.pageSize ?? 50;
  const maxPages = opts?.maxPages ?? 3;
  const maxDetails = opts?.maxDetails ?? 40;
  const concurrency = opts?.concurrency ?? 5;
  const errors: string[] = [];

  // 1. Search + merge across query terms, dedup by numeroConvocatoria.
  const byNum = new Map<string, SearchRow>();
  for (const term of QUERIES) {
    try {
      for (const r of await search(term, pageSize, maxPages)) {
        if (r.numeroConvocatoria && isAecid(r.nivel3)) byNum.set(r.numeroConvocatoria, r);
      }
    } catch (err) {
      errors.push(`search "${term.slice(0, 30)}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Most-recent first, cap the number we enrich with a detail fetch.
  const candidates = [...byNum.values()]
    .sort((a, b) => (b.fechaRecepcion || '').localeCompare(a.fechaRecepcion || ''))
    .slice(0, maxDetails);
  if (candidates.length === 0) return { fetched: 0, upserted: 0, errors };

  // 3. Enrich (bounded concurrency). Missing detail → fall back to search row.
  const details = await mapPool(candidates, concurrency, (c) => fetchDetail(c.numeroConvocatoria));

  const now = new Date().toISOString();
  const rows = candidates.map((c, idx) => {
    const d = details[idx] || ({} as Detail);
    // Guard: if the enriched org disagrees, still trust the search-row filter.
    const buyer = d.organo?.nivel3 || c.nivel3 || 'AECID';
    const title = (d.descripcion || c.descripcion || `AECID convocatoria ${c.numeroConvocatoria}`).trim();
    return {
      source: 'AECID_BDNS',
      source_ref: c.numeroConvocatoria,
      url: `https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/${c.numeroConvocatoria}`,
      title,
      description: buildDescription(d, title),
      donor: 'AECID',
      buyer,
      country: 'Spain',
      region: regionField(d),
      sectors: [] as string[],
      type: 'grant',
      market: 'intl_dev',
      value_usd_min: null as number | null,
      value_usd_max: typeof d.presupuestoTotal === 'number' ? d.presupuestoTotal : null,
      currency: 'EUR',
      published_at: c.fechaRecepcion || d.fechaRecepcion || null,
      deadline_at: d.fechaFinSolicitud || null,
      passes_filter: true,
      filter_reasons: ['aecid:bdns', d.tipoConvocatoria || 'subvención', d.abierto ? 'abierto' : 'cerrado'].filter(Boolean),
      updated_at: now,
    };
  });

  const { error, count } = await supabase
    .from('tenders')
    .upsert(rows, { onConflict: 'source,source_ref', count: 'exact' });
  if (error) { errors.push(`upsert: ${error.message}`); return { fetched: rows.length, upserted: 0, errors }; }

  return { fetched: rows.length, upserted: count ?? rows.length, errors };
}
