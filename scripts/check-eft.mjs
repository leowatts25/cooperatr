// Live validation of the EU F&T (SEDIA) fixes — no API key needed.
// Mirrors fetchEftNotices() in app/lib/ingesters/eftportal.ts exactly, then
// applies the new client-side filter predicate to confirm forthcoming/open
// dev-finance calls survive (the bug was 0 survivors).

const SEDIA_SEARCH_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';

function pickMeta(meta, key) {
  const v = meta?.[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  if (v == null) return undefined;
  return String(v);
}

async function fetchPage(searchText, pageSize, pageNum) {
  const params = new URLSearchParams({
    apiKey: 'SEDIA',
    text: searchText,
    pageSize: String(pageSize),
    pageNumber: String(pageNum),
    sortBy: 'startDate',
    sortOrder: 'DESC',
  });
  const res = await fetch(`${SEDIA_SEARCH_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'cooperatr-bd-scanner/0.1 (+https://cooperatr.com)',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`SEDIA ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  if (json.type === 'businessError') throw new Error(`business error: ${json.message}`);
  return Array.isArray(json.results) ? json.results : [];
}

const queries = ['NEAR IPA development cooperation', 'INTPA development cooperation aid'];
const now = new Date();

for (const q of queries) {
  try {
    const results = await fetchPage(q, 50, 1);
    let passed = 0;
    const samples = [];
    for (const r of results) {
      const meta = r.metadata ?? {};
      const typeVal = pickMeta(meta, 'type');
      const sortStatus = pickMeta(meta, 'sortStatus');
      const deadlineStr = pickMeta(meta, 'deadlineDate');
      if (typeVal !== '0' && typeVal !== '2') continue;
      if (sortStatus !== '1' && sortStatus !== '2') continue;
      if (deadlineStr) { const d = new Date(deadlineStr); if (!isNaN(d.getTime()) && d < now) continue; }
      passed++;
      if (samples.length < 4) {
        samples.push({
          id: pickMeta(meta, 'callIdentifier') ?? pickMeta(meta, 'identifier') ?? r.reference,
          status: sortStatus, type: typeVal, deadline: deadlineStr,
          title: (pickMeta(meta, 'title') ?? r.title ?? '').slice(0, 70),
        });
      }
    }
    console.log(`\nquery="${q}"  raw=${results.length}  passed_filter=${passed}`);
    for (const s of samples) console.log('  •', JSON.stringify(s));
  } catch (e) {
    console.log(`\nquery="${q}"  ERROR: ${e.message}`);
  }
}
