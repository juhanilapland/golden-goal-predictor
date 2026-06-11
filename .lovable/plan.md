## Problem

`generateAllMissingPicks` currently walks every match in the database and fills any missing `(match, predictor)` pair. So pressing **Generate picks** also created rival picks for future matches you haven't guessed yet — picks that should only be generated the moment you make your own pick (which is already wired up in `handlePick` → `generateCompetitorPicks`).

You also noted "including me" — your own picks live in the `guesses` table, not `predictions`, so they weren't actually touched. What you saw was rivals predicting your future matches.

## Fix

Change `generateAllMissingPicks` in `src/lib/predictors.functions.ts` so it only considers matches that **already have at least one prediction**. That set is exactly "matches you've picked at some point" (because the only thing that creates predictions today is your pick triggering `generateCompetitorPicks`).

Concrete change:

1. Query `predictions` first to get the distinct `match_id`s that already have any rival pick.
2. Fetch only those matches from `matches`.
3. Run the existing backfill loop on that subset.

Effects:

- A new guesser (e.g. Freddy) gets filled in for every match where the other rivals already exist — same as today.
- Matches you haven't picked yet stay untouched. When you eventually pick them, `generateCompetitorPicks` runs for all 6 rivals as usual.
- The existing `onConflict("match_id,predictor")` upsert still prevents overwriting any existing pick.

No UI changes, no schema changes, no change to `generateCompetitorPicks`.

## Technical notes

- One added `supabaseAdmin.from("predictions").select("match_id")` call, then `Array.from(new Set(...))` to get unique ids, then `.in("id", ids)` on the matches query.
- If the distinct set is empty, return `{ generated: 0 }` early.
