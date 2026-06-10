## Add 5 AI/algorithmic guessers

Six total competitors: **Juhani (you)**, **Richard Random**, **Sara Statistics**, **Matt Magician**, **Adriana Idriano**, **Valerie Vibes**.

### 1. Database

Restructure `predictions`:
- Drop existing table, recreate with `(match_id bigint, predictor text, pick text, reasoning text, model text, created_at timestamptz)`.
- Primary key `(match_id, predictor)`.
- Grants for `anon`/`authenticated`/`service_role` matching current single-user open setup.
- Seed a tiny `predictors` reference table (id, name, tagline, emoji/avatar) so the UI is data-driven.

### 2. When picks happen

Trigger: **when you save a guess for match X**, all five other predictors generate their pick for match X (only if they don't already have one and match hasn't kicked off).

Implementation: a single server function `generateCompetitorPicks(matchId)` is called after the user upsert succeeds in `handlePick`. It runs all 5 strategies in parallel and upserts results. Also exposed as a button "Generate missing picks" on /results to backfill.

### 3. Each guesser's logic

- **Richard Random** — `Math.random()` over allowed outcomes (no draw in knockouts). Stored once so it's stable across reloads.
- **Sara Statistics** — rule-based. Uses a static map of FIFA-style team strength ratings (hard-coded JSON for the 48 WC teams, ~lines of `{ "FRA": 2050, ... }`). Pick = higher rating wins; if |diff| < threshold and draw allowed → draw. Stored with `reasoning` like "FRA 2050 vs CAN 1480 → home".
- **Matt Magician** — "ML-flavored" logistic scoring on the same ratings plus a small home-advantage term (none in knockouts since venues are neutral-ish, but we'll still apply a tiny stage-based prior). Computes win/draw/away probabilities via a softmax, picks argmax. Reasoning shows the probabilities (e.g. "H 54% / D 27% / A 19%").
- **Adriana Idriano** — calls Lovable AI Gateway (`google/gemini-3-flash-preview`) via a server function. Prompt: she's a football pundit; given home team, away team, stage, group, and whether draws are allowed, return JSON `{ pick: "home"|"draw"|"away", reasoning: string }`. Uses AI SDK `Output.object` with a Zod schema. Stored with `reasoning` + `model`.
- **Valerie Vibes** — logic intentionally not described here; implemented in code as `valerie.server.ts` so the source isn't summarized in chat. Deterministic per match.
- **Juhani** — that's you, no generator.

### 4. Results page

- Leaderboard at top: ranked list of all 6 with total points and correct/finished count. Your row highlighted in gold.
- Per-match table: one row per match, click to expand → shows all 6 picks (with reasoning where available), actual outcome, and per-predictor points earned.
- Stage filter kept as is.

### 5. Guess page

Small "Competitors" line under each match showing how many of the 5 have already locked in their pick (e.g. "5/5 rivals picked"). Their picks themselves stay hidden on the guess page so you can't peek.

### Technical details

- New files:
  - `src/lib/predictors/types.ts` — predictor registry (id, name, tagline).
  - `src/lib/predictors/ratings.ts` — static team strength table.
  - `src/lib/predictors/random.ts`, `stats.ts`, `magician.ts`, `valerie.server.ts` — strategies.
  - `src/lib/predictors/adriana.server.ts` — AI call (server-only).
  - `src/lib/predictors.functions.ts` — `generateCompetitorPicks({ matchId })` server fn that fans out, plus `generateAllMissing()` for backfill.
- `src/routes/index.tsx` — after `supabase.from("guesses").upsert(...)` succeeds, call `useServerFn(generateCompetitorPicks)` for that match; also load `predictions` to show the rivals-picked counter.
- `src/routes/results.tsx` — replace AI-only stats with a 6-way leaderboard + expandable rows showing every predictor's pick & reasoning.
- AI usage uses Lovable AI Gateway per `ai-sdk-lovable-gateway` (no key prompting; `LOVABLE_API_KEY` already set).
- Migration restructures `predictions`; existing rows are wiped (none in use).
