## Plan

### 1. New route `/visualization`
Create `src/routes/visualization.tsx` showing a single line chart with one line per predictor tracking cumulative correct picks over completed matches.

**Data**: new server fn `getPredictorScoreSeries` in `src/lib/predictors.functions.ts`:
- Fetch all predictors, all `matches` where `status = 'FINISHED'` ordered by kickoff asc, and all `predictions` for those matches.
- For each completed match (index 1..N), compute per-predictor cumulative correct count. A prediction is correct when `predictions.pick === matches.outcome` (`'home' | 'draw' | 'away'`).
- Return `{ matches: [{ idx, label: "MatchN" or short "HOME-AWAY", kickoff }], series: [{ predictorId, name, color, points: number[] }] }`.

**Chart**: use existing Recharts (`ChartContainer` + `LineChart`) since it's already in the project. One `<Line>` per predictor; gold-themed grid, tooltip shows match label + each predictor's running score. Colors assigned from a small palette cycled by predictor sort_order.

**Route shape**: loader uses `ensureQueryData` → component uses `useSuspenseQuery`. Includes `errorComponent` + `notFoundComponent`. Head meta: title "Score Progression — WC26 Guesser".

Empty state: if no finished matches yet, show "No completed matches yet — chart will populate as results come in."

### 2. Mobile nav — hamburger drawer
Edit `src/routes/__root.tsx` `NavBar`:
- Keep the WC 26 brand on the left.
- On `sm:` and up: existing horizontal links unchanged, plus a new "Chart" link to `/visualization`.
- On mobile (`<sm`): hide the link row; show a hamburger button on the right that opens a `Sheet` (shadcn, already installed) sliding from the right.
- Drawer contents: vertical large-tap-target gold-styled links (Guess, Room, Results, Personas, Chart), close on navigation. Active link uses `--gold`.
- Add `/visualization` link to the desktop row too.

### 3. Files touched
- new: `src/routes/visualization.tsx`
- edited: `src/lib/predictors.functions.ts` (add `getPredictorScoreSeries`)
- edited: `src/routes/__root.tsx` (hamburger drawer + Chart link)
- auto-regenerated: `src/routeTree.gen.ts`

### Notes
- No DB schema changes; reads only via existing public SELECT policies.
- Scoring rule: +1 per correct pick, draws only count for group stage where allowed picks include draw (matches the existing prediction validation).
