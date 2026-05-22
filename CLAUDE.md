@AGENTS.md

# Cooperatr — project handbook

This file is the durable context for any Claude agent (Cowork, Code, or otherwise) starting work on this repo. Keep it tight; if a section grows past ~20 lines, split it into `docs/`.

## What this is

Cooperatr is an AI platform for **European and post-USAID development finance**. Customers: EU SMEs, NGOs in transition from USAID, US primes pivoting to EU funding, EU consortium leads, CSDDD-obligated corporates. Mission: *design* cooperation projects (not just find grants) by reading the intersection of public finance pipelines, private market signals, and political cooperation agendas.

Live at https://cooperatr.com. Owned by Paradise Street Capital, S.L.U. (Seville, Andalusia).

## Two product modes (important architectural distinction)

| Mode | Who triggers it | What it does | Status |
|---|---|---|---|
| **Pull (M1 + M2)** | A user signs up, fills in their company profile, asks for ideas | Opportunity Engine (10 parallel Haikus + Sonnet critic) generates project concepts; Proposal Writer drafts sections | Live |
| **Push (BD scanner)** | Continuous cron, no user involvement | Scans donor tender feeds → discovers matching SMEs → scores tender×company pairs → weekly internal BD report | In progress — see `docs/BD-SCANNER.md` |

Both modes read from the same **corpus** of clean-room-extracted proposal patterns (`corpus_sources` + `proposal_patterns` tables, migrations 007–009). Don't duplicate that.

## Stack

- **Next.js 16** (App Router, React 19). **IMPORTANT**: this is not the Next.js you know from training data. Check `node_modules/next/dist/docs/` before writing routing, caching, or rendering code. See `AGENTS.md`.
- **TypeScript** strict mode; `@/*` path alias to repo root
- **Supabase** (Postgres + auth) — project ID `ikqirkqseclpwykimcax` (cooperatr-eu, free tier with daily keep-warm cron)
- **Anthropic SDK** — Claude Sonnet 4.6 (`claude-sonnet-4-6`) for heavy work, Haiku 4.5 (`claude-haiku-4-5-20251001`) for parallel cheap calls. Prompt caching via `cache_control: { type: 'ephemeral' }` on shared system blocks.
- **Vercel** deploys on push to `main`. Hobby tier — max 2 cron jobs (keep-warm + ingest-tenders).
- **i18n** — EN/ES with auto-translation pipeline (`app/lib/i18n/`)

## Repo layout

```
app/
  api/
    admin/        — admin-only endpoints (gated by ADMIN_EMAIL query param)
    auth/         — Supabase auth handlers
    cron/         — Vercel cron entry points (CRON_SECRET-gated)
    opportunities/ — M1 Opportunity Engine
    partners/     — Partner vetting
    profile/      — Company profile deepening
    projects/     — Project management
    proposals/    — M2 Proposal Writer
  lib/
    agents/       — M1/M2 LLM orchestration
    ingesters/    — BD scanner tender sources (TED, SAM.gov, …)
    i18n/         — translation infra
    auth-check.ts, corpus.ts, supabase.ts, supabase-auth.ts
  admin/          — admin dashboard pages
  {dashboard,opportunities,partners,projects,proposals,...}/  — user-facing pages
supabase/migrations/  — sql migrations applied to Supabase manually
docs/           — project docs (e.g. BD-SCANNER.md)
```

## Conventions

- **Auth gating**: user endpoints use `checkApprovedUser()` from `app/lib/auth-check.ts`. Admin endpoints use `adminEmail` query param checked against `ADMIN_EMAIL` constant (simplified pattern; matches existing `/api/admin/users`).
- **Database access**: server-side service-role client via `createServerClient()` from `app/lib/supabase.ts`. Don't use the anon client for admin/cron work.
- **RLS**: every new table has `enable row level security` + a `service_role_<table>` policy. Public access via anon key is intentionally absent until a feature needs it.
- **Maximum function duration**: declare `export const maxDuration = N` per route. Cron + ingest routes use 300; LLM routes use 60–120.
- **Idempotent upsert**: external-source tables use `unique (source, source_ref)` and `.upsert(..., { onConflict: 'source,source_ref' })` so re-runs don't duplicate.
- **No emojis in code or commits** unless the user asks. UI emojis (like sector icons on landing) are fine.
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `chore:`, `docs:`. Scope examples: `bd`, `corpus`, `infra`, `analytics`, `opportunities`, `proposals`.
- **Co-author trailer**: every commit Claude makes ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## Important gotchas

- **`vercel env add` and trailing newlines.** Piping with `echo` adds `\n` which gets stored in the env var, then breaks HTTP headers (e.g. `CRON_SECRET`). Always use `printf "value" | vercel env add NAME production`.
- **Vercel Hobby = 2 cron jobs max.** We're at 2 (keep-warm + ingest-tenders). Adding a third source means combining inside an existing cron, not a new entry.
- **Supabase free tier auto-pauses after ~7 days of no activity.** The `/api/cron/keep-warm` daily cron prevents this by reading from 4 tables. Don't remove without confirming Pro upgrade.
- **TED v3 API field allowlist is empirically derived.** See `app/lib/ingesters/ted.ts` header comment. Adding a new field means probing the API; don't guess from training data.
- **Migrations are applied manually via the Supabase SQL editor.** There's no `supabase db push` flow wired up. After writing a new migration, run it via the dashboard.
- **Next.js 16 routing/caching differs from earlier versions.** Read the local docs in `node_modules/next/dist/docs/` for App Router patterns instead of relying on memorized APIs.

## Models in use

- `claude-sonnet-4-6` — heavy reasoning: M1 critic, M2 section drafts, corpus extraction
- `claude-haiku-4-5-20251001` — 10× parallel ideation in M1, fast classification calls
- `text-embedding-3-small` — corpus retrieval (pgvector 1536-dim, currently nullable; metadata filter retrieval in use today)

## Active env vars (production)

| Name | Purpose | Required? |
|---|---|---|
| `SUPABASE_URL` + `*_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` | DB | ✓ |
| `ANTHROPIC_API_KEY` | All LLM calls | ✓ |
| `CRON_SECRET` | Bearer auth for `/api/cron/*` | ✓ (no trailing newline) |
| `SAMGOV_API_KEY` | SAM.gov ingester | Optional (ingester skips silently if absent) |

## Where to look first

- `docs/BD-SCANNER.md` — the current chunk of work
- `supabase/migrations/` — all schema in order (001 → 010)
- `app/lib/agents/` — M1/M2 prompt + tool-use code
- `app/lib/corpus.ts` — corpus retrieval used by both engines
- `app/lib/ingesters/run.ts` — BD scanner orchestrator (includes future-source notes)

## When working on this repo

1. Read the relevant `docs/` file for the chunk you're picking up.
2. Check the most recent commits with `git log --oneline -20` — context drifts faster than docs.
3. Production deploys auto on push to `main`. There's no preview environment for backend changes — verify locally with `npm run dev` and `npm run build` before pushing.
4. Never delete or modify the `corpus_*` tables or the existing M1/M2 flows without an explicit user instruction. They represent meaningful prior work.
