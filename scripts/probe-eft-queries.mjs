const ENDPOINT = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
const now = new Date();
function pickMeta(meta, key) {
  const v = meta?.[key];
  if (Array.isArray(v)) return v.length ? String(v[0]) : undefined;
  if (v == null) return undefined;
  return String(v);
}
async function page(text, pageNumber, sortBy) {
  const p = new URLSearchParams({ apiKey: 'SEDIA', text, pageSize: '50', pageNumber: String(pageNumber), sortBy, sortOrder: 'DESC' });
  const r = await fetch(`${ENDPOINT}?${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({}) });
  const j = await r.json();
  return Array.isArray(j.results) ? j.results : [];
}
function passesFilter(rec) {
  const meta = rec.metadata ?? {};
  const typeVal = pickMeta(meta, 'type');
  const sortStatus = pickMeta(meta, 'sortStatus');
  const deadlineStr = pickMeta(meta, 'deadlineDate');
  if (typeVal !== '0' && typeVal !== '2') return false;
  if (sortStatus !== '1' && sortStatus !== '2') return false;
  if (deadlineStr) { const d = new Date(deadlineStr); if (!isNaN(d.getTime()) && d < now) return false; }
  return true;
}
const queries = [
  'INTPA development cooperation',
  'NEAR IPA neighbourhood',
  'development cooperation aid tender',
  'humanitarian assistance',
];
for (const t of queries) {
  let totalPass = 0;
  const samples = [];
  const statusCounts = {};
  for (let pg = 1; pg <= 3; pg++) {
    const recs = await page(t, pg, 'startDate');
    for (const rec of recs) {
      const s = pickMeta(rec.metadata ?? {}, 'sortStatus') ?? '?';
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
      if (passesFilter(rec)) {
        totalPass++;
        if (samples.length < 3) {
          const m = rec.metadata ?? {};
          samples.push(`${pickMeta(m, 'callIdentifier') ?? rec.reference} [st=${pickMeta(m, 'sortStatus')},ty=${pickMeta(m, 'type')}] ${(pickMeta(m, 'title') ?? '').slice(0, 50)}`);
        }
      }
    }
  }
  console.log(`\n"${t}"  pass(3pg)=${totalPass}  status=${JSON.stringify(statusCounts)}`);
  for (const s of samples) console.log('   •', s);
}
