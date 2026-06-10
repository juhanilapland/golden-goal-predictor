# Results Page Redesign

Tell one clear story: **who is winning and by how much**. Stack the content top to bottom — podium first, then a scannable match list with every rival's pick visible inline.

## Scope

Rework `src/routes/results.tsx`. Keep the data model, server functions, palette, and typography. Add a few CSS utilities to `src/styles.css` if needed.

Out of scope: persona workshop, guess page, new server functions, leaderboard logic changes (still points + correct count).

## Section 1 — Hero leaderboard ("the podium")

Replace the current 4-column table.

- **Top row**: three podium tiles for ranks 1–3, sized 2 / 3 / 1 visually (gold center, silver left, bronze right) on `md+`. Stack vertically on mobile in 1-2-3 order. Each tile shows:
  - Big avatar (80px) with rank medal overlay
  - Rival name (Cinzel) + tagline
  - Points (huge gold Cinzel) and "X / Y correct" underneath
  - Gap row: "+N pts ahead" for #1, "−N from #1" for #2/#3
  - Highlight Juhani's tile with a subtle "YOU" chip when in top 3
- **Below podium**: compact ranked rows for the remaining rivals (4th–6th). Same row anatomy as today but slimmer: rank, avatar, name, accuracy %, points, gap-from-leader.
- **Header strip**: `N played · M to play · Σ points awarded` summary line in muted small caps.

## Section 2 — Stage filter

Keep current pill row. Move it above the match list. No visual change.

## Section 3 — Match list with always-visible pick grid

Replace the click-to-expand row with a denser card per match. Each card is one horizontal row at `md+`, two-line stack on mobile.

Per match row:
- **Left**: kickoff time stub (same treatment as the index page card) + stage chip + group chip
- **Center**: `Home — score — Away` matchup. Score in gold Cinzel when finished, em-dash when upcoming, status tag otherwise. Tiny FT / LIVE chip.
- **Right**: a 6-cell pick grid (one cell per rival, fixed order matching the leaderboard). Each cell:
  - Avatar (24px) on top
  - Pick pill below (`H` / `D` / `A`)
  - Green ring + check overlay if correct, red ring + strike if wrong, dim if no pick, neutral if upcoming
  - Title attribute = `"{Rival name}: {pick} — {reasoning or actual}"` for hover/tap detail
- **Far right**: points awarded this match for the leader (small gold number) — optional, only when finished.

On mobile (<640): the pick grid wraps under the matchup as a 6-column row, avatars shrink to 20px, names hidden, pick letters readable.

No expand/collapse needed — everything fits inline. Tapping an avatar opens a small inline tooltip/popover with the reasoning text (use a simple controlled state, one open at a time).

## Section 4 — Empty / loading states

- Loading: keep "Loading…"
- No finished matches yet: show a friendly hero card ("Tournament hasn't kicked off — picks lock as matches play") with disabled-looking podium silhouettes instead of zeros everywhere.

## Visual treatment

- Reuse existing tokens: `--gold`, `--gold-dim`, `--gold-deep`, `--card`, `--muted`.
- New utilities (`src/styles.css`):
  - `medal-gold`, `medal-silver`, `medal-bronze` — small circular rank badge with metallic gradient
  - `pick-cell-correct`, `pick-cell-wrong`, `pick-cell-pending` — applied to the pick grid cells
- Podium gold tile gets the existing `locked-accent` top stripe + a stronger outer glow.
- Keep "Generate missing picks" button in header but de-emphasize it (ghost variant) — it's an admin action, not the story.

## Mobile (360px)

- Podium tiles stack full width, rank #1 first.
- Summary strip wraps to two lines if needed.
- Match card stacks: stub line → matchup line → 6-cell pick row (`grid-cols-6`).
- No horizontal scroll.

## Acceptance

- A first-time visitor instantly knows who is in 1st and by how many points.
- For any played match, you can see all 6 picks and who got it right without clicking.
- Page works at 360px with no overflow.
- All existing data wiring preserved (no schema or server-function changes).
