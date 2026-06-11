# Add Freddy Fanatic (predictor only)

A sixth rival who "learns" as the tournament progresses by tallying each team's prior wins. Persona/chat style is deliberately deferred to a follow-up.

## Prediction logic

For an upcoming match between Home (H) and Away (A):

1. Pull all FINISHED matches that kicked off before this match's kickoff and involve H or A.
2. Count wins per team from `matches.outcome` (`home` / `away` / `draw`). Draws contribute 0 wins to either team.
3. Compare `wins(H)` vs `wins(A)`:
   - `wins(H) > wins(A)` → pick `home`
   - `wins(A) > wins(H)` → pick `away`
   - Tie (including both 0, i.e. neither has played) → random:
     - Group stage: `home | draw | away`
     - Knockout: `home | away`
4. Reasoning string examples:
   - `"Mexico 2W · South Africa 0W — backing Mexico."`
   - `"No prior games — coin flip → home."`
   - `"Both 1W — tie, rolled away."`

This means his very first matchday is fully random, and he gradually shifts to evidence-based picks as results accumulate. No model field (`model: null`).

## Changes

### 1. `src/lib/predictors/personas.ts`
- Extend `RivalId` union with `"fanatic"`.
- Append `"fanatic"` to `RIVAL_ORDER`.
- `RIVAL_NAMES.fanatic = "Freddy Fanatic"`.
- Add a **placeholder** persona string in `RIVAL_PERSONAS.fanatic` (single short line, marked TODO) — real persona drafted in the next turn.
- Add a placeholder `RIVAL_LOYALTIES.fanatic` entry (also TODO-marked) so type completeness holds.

### 2. `src/lib/predictors.functions.ts`
- Add `pickFanatic(m, supabaseAdmin)` — async because it queries past results.
- Query:
  ```sql
  select home_team, away_team, outcome
  from matches
  where status = 'FINISHED'
    and kickoff < <this match kickoff>
    and (home_team in (H, A) or away_team in (H, A))
  ```
- Tally wins per team in JS, then apply the logic above.
- Append `"fanatic"` to the `PREDICTORS` tuple.
- In the `generateForMatches` loop, route `"fanatic"` to `pickFanatic(m, supabaseAdmin)` (passing the admin client so we don't re-import per call).

### 3. Database — `predictors` table
Insert a row so the results page lists him:
```
id: 'fanatic'
name: 'Freddy Fanatic'
tagline: 'Learns as the tournament unfolds.'
sort_order: 60   (after vibes)
```
This is a data insert, not a schema change.

### 4. Backfill for match 1
The five existing rivals already saved picks for Mexico vs South Africa. Calling `generateCompetitorPicks({ matchId: 537327 })` once will fill in only Freddy's missing row (existing `have` set skips the others). Since no FINISHED matches exist yet, his match-1 pick will be random — exactly as specified.

## Out of scope (next turn)
- Freddy's voice / persona prompt for the game room chat.
- Loyalties (loves / hates) — placeholder for now.
- Any UI surface changes beyond him naturally appearing in the predictor list.

## Open question
Should "wins" only count **group-stage + knockout matches in this tournament** (the only matches in our DB anyway), or should we also weight draws somehow (e.g. 1 point per draw)? Current plan: pure win count, draws ignored. Confirm or I'll go with that.
