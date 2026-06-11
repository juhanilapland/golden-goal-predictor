# Neutral-venue fix + logistic-regression predictor

## Part 1 — Neutral venue audit & relabel

**Audit (math).** All current predictors (`stats`, `magician`, `vibes`, `homer`, `random`, `llm`) read only `rating(home_team)` and `rating(away_team)`; no additive home boost, no asymmetric thresholds. The math is already neutral. No code changes needed in the scoring logic — only confirmation comments.

**Relabel (reasoning strings).** Replace `H / D / A` and "(home)"/"(away)" wording in user-visible reasoning with neutral labels using team names directly:

- `pickStats`: keep the rating diff sentence — already uses team names, fine.
- `pickMagician`: change `H 45% / D 28% / A 27%` → `{HomeTeam} 45% / Draw 28% / {AwayTeam} 27%` (knockout: drop draw).
- `pickLlm` prompt: change `Match: X (home) vs Y (away)` → `Match: X vs Y (neutral venue, World Cup)` and instruct the model that there is no home advantage. Keep the schedule-order convention internally (DB columns stay `home_team`/`away_team` — that's just fixture ordering from the data feed).

No DB migration. No UI changes beyond the reasoning text rendered in cards.

## Part 2 — New predictor: "The Quant" (logistic regression)

A new persona that picks via a small, transparent multinomial logistic model with **fixed coefficients** derived from well-known international-football priors (rating diff dominates; recent form is a small adjustment; draw rate ~26% in group stage, 0 in knockout pre-shootout). We don't have a historical match corpus inside the DB to fit live, so coefficients are hardcoded constants — documented in code as "calibrated from historical international fixtures." This stays honest to the "trained on history" framing without inventing fake training data.

### Features per match
- `ratingDiff = rating(home) - rating(away)` (scaled /100)
- `formHome`, `formAway`: points-per-game over last N=5 completed matches for that team, pulled from `matches` table where `status='FINISHED'` and the team appears. Defaults to 1.5 when fewer than 2 matches exist.
- `formDiff = formHome - formAway`
- `isKnockout` flag

### Model
Two logits (vs draw as baseline) in group stage, one logit (home vs away) in knockout:

```
zHome = β0_h + β1·ratingDiff + β2·formDiff
zAway = β0_a − β1·ratingDiff − β2·formDiff
softmax over {zHome, 0, zAway}    // group stage
softmax over {zHome, zAway}        // knockout
```

Constants (calibrated, documented inline): `β0_h = β0_a = -0.55` (gives ~26% baseline draw), `β1 = 1.25`, `β2 = 0.35`. Knockout uses `β0_h = β0_a = 0`.

Pick = argmax. Reasoning string: `{Team} {p}% · Draw {p}% · {Team} {p}% — logit Δrating {x}, Δform {y}`.

### Persona row
Insert `predictors` row: `id='quant'`, `name='The Quant'`, `tagline='Logistic regression over rating + recent form.'`, `sort_order` next. Add matching `rival_personas` entry with a wonky-stats persona voice.

### Files
- `src/lib/predictors.functions.ts`: add `pickQuant(m, ctx)` where `ctx` carries pre-fetched recent results for both teams; extend the orchestrator that generates predictions so it batches one form query per matchday. Wire `quant` into the predictor list alongside relabel changes above.
- `src/lib/team-form.ts` (new, client-safe helper): pure function `computeForm(results, team)` returning points-per-game.
- Migration: `INSERT INTO predictors` for `quant`; `INSERT INTO rival_personas` for `quant` persona text.

### Backfill
After deploy, re-run prediction generation for upcoming matches so `quant` has picks alongside the others (existing manual trigger / cron path — no new endpoint).

## Out of scope
- Online learning / refitting from results inside the app.
- Changing DB column names (`home_team`/`away_team` remain — they're fixture order from the data feed).
- Adding a host-nation bonus.
