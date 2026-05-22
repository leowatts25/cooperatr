# Cowork prompt templates

Short paste-ready prompts for delegating chunks of work to Claude Cowork on this repo. Each one assumes Cowork will read `CLAUDE.md` and the named `docs/` file before starting, so they're intentionally light on background.

---

## Template: build the matcher (next chunk)

> Read `CLAUDE.md` and `docs/BD-SCANNER.md` first, especially the "Next sensible chunk" section.
>
> Build the BD scanner matcher in three commits:
>
> 1. `app/lib/matcher.ts` — given a tender row, retrieve N candidate scouted companies (warm-intro contacts first, then sector+geography filter), and run a single Claude Sonnet 4.6 call with structured tool-use returning `{ score: 0–100, rationale: string, fit_dimensions: jsonb, partner_stack?: string[], risks?: string[] }`. Use prompt caching on the system block. Persist into `tender_matches`. Idempotent on `(tender_id, scouted_company_id)`.
>
> 2. Wire it into the existing `/api/cron/ingest-tenders` cron route — run the matcher after ingest finishes, scoring every tender from the past week that has `passes_filter = true`. Hobby is at 2 crons so we can't add a third; combining ingest + match is the intended shape.
>
> 3. `/admin/bd` page — table of (tender × company) pairings sorted by score desc, filterable by `status` and `warm_intro_via_contact_id != null`. "Pursue" button on each row should mark status='pursuing' and stub a hand-off to M2 (Proposal Writer) — no need to fully wire M2 here, just navigate to `/proposals/new?tender_id=...&company_id=...`.
>
> Before committing the cron change: do a dry run (no DB writes) on one tender, paste the LLM response. I'd like to sanity-check the rationale before turning it on at scale (~1,500 calls/week ≈ $5–15/week).
>
> Match the conventions in CLAUDE.md (commit messages, Co-Authored-By trailer, RLS policy on any new table, `printf` not `echo` for env vars).

---

## Template: LinkedIn contacts import

> Read `CLAUDE.md` and `docs/BD-SCANNER.md`. The schema for `linkedin_contacts` already exists (migration 010).
>
> Build `/api/admin/linkedin/import` — accepts the CSV from LinkedIn → Settings → Data Privacy → Get a copy of your data → Connections. Columns are roughly: First Name, Last Name, URL, Email Address, Company, Position, Connected On. Insert one row per contact, set `owner_id = current admin user id`. Idempotent on `(owner_id, linkedin_url)` — add a unique constraint via a small follow-up migration.
>
> Then on `/admin/tenders` (existing page), add a "Contacts" tab that shows the imported contacts grouped by `company_name`, so I can eyeball the data before the matcher uses it for warm-intro routing.
>
> Don't change the matcher in this PR — just get the data in.

---

## Template: SME discovery step

> Read `CLAUDE.md` and `docs/BD-SCANNER.md`. SME discovery is the step that *populates* `scouted_companies` so the matcher has candidates beyond just my LinkedIn contacts.
>
> Build `app/lib/sme-discovery.ts` — given a filtered tender row, find 3–5 plausible candidate SMEs by:
>
> 1. Querying CORDIS (https://cordis.europa.eu/api/projects) for past winners of similar EU projects (filter by CPV + country)
> 2. Falling back to a Claude web-search call for sector-specific SMEs in the relevant country/region
>
> Each candidate becomes a row in `scouted_companies` with `discovered_via='cordis'` or `'web_search'`, `discovered_for_tender_id` set, and `evidence_notes` containing what we found. Idempotent on `(name, country)` to avoid dupes across tenders.
>
> This runs as part of the weekly cron, just before the matcher. Cache results per (sector, country, CPV) for 7 days so we don't re-search the same combinations.

---

## Notes for any task

- Run `npm run build` locally before pushing — Vercel will fail fast on TS errors but local catch is cheaper.
- Migrations are applied **manually** via Supabase SQL editor (project `ikqirkqseclpwykimcax`). Write the SQL, paste it, run it. No `supabase db push` is wired up.
- If anything would need a new env var, add it via `printf "value" | vercel env add NAME production` (`echo` adds a trailing newline that breaks HTTP headers — we hit this with `CRON_SECRET`).
- Don't touch the `corpus_*` tables or the existing M1/M2 flows unless I ask. They represent meaningful prior work.
- No emojis in code or commits unless I ask.
