## Update `/api/public/quant-predictions` to accept top-level `model`

Single-file change to `src/routes/api/public/quant-predictions.ts`.

### Schema change
Extend the Zod body schema to require a top-level `model` string alongside the existing `predictions` array:

```ts
const BodySchema = z.object({
  model: z.string().min(1).max(200),
  predictions: z.array(...).min(1).max(200),
});
```

### Row mapping change
When building rows for upsert, use the posted `model` instead of the hardcoded `"local-logreg"`:

```ts
const rows = parsed.data.predictions.map((p) => ({
  match_id: p.match_id,
  predictor: "quant",
  pick: p.pick,
  reasoning: `${p.reasoning ?? "Local logistic regression."}${conf}`.slice(0, 500),
  model: parsed.data.model,
  prob_home: p.prob_home ?? null,
  prob_draw: p.prob_draw ?? null,
  prob_away: p.prob_away ?? null,
}));
```

### Already correct, no change needed
- Upsert already uses `onConflict: "match_id,predictor"` — the unique index guarantees existing fallback Quincy rows (which were inserted with `predictor='quant'` by `pickQuantFallback`) get overwritten by the pushed real predictions on conflict.
- Only `quant` rows are touched (predictor is hardcoded per-row).
- `prob_home/draw/away` already saved.
- Other predictors, `predictors.functions.ts` fallback path, and the Python script remain untouched.

### Out of scope
- No DB migration (unique constraint already exists).
- No changes to fallback logic in `predictors.functions.ts` — it keeps generating placeholder Quincy picks until a POST overwrites them.
- No auth added (still dev-only per original plan).
