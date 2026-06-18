## Update Freddy Fanatic's prediction logic

Currently Freddy only counts wins. We'll upgrade him to a points + goal-difference tiebreaker.

### New logic (in `src/lib/predictors.functions.ts` → `pickFanatic`)

For each team, walk their prior finished matches (already fetched) and accumulate:
- **Points**: win = 1, draw = 0.5, loss = 0
- **Goal difference**: sum of `(team's goals scored) − (opponent's goals scored)` across those matches

Decision:
1. If points differ → pick the team with more points.
2. If points tie → pick the team with better goal difference.
3. If both tie → group stage may pick `draw`; knockout coin-flips between home/away (current fallback).

### Reasoning strings (shown to user)

- Points winner: `"{Home} 1.5pts (+2 GD) · {Away} 1pt (−1 GD) — backing {Home}."`
- GD tiebreaker: `"Tied on 1pt — {Home} +2 GD vs {Away} −1 GD — backing {Home}."`
- Full tie with prior games: `"Dead level (1pt, 0 GD each) — rolled {pick}."`
- No prior games at all: `"No prior games — coin flip → {pick}."` (restore this wording — now accurate, since "no points" can mean draws-only)

### Data needed

The existing query already pulls `home_team, away_team, outcome` from `matches`. We need to add `home_score, away_score` to the SELECT so GD can be computed.

### Backfill existing predictions

After the code change, run a one-off regeneration of Freddy's picks for matches that haven't kicked off yet so the room reflects the new logic. (Past/locked matches stay as-is — they're historical record.)

### Out of scope

- No changes to other predictors.
- No schema changes.
- No UI changes.
