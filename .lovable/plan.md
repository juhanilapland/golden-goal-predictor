## Goal

Round out the Quincy Quant HTTP surface so the local Python pipeline can pull fixtures, pull historical results, and push predictions — and verify all three behave as specified.

## Changes

### 1. `/api/public/quant-predictions` — no code change
Already matches spec after the previous turn:
- Zod requires top-level `model` (1–200 chars).
- Upserts `{ predictor: "quant", model: parsed.data.model, pick, prob_home/draw/away, reasoning }` into `public.predictions` with `onConflict: "match_id,predictor"`.
- Overwrites the fallback quant rows that `pickQuantFallback` seeded.

Verification only (no edit).

### 2. New `src/routes/api/public/quant-fixtures.ts`
`GET` (and `OPTIONS` for CORS) returning `{ fixtures: [...] }`.

- Loads from `matches` via `supabaseAdmin` (loaded inside the handler, never at module scope).
- Filters:
  - `stage = 'GROUP_STAGE'`
  - `status != 'FINISHED'`
  - Exclude placeholder teams: `home_team`/`away_team` not in `('TBD')` and not `ilike 'Winner %'` and not `ilike 'Runner-up %'`.
- Orders by `kickoff asc`.
- Projects exactly: `id, kickoff, stage, group_name, home_team, away_team, home_code, away_code, status`.
- Includes the shared CORS header block (matches `sync-fixtures.ts`).

### 3. New `src/routes/api/public/quant-results.ts`
`GET` (and `OPTIONS`) returning `{ results: [...] }`.

- Loads from `matches` via `supabaseAdmin`.
- Filters:
  - `status = 'FINISHED'`
  - `home_score not null` and `away_score not null`
  - Same placeholder-team exclusion as fixtures.
- Orders by `kickoff asc`.
- Maps each row to:
  ```
  {
    match_id: row.id,
    date: row.kickoff,
    stage: row.stage,
    group_name: row.group_name,
    home_team: row.home_team,
    away_team: row.away_team,
    home_score: row.home_score,
    away_score: row.away_score,
    tournament: "FIFA World Cup",
    country: null,
    neutral: true,
  }
  ```
- CORS headers identical to the other two routes.

### Shared details
- Both new routes are TanStack server routes via `createFileRoute(...)({ server: { handlers: { GET, OPTIONS } } })`.
- `supabaseAdmin` imported dynamically inside each handler (`const { supabaseAdmin } = await import("@/integrations/supabase/client.server")`).
- No auth header (matches existing `/api/public/*` convention; dev-only). A `TODO` comment notes adding a shared-secret check before publishing publicly.
- No DB migration, no schema change, no edits to other files.

## Verification after deploy

Using `stack_modern--invoke-server-function` against the dev URL:
1. `GET /api/public/quant-fixtures` → expect `{ fixtures: [...] }` with upcoming group-stage matches only (no FINISHED, no `TBD`/`Winner…`/`Runner-up…`).
2. `GET /api/public/quant-results` → expect `{ results: [...] }` containing the two played matches with `tournament: "FIFA World Cup"`, `country: null`, `neutral: true`.
3. `POST /api/public/quant-predictions` with the spec payload for one real `match_id`, then `supabase--read_query` on `predictions` to confirm `model` is the posted string (not `local-logreg`) and `prob_*` + `reasoning` are stored.

## Out of scope
- No changes to the fallback `pickQuantFallback` path.
- No auth/secret added yet (called out as a TODO).
- No Python script changes (`scripts/push_predictions.py` still works as-is; the new GET endpoints are new capability, not a contract change for the existing POST).
