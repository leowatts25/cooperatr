# Funding-sources roadmap

How Cooperatr's opportunity sourcing expands from "central EU tenders" to the full
development-finance funding universe.

## Progress log

- ✅ **EU F&T Portal (SEDIA) revived** — language-dedup + deep pagination; fixed the
  OPEN-but-stale-deadline drop so **Global Gateway** calls now ingest.
- ✅ **Part C — Discovery v2 (web search + verification)** shipped. `discovery.ts` now
  web-searches to find/verify real firms, with per-candidate confidence + evidence URL;
  low-confidence guesses dropped. (Commit `1552c5f`.)
- ✅ **Part B — funding_sources registry + inverted discovery** shipped. `/admin/funding`
  registry (migration 019), seeded with Global Gateway vehicles; **"✨ Discover sources"**
  runs web-search funder research to grow it (foundations / standing funds / DFI windows /
  impact capital), flagged "needs review". (Commits `20629d1`, `2aef38e`.)
- ⏳ **Part B follow-up:** funder→company matching (match registry funders to a company/
  tender) — not built yet.
- ⚠️ **Part A — AECID ingester BLOCKED:** PLACSP (`contrataciondelestado.es`) is
  unreachable from the build environment (HTTP 000), so the CODICE/ATOM ingester can't be
  built+tested. AECID's *instruments* are captured via inverted funder discovery
  (FEDES/FONPRODE); above-threshold AECID *tenders* already flow via TED. To unblock: a
  sample PLACSP ATOM file + confirmation Vercel can reach the host.
- ⏳ **Part A remaining:** FCDO + World Bank (real APIs), CSV-import endpoint, aggregator eval.

## Where we are today (notice-driven scraping)

All current ingestion is **notice-driven**: scrape published opportunities that have a
deadline, normalize, dev-finance-filter, then match SMEs.

| Source | Covers | Status |
|---|---|---|
| TED | EU/EEA public procurement | ✅ live |
| EU F&T Portal (SEDIA) | NDICI/Global Europe, IPA III, NEAR, Global Gateway — tenders **and** CSO grant calls | ✅ live |
| SAM.gov | US federal procurement (post-USAID) | ✅ live |

Two structural gaps follow from this design:
1. **Source breadth** — bilateral donor agencies and MDB/UN procurement publish on their
   own portals, not TED/SEDIA, so they're invisible.
2. **Model breadth** — standing funds, foundations, and private impact capital don't emit
   dated notices at all, so a scraper can never see them.

## The company side already self-scales — the lever is discovery quality

Important framing correction: Cooperatr does **not** maintain a static roster of biddable
firms. The **discovery engine runs per viable tender and finds applicable firms on demand**
(`discovery.ts`; also triggered live by the Step-2 "Find companies" button). So the company
pool is effectively unbounded — it grows automatically with every viable tender. There is no
roster to scale, and tender-source breadth is therefore high-leverage: each new viable tender
auto-generates its own candidate set.

The real constraint is not *how many companies we store* but **how good discovery is at
finding the right applicable firms for any tender** — including niche/long-tail scopes.
Today discovery is **v1: Claude training-knowledge only, no web search**, which under-covers
niches and can guess. So the two things that compound are:

- **(Part A) source breadth** — more viable tenders, and
- **(Part C) discovery quality** — web-search-backed, verified candidate generation.

Funding-source breadth (Part B: foundations / standing funds / impact capital) is the
differentiating layer on top.

---

## Part A — Notice-based source expansion (bilateral agencies + MDB/UN)

These all fit the *existing* architecture: add an ingester under `app/lib/ingesters/`,
register it in `run.ts`, give it a `tenders.source` value, reuse the dev-finance filter.

**Golden rule (learned the hard way):** every source gets a **1-day access spike first** —
confirm the real access method, the field mapping, and the dev-finance signal — *before*
writing the ingester. No blind scrapers.

### Per-source access map (to be confirmed by spike)

| Source | Likely access | Confidence | Effort | Priority |
|---|---|---|---|---|
| **FCDO** (UK) | UK Contracts Finder **OCDS API** (open, documented) | High — API exists | S | ★★★ |
| **World Bank** | Project Procurement Notices / STEP **API** (OCDS-ish) | High — API exists | M | ★★★ |
| **AECID** (ES) | Spanish PLACSP open-data **ATOM/feed** (codsace) | Med | M | ★★★ (Spanish-first) |
| **AFD** (FR) | Site listing + also syndicated to UNDB; check for JSON/RSS | Med | M | ★★ |
| **EBRD** | ECEPP / procurement notices page; possible feed | Med | M | ★★ |
| **EIB** | Procurement pages; likely HTML scrape | Low-Med | M | ★★ |
| **GIZ** (DE) | DTVP / German e-vergabe portals; HTML, anti-bot likely | Low | L | ★★ |
| **KfW** (DE) | KfW procurement portal; HTML scrape | Low | L | ★ |
| **Sida** (SE) | Swedish e-procurement (Mercell/Visma/Tendsign); HTML/feed | Low-Med | M | ★ |
| **UNGM** (UN) | **No public API.** Subscribe → daily CSV export → CSV import endpoint, OR fragile scrape | Low | M | ★★ (high value, hard) |

Effort: S ≈ 0.5–1 day, M ≈ 2–3 days, L ≈ 4–5 days (incl. spike).

### A smarter alternative to 9 scrapers: aggregators

Several of the hard ones are already aggregated. Worth evaluating before building fragile
per-portal scrapers:
- **UNDB (UN Development Business)** — aggregates MDB + many bilateral notices.
- **dgMarket / DevelopmentAid / Devex** — broad aggregation (mostly paid).
- **TED** already carries some EIB/EU-agency notices.

If one paid aggregator covers 5–6 of these with a single API, that may beat maintaining
6 brittle scrapers. **Recommendation:** spike FCDO + World Bank + AECID (real APIs, high
value, Spanish-first) *now*; evaluate an aggregator for the HTML-only/anti-bot ones
(GIZ/KfW/Sida/UNGM/EBRD/EIB) rather than hand-scraping each.

### Shared work this unlocks
- A small **connector framework**: each ingester implements `fetch()` + `normalize()` and
  declares `{ source, accessMode: 'api'|'feed'|'csv'|'scrape' }`. `run.ts` already follows
  this shape — formalize it so adding a source is config + one file.
- A **`/api/admin/tenders/csv-import`** endpoint (already noted as a TODO) — unblocks every
  subscribe-and-export source (UNGM, some bilaterals) without scraping.
- Per-source **health/coverage telemetry** on the admin page (fetched / passed / errors) so
  silent breakage is visible.

---

## Part C — Discovery engine v2 (web search + verification)

The engine that makes "find applicable firms for any viable tender" actually work. Upgrades
`discovery.ts` from v1 (training knowledge only) to a grounded, verified pipeline.

1. **Web-search-backed discovery.** Add the web-search tool to the discovery call so it finds
   real, current firms for niche/long-tail tenders, not just well-known names in training
   data. Ground every candidate in a citable source (company site, registry, past-win notice).
2. **Verification pass (adversarial).** Each discovered firm is checked before it enters the
   pool: does it exist, is it the right size/sector, is it genuinely a forgotten-market SME
   (not a global prime / not a mis-tagged unrelated firm)? This is the guard that prevents the
   "bookstore for a textbook tender / web-host for a data-centre tender" failure we saw — the
   matcher's `isNeedsUsExcluded` is the last line, but verification should catch it at source.
3. **Dedup + enrichment.** Normalize against existing `scouted_companies`, merge rather than
   duplicate, enrich sparse rows (sectors, size, past wins) from the search evidence.
4. **Warm-network overlay** stays as designed: discovered firms are the bidders; the admin's
   LinkedIn contacts are the intro/validation layer on top.

Effort: M–L. This is the single highest-leverage quality investment — it makes every tender
(existing and new-source) produce trustworthy candidates. Reusable shape: the same
web-search + verification pattern powers Part B's inverted "find funders" discovery.

Cost note: web search + per-candidate verification raises per-tender cost (more tokens +
tool calls). Keep the verdict gate (Stage-1 tender-fit) in front so we only spend it on
viable tenders.

---

## Part B — Non-notice funding (standing funds, foundations, private impact capital)

These cannot be scraped as notices. They need a different engine: an **entity registry**
plus **inverted discovery** (research funders for a company, instead of scraping calls).

### B1. `funding_sources` registry (new table)

A curated + AI-enriched knowledge base of *funders and instruments*, not dated notices:

```
funding_sources
  id, name, type            -- 'standing_fund' | 'financial_instrument' | 'foundation'
                            --  | 'impact_fund' | 'dfi_window' | 'blended_facility'
  funder                    -- parent body (EC, EIB, Gates Foundation, ...)
  themes[]                  -- maps to our sectors
  geographies[]             -- eligible regions/countries
  instrument                -- grant | guarantee | equity | debt | TA | blended
  ticket_min_usd, ticket_max_usd
  access_mode               -- 'rolling_loi' | 'invitation' | 'open_window'
                            --  | 'intermediary_only' | 'periodic_call'
  status                    -- active | paused | closed
  cadence                   -- how/when it opens
  eligibility_notes, url, source_provenance, last_reviewed_at
```

### B2. Inverted discovery engine (reuse what we already have)

Today the Claude discovery engine answers *"which companies fit this tender?"*. **Invert it**
to answer *"which funding sources fit this company / sector / geography — and are open or
accessible right now?"* Same machinery (structured Claude calls + grounding profile),
pointed the other way.

- Seed the registry: AI research pass over known funders (EU financial instruments —
  InvestEU, EFSD+, EIB Global; DFIs — DFC, BII, FMO, Proparco; foundations — Gates,
  Hewlett, Ford, OSF, IKEA; impact funds & blended-finance facilities) → human review.
- Per company/sector, run inverted discovery to surface matched standing funds, foundations,
  and impact capital — with a confidence score and provenance, like the tender matcher.
- **We already surface impact investors + blended finance on the output side** (Stage-3
  opportunity expansion). B2 turns that into a first-class, searchable *input* registry.

### B3. Surface it
- A new pipeline tab / view: "Funding sources" (registry browse + per-company matches), or
- Fold matched non-notice funders into the existing match view as an additional column.

### Phasing for Part B
1. **B1 schema** + seed ~50 high-relevance funders (migration + AI-assisted research + review).
2. **B2 inverted discovery** (one Claude module, mirrors `discovery.ts`).
3. **B3 UI** surface + operator feedback loop (reuse the feedback pattern).

---

## Recommended sequence

**Phase 1 — first build (the two compounding levers, together):**
1. **AECID ingester** (Part A) — Spanish-first, real PLACSP open-data feed, most on-mission
   source. Proves the connector pattern on a reliable source. ~2–3 days incl. spike.
2. **Discovery v2** (Part C) — web search + verification. The quality upgrade that makes
   "find applicable firms for any viable tender" trustworthy across every source. ~1 week.
   *These pair naturally: a new source is only as valuable as the candidates discovery finds for it.*

**Phase 2 — broaden tender coverage:**
3. **FCDO + World Bank** ingesters (real APIs). ~3–4 days.
4. **CSV-import endpoint** → unlocks UNGM and any subscribe/export source. ~1–2 days.
5. **Aggregator evaluation** for HTML-only donors (GIZ/KfW/Sida/EBRD/EIB) — buy vs build.

**Phase 3 — the differentiator (foundations / standing funds / impact capital):**
6. **Part B, B1** — `funding_sources` registry + seed ~50 curated funders (human-reviewed).
7. **Part B, B2** — inverted discovery (reuses Part C's web-search + verification pattern,
   pointed at funders instead of companies).
8. **Part B, B3** — surface in the UI + operator feedback loop.

## Decisions needed
- **Aggregator budget?** A paid aggregator (UNDB/DevelopmentAid/Devex) could replace 5–6
  scrapers — is paying for one on the table, or build everything in-house?
- **Discovery v2 cost tolerance?** Web search + verification raises per-tender token/tool cost
  (still gated to viable tenders only) — what's the acceptable cost-per-tender ceiling?
- **Seed depth for the funder registry** — how many funders to curate up front (50? 200?),
  and which themes/geographies to prioritize for the first pass.
