# Connect your local ML model via REST (push direction)

You run the model on your laptop whenever you want. When it's done, your Python script POSTs the results to a Lovable endpoint, which stores them as Quincy's picks. Lovable never has to reach your laptop.

## Flow

```text
Your laptop (Python)                Lovable
┌────────────────────┐              ┌──────────────────────────────┐
│ train + predict.py │── POST ────► │ /api/public/quant-predictions│
│ for each match:    │   JSON       │  • validate body             │
│   {match_id,       │              │  • upsert into predictions   │
│    pick,           │              │    (predictor = 'quant')     │
│    confidence}     │              └──────────────────────────────┘
└────────────────────┘                            │
                                                  ▼
                                        Quincy's picks appear
                                        in the app (Room/Results)
```

## What changes in the app

### 1. New public server route — `src/routes/api/public/quant-predictions.ts`
- `POST` handler under `/api/public/*` (bypasses the published-site auth gate per your "no auth, dev only" choice).
- Validates body with Zod:
  ```ts
  { predictions: Array<{ match_id: number, pick: 'home'|'draw'|'away', confidence?: number, reasoning?: string }> }
  ```
- Loads `supabaseAdmin` inside the handler (service role, RLS bypassed) and upserts each row into `predictions` with `predictor = 'quant'`, `model = 'local-logreg'`.
- Returns `{ inserted: N }`.
- `GET`/`DELETE` return 405.
- Note: the `predictions` table currently has no UPDATE/INSERT policies and no unique constraint on `(match_id, predictor)`. The admin client bypasses RLS so inserts work, but to make this idempotent (re-run the script without duplicates) we need a small migration — see step 2.

### 2. Migration — make Quincy's predictions upsertable
- Add `UNIQUE (match_id, predictor)` to `predictions` so the endpoint can use `ON CONFLICT … DO UPDATE`.
- No new table, no new RLS rules, no grant changes.

### 3. Switch Quincy's runtime behavior — `src/lib/predictors.functions.ts`
- Today `pickQuant()` computes the pick from hardcoded coefficients on every request.
- Change it to: **read** the row your script pushed (`predictions` where `predictor='quant'` for that match). If a pushed row exists, return it. If not, fall back to the current hardcoded formula so the app still works before you've run your script.
- Update the persona text on `/personas` to honestly describe this: "trained offline on historical match data, predictions pushed in via REST."

### 4. Tiny Python reference script (lives in `/scripts/push_predictions.py`, runs on your laptop)
- ~30 lines: read matches list (either hardcoded or fetched from the public matches endpoint), run your sklearn model, POST to `https://project--2140653b-7389-4ba2-a831-55070ace4acf.lovable.app/api/public/quant-predictions`.
- Included as documentation/template — Lovable doesn't execute it.

## Technical details

- **Endpoint URL (stable, won't change if you rename the project):**
  `https://project--2140653b-7389-4ba2-a831-55070ace4acf-dev.lovable.app/api/public/quant-predictions` (preview)
  `https://project--2140653b-7389-4ba2-a831-55070ace4acf.lovable.app/api/public/quant-predictions` (published)
- **No auth header required** (dev-only choice). Before publishing publicly, we'd add a shared-secret header check — flagged as a TODO comment in the route.
- **Idempotency:** the unique constraint + upsert means re-running your Python script overwrites prior picks for the same match instead of duplicating rows.
- **Confidence:** stored in the existing `reasoning` text column as `"confidence=0.62"` (cheap, no schema change) unless you'd rather I add a numeric `confidence` column — happy to, just say the word.
- **No changes** to: chat, guesses, matches, other predictors (Adriana stays on Lovable AI Gateway), auth, or the personas DB row beyond text.

## What you'll do on your end (not part of this plan, just so you know)

1. `pip install scikit-learn pandas requests`
2. Train your logistic regression on whatever historical dataset you choose (e.g. the public international-results CSV on Kaggle).
3. Run `python scripts/push_predictions.py` — picks appear in the app within seconds.

## Out of scope

- Auth on the endpoint (explicitly deferred).
- Storing model artifacts / training data in Lovable.
- A "last updated" indicator in the UI (can add later if useful).
