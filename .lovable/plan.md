## Problem

Knockout matches can't end in a draw — penalties decide a winner — but our `matches.outcome` column is set from full-time score only. Netherlands 4–4 Morocco (LAST_32) is stored as `outcome = "draw"`, so every guesser is marked wrong, including Quincy who picked Morocco (the actual penalty winner).

## Fix

### 1. Capture the real winner from the upstream API

`src/routes/api/public/sync-fixtures.ts` currently derives `outcome` from `score.fullTime`. Football-data v4 also returns `score.winner` ("HOME_TEAM" / "AWAY_TEAM" / "DRAW") which already accounts for extra time and penalties. Switch knockout matches to use `score.winner`:

- For `stage === "GROUP_STAGE"` → keep current behavior (draws are valid).
- For knockouts → map `score.winner` to `home` / `away`. Never store `draw` for a FINISHED knockout match.

### 2. Scoring helper guard

In `src/lib/wc-config.ts`, add a stage-aware helper (or update the call sites in `room.functions.ts`, `predictors.functions.ts`, `results.tsx`, `visualization.tsx`) so that when a match is knockout + FINISHED + scores equal and `outcome` is missing, we don't fall back to `outcomeFromScore` (which would return "draw"). Prefer the stored `outcome` and treat missing knockout outcome as "unknown" rather than draw.

### 3. Backfill Netherlands vs Morocco

One-off DB update: set `matches.outcome = 'away'` for match id 537418 so the results page immediately recomputes points (Quincy gets credit, the other six lose their wrong "home" pick — which matches reality).

### 4. Re-sync

After the code change, hitting `/api/public/sync-fixtures` will overwrite outcomes from `score.winner` for any future knockout match automatically, so this won't recur for Round of 16 and beyond.

## Out of scope

- No schema change. We keep using the existing `outcome` column ("home" | "away" | "draw" | null); knockouts just never write "draw".
- No UI change to show penalty score (e.g. "4–4 (5–3 pens)"). Happy to add as a follow-up if you want it visible.

## Want me to also surface the penalty score in the UI?

If yes, I'd add `penalty_home` / `penalty_away` columns and render "4–4 (pens X–Y)" on the match card. Otherwise we just fix the outcome and move on.