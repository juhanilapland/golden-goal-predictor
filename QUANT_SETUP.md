# Quincy Quant Local Model Setup

## What this is

Quincy Quant's predictions can come from a **machine learning model that runs on your own computer**.  
You train the model, run it locally, then **push the results to Lovable** via a simple HTTP POST.

If no pushed prediction exists yet, the app falls back to a built-in formula so everything still works.

---

## 1. Endpoint URL

Your local script sends picks to this public endpoint:

```
https://project--2140653b-7389-4ba2-a831-55070ace4acf-dev.lovable.app/api/public/quant-predictions
```

- `-dev` = preview (latest build). Swap to the production URL after you publish.
- The endpoint is **stateless** — you can re-run your script as often as you like.

---

## 2. JSON payload format

Send a `POST` with this body:

```json
{
  "predictions": [
    {
      "match_id": 1,
      "pick": "home",
      "confidence": 0.72,
      "reasoning": "Home team has +180 Elo advantage and 3-game winning streak"
    }
  ]
}
```

| Field       | Type   | Required | Notes |
|-------------|--------|----------|-------|
| `match_id`  | int    | ✅       | Must match the `id` in Lovable's `matches` table |
| `pick`      | string | ✅       | `"home"`, `"draw"`, or `"away"` |
| `confidence`| number | ❌       | 0–1, e.g. `0.62`. Stored inside the reasoning text |
| `reasoning` | string | ❌       | Max 500 chars. Brief model rationale |

- Up to **200 predictions** per request.
- The endpoint **upserts** on `(match_id, predictor)`, so re-running overwrites old picks.

---

## 3. Python script

The ready-to-use script lives at:

```bash
scripts/push_predictions.py
```

### Quick start

1. **Install the only dependency**
   ```bash
   pip install requests
   ```

2. **Replace `predict()` with your real model**
   ```python
   def predict(home: str, away: str) -> tuple[str, float]:
       # Your sklearn / PyTorch / XGBoost code here
       # Return (pick, confidence)
       return "home", 0.68
   ```

3. **Update `MATCHES`**  
   Either hardcode the upcoming fixtures, or fetch them from your own database / an API.

4. **Run it**
   ```bash
   python scripts/push_predictions.py
   ```

On success you should see:
```
200 {"inserted":2}
```

---

## 4. How it works inside Lovable

1. Your script POSTs to `/api/public/quant-predictions`
2. The endpoint validates the body with **Zod**, then writes rows into the `predictions` table:
   - `predictor = "quant"`
   - `model = "local-logreg"`
3. When the app displays Quincy's card, it **reads that row first**.  
   If the row is missing, it falls back to the built-in logit formula.

---

## 5. Verifying your picks landed

After pushing, open the app and check Quincy's predictions.  
You can also query the database directly:

```sql
SELECT match_id, pick, reasoning, created_at
FROM predictions
WHERE predictor = 'quant'
ORDER BY created_at DESC;
```

---

## 6. Adding authentication (later)

Right now the endpoint has **no auth** (dev-only).  
Before going public, add a shared-secret header:

1. Store a secret in Lovable (e.g. `QUANT_PUSH_SECRET=super-secret-key`)
2. Update the route to check `request.headers.get("x-quant-secret")`
3. Add the same header in your Python script:
   ```python
   headers = {"x-quant-secret": "super-secret-key"}
   requests.post(ENDPOINT, json=body, headers=headers, timeout=15)
   ```

---

## 7. Typical workflow

```
1. Collect historical match data (World Cups, friendlies, qualifiers)
2. Engineer features: Elo diff, recent form, head-to-head, home advantage, etc.
3. Train a multinomial logistic regression (or any classifier)
4. For each upcoming match, call predict(home, away)
5. python scripts/push_predictions.py
6. Open Lovable → Quincy's predictions are live
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `400 invalid body` | Check `pick` is exactly `"home"`, `"draw"`, or `"away"` (lowercase) |
| `500` | Check the Lovable logs; usually a database connection issue |
| Predictions not showing | Make sure `match_id` matches an existing row in the `matches` table |
| Old predictions persist | That's expected — the endpoint upserts. Re-run your script to overwrite. |
