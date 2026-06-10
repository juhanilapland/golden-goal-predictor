# Refine Match Card Design

Keep the established gold-on-dark luxury theme, Cinzel display type, and horizontal row layout. Tighten visual hierarchy, increase polish, and make the cards feel like collectible programme entries.

## Scope

Two surfaces:
1. `MatchRow` on `/` (Guess page) — picks UI
2. The collapsed match row on `/results` — score + expand

Out of scope: leaderboard table, persona workshop, expanded reasoning rows, color palette / font changes.

## Visual changes

### Match row card (`/`)
- Reframe each card as a "stadium ticket" still in a single horizontal row:
  - Left **kickoff stub** with vertical divider (date stacked, time large in Cinzel gold, EEST tag, group chip, rivals-locked pill with a small lock/check icon — 0/5 dim, 5/5 glows).
  - Center **matchup**: bigger flags (56px) with a soft gold ring + drop shadow, team names in Cinzel medium, an ornate `vs` glyph (small gold serif "·VS·" between two thin gold rules) instead of plain text.
  - Right **pick cluster**: Home / Draw / Away buttons get a connected segmented-control look (shared border, no gap), active state uses gold gradient fill + inset shadow, locked state shows a subtle padlock glyph and removes hover.
- Add a thin gold top accent line on cards where the user has locked a pick (visual confirmation).
- Hover: card lifts (translate-y-[1px] → -1px), gold border brightens, soft outer glow.
- Knockout matches get a small "KO" gilded chip in the corner.

### Results match row (`/results`)
- Same stub treatment on the left for stage + group.
- Replace plain `▾ / ▸` with a gold chevron icon that rotates on open.
- Score block: bold Cinzel score (e.g. `2–1`) with a thin gold underline, "FT" tag underneath when finished; for upcoming, show a muted dash.
- Subtle alternating row background (even rows `bg-card`, odd rows `bg-card/60`) so the long list scans easier.
- Open state: top border becomes solid gold for the open row.

### Shared polish
- Add a reusable `card-elevated` utility in `src/styles.css` for the lift/glow.
- Add a `segmented` utility for the connected pick buttons (shared border + dividers).
- Add a `chip-gold` utility for the small KO / group / rivals badges.

## Mobile (360px)
- Date stub collapses to a single line above the matchup; pick segmented control stretches full-width below.
- Flags stay 44px on mobile to keep team names readable; use `min-w-0` + `truncate` on team labels.
- Results row: chevron stays right-aligned, score stays compact (~56px column).

## Technical notes
- Edits in `src/routes/index.tsx` (`Flag`, `PickButton`, `MatchRow`) and `src/routes/results.tsx` (collapsed row only).
- New utilities + tiny keyframe for the locked-pick accent line in `src/styles.css`.
- Use existing `--gold`, `--gold-dim`, `--gold-deep` tokens — no new colors.
- Icons: small inline SVGs (lock, check, chevron) — no new dependency.

## Acceptance
- Cards have clear three-zone rhythm (stub · matchup · picks) at ≥640px.
- Locked picks visually distinct from open ones at a glance.
- No layout regression at 360px (no horizontal scroll, no clipped team names).
- All existing functionality preserved (pick saving, rival generation, expand/collapse, score display).
