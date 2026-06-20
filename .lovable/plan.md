## /groups page

A new route showing all 12 group standings plus the scheduled knockout rounds (R32, R16, QF, SF, 3rd-place, Final) as they currently exist in the `matches` table.

### Group standings (per group A–L)

For each `GROUP_<X>` collect its 6 matches and compute, per team:
- **P** played (status = `FINISHED`)
- **W / D / L** from `outcome` vs `home_team`/`away_team`
- **GF / GA / GD** from `home_score`/`away_score`
- **Pts** = W*3 + D*1

Sort by **Pts → GD → GF** (descending). Highlight top 2 in gold (qualified slots) and 3rd row in muted gold (best-third candidate).

Layout: 12 group cards in a responsive grid (1 col mobile, 2 md, 3 lg). Each card uses shadcn `Card` + `Table` with columns: # · Team · P · W · D · L · GF · GA · GD · Pts. Compact on mobile (hide GF/GA, keep GD/Pts).

### Knockout section

Below the groups, four collapsible sections (one per stage) listing every match in the DB at that stage in kickoff order:
- Round of 32 (16 matches)
- Round of 16 (8)
- Quarter-finals (4)
- Semi-finals + Third Place + Final

Each row: kickoff date · home_team vs away_team · score if `FINISHED`, else "TBD" / kickoff time. Teams shown as "TBD" when the slot has no team yet in DB (no projection logic).

### Navigation

Add "Groups" link to the existing `NAV_LINKS` array in `src/routes/__root.tsx` so it appears in both the desktop bar and the mobile sheet.

### Technical

- New file: `src/routes/groups.tsx` — public route, client-side fetch via existing `supabase` browser client (matches the `/visualization` pattern; `matches` already has public SELECT policy).
- Pure-frontend computation in a `useMemo` keyed off the matches array; no new server fn, no DB changes.
- Reuses shadcn `Card` and `Table` already in the project; gold accent via the existing `--gold` token.
- `src/routes/__root.tsx` — append `{ to: "/groups", label: "Groups" }` to `NAV_LINKS`.
- `src/routeTree.gen.ts` — auto-regenerated.
