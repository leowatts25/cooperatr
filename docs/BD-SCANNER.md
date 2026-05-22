# BD Scanner — push-mode tender pipeline

## What this is and why it exists

The original cooperatr product is **pull**: a user signs up, fills in their company profile, and asks for project ideas. That's the M1 Opportunity Engine + M2 Proposal Writer.

The BD scanner is **push**: a continuous loop that

1. Pulls new tenders from donor feeds (TED, SAM.gov, …)
2. Discovers candidate SMEs per tender (web search + CORDIS + warm-intro lookup against LinkedIn contacts)
3. Scores each (tender × company) pair with a corpus-grounded rationale
4. Surfaces the weekly top-N to an internal BD dashboard

The push model is the actual product. Pull-mode M1 becomes a side tool for onboarding a new SME when we don't yet have a tender to match them against. The competitive moat is **reverse matching + corpus-grounded scoring**, not tender aggregation — aggregators like developmentaid.org and Devex are sources, not competitors.

## Current state (as of last commit)

**TED ingester is live and producing data.**

- Daily cron: `/api/cron/ingest-tenders` at `30 7 * * *` UTC
- Last verified run: 300 fetched / 300 normalized / 300 upserted / 291 passing filter
- Dashboard: https://cooperatr.com/admin/tenders (admin-email gated)
- "Run ingest now" button: `/api/admin/tenders/trigger`

**SAM.gov ingester is coded but skipped.**
- Needs `SAMGOV_API_KEY` env var. Free key at https://api.sam.gov/ (1000 req/day).
- Once set, runs in the same cron as TED.

**Schema is migration 010** (`supabase/migrations/010_bd_scanner.sql`). Already applied.

## Schema overview (migration 010)

| Table | Purpose |
|---|---|
| `sectors` | Config: cooperatr's 6 sectors (`agri_food`, `renewable_energy`, `water_tech`, `circular_esg`, `critical_minerals`, `human_rights`) with keyword arrays for the in-ingester filter |
| `tenders` | Normalized tender records from donor feeds. Unique on `(source, source_ref)`. Stores raw payload in `raw jsonb`. |
| `scouted_companies` | Third-party SMEs the scanner discovers per tender. Separate from `companies` (user-profile/pull-mode). |
| `linkedin_contacts` | Admin's LinkedIn export, used for warm-intro routing |
| `tender_matches` | Scored (tender × scouted_company) pairings with rationale, fit dimensions, warm-intro link, BD workflow status |

## Filter criteria (per user spec)

| Dimension | Setting |
|---|---|
| **Sectors** | The 6 listed in `sectors` table — extensible by inserting new rows |
| **Geographies** | EU (where SMEs live) + DR + USA (user is a US citizen) + project country surfaced by the tender itself |
| **Donors** | All sources active; can weight later |
| **Value** | $20k floor (tiny TA contracts welcome), $5M ceiling (filter out big-prime deals) |
| **Type** | services / works / goods / mixed — all welcome |
| **Warm intros** | Pinned to top of weekly report when a LinkedIn contact maps to a candidate company |

Currently ~97 % of TED notices pass the cheap pre-filter (most have unknown value or no English title to keyword-match). The LLM matcher is supposed to do the real filtering. If that becomes a cost problem, tighten the in-ingester filter to require sector match (CPV or keyword) OR a non-null value in range.

## Sources

### TED — live

- Endpoint: `https://api.ted.europa.eu/v3/notices/search` (POST, JSON)
- Auth: none
- Validated field allowlist (empirically derived): `publication-number`, `title-proc`, `title-glo`, `title-lot`, `publication-date`, `deadline-receipt-tender-date-lot`, `description-proc`, `buyer-name`, `organisation-country-buyer`, `classification-cpv`, `framework-maximum-value-lot`
- Query syntax: TED expert search (`publication-date>=today(-2)`, dates `YYYYMMDD` or `today(±N)`)
- Multilingual fields: `{ "eng": "...", "pol": ["..."] }` — handler prefers `eng`, falls back to `spa/fra/deu/ita/por/nld/pol`, then any value
- Sector tagging: CPV-prefix mapping (more reliable than keyword for non-English titles) + keyword on title/description

### SAM.gov — coded, skipped without key

- Endpoint: `https://api.sam.gov/opportunities/v2/search` (GET)
- Auth: `api_key` query param
- Donor classifier maps buyer name → `US-State`, `DFC`, `MCC`, `USAID-legacy`, `US-Federal`

### Future sources (documented inline in `app/lib/ingesters/run.ts`)

- **UNGM** — no public API. Either CSV subscription import or scraping with anti-forgery tokens. Skipped for now.
- **CORDIS** — used in SME discovery, not daily ingest. Per-tender query for past EU project winners.
- **EU Funding & Tenders portal** — needs empirical probing like TED. Saved for later.
- **AECID / GIZ / KfW / AFD / FCDO** — per-portal HTML scrapers; only when a real BD use case demands it.

## What's NOT built yet

1. **LinkedIn CSV ingester** — schema (`linkedin_contacts`) exists. Need: `/api/admin/linkedin/import` endpoint that takes the CSV export from LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections.
2. **SME discovery step** — per filtered tender, run a web search (or query CORDIS) to find candidate companies, store in `scouted_companies` with `discovered_via='web_search'`/`'cordis'` and `discovered_for_tender_id`.
3. **The matcher** — the central LLM step. See "Next sensible chunk" below.
4. **Weekly BD report page** — `/admin/bd` showing top-N matches sorted by score, warm-intros pinned.

## Next sensible chunk

**Build the matcher.** Order:

1. **`app/lib/matcher.ts`** — given a tender row, retrieve N candidate scouted companies (warm-intro first, then sector+geography filter), run a single Claude Sonnet 4.6 call with structured tool-use returning `{ score: 0–100, rationale: string, fit_dimensions: jsonb, partner_stack?: string[], risks?: string[] }`. Use prompt caching on the system block. Persist into `tender_matches` table (already exists).
2. **`/api/cron/run-matcher`** — weekly cron (Sun 22:00 UTC). Vercel Hobby is at 2/2 crons; combine inside `ingest-tenders` *or* upgrade to Pro. Recommend combining: ingest then match in one job, since both are weekly-cadence-tolerable.
3. **`/admin/bd` page** — table of (tender × company) pairings sorted by score desc. Filters: `status` (suggested/reviewed/pursuing/dropped), `warm_intro_via_contact_id != null`. Action: "Pursue" → hands the pair off to M2 Proposal Writer.

Cost note before building: scoring 300 tenders/week × 5 candidate companies = 1,500 Sonnet calls/week. At current pricing roughly $5–15/week. Reasonable for an internal tool. Ask the user before turning on the cron in production.

## Things to watch out for

- **TED titles in local languages** — keyword filter misses most. CPV mapping partially compensates. Long-term fix: translate titles to English on ingest via a batched Claude call (cheap with caching).
- **Vercel cron count** — Hobby cap is 2. Combine new sources inside existing crons or upgrade.
- **Trailing newlines in `vercel env add`** — see CLAUDE.md gotchas.
- **Migration runner is manual** — apply `010_bd_scanner.sql` via Supabase SQL editor when porting to a new environment.

## File map for this chunk

```
app/
  api/
    cron/ingest-tenders/route.ts        — daily cron entry
    admin/tenders/route.ts              — list endpoint for /admin/tenders
    admin/tenders/trigger/route.ts      — "Run ingest now" button handler
  admin/tenders/page.tsx                — dashboard
  lib/ingesters/
    filter.ts                           — sector + value pre-filter
    ted.ts                              — TED v3 ingester with validated fields
    samgov.ts                           — SAM.gov ingester
    run.ts                              — orchestrator + future-source notes
supabase/migrations/010_bd_scanner.sql  — schema
vercel.json                             — cron registration
```

## Commits that shaped this chunk

```
c0a4d0e  feat(bd): mark skipped sources distinct from errors + document future ingesters
5d534b9  fix(bd): rewrite TED ingester for eForms 2015 / TED v3 API + add SAM.gov source
34a303b  feat(bd): scanner foundation — tenders schema + TED ingester + admin dashboard
```
