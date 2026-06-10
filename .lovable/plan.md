# World Cup 2026 Match Guesser — Plan

A personal, single-user app to pick winners for every WC 2026 match, auto-fetch real results, and tally points.

## Stack & data
- TanStack Start + Lovable Cloud (Postgres) for storing your guesses and cached fixtures.
- Live fixtures/results from **football-data.org v4** (free tier covers WC). Requires one API key stored as `FOOTBALL_DATA_TOKEN` secret. If you prefer api-football/SportMonks, swap the fetcher — same shape.
- Lovable Auth (magic link) gating the whole app so only you can submit picks. Single account.

## Pages
1. **`/` — Guess page**
   - Grouped by stage (Group A–L, R32, R16, QF, SF, 3rd-place, Final).
   - Each match: flag + country name (home), vs, flag + country (away), kickoff time, three big pick buttons (Home / Draw / Away). Draw disabled in knockout matches.
   - Your saved pick is highlighted; locks once kickoff time passes.
   - "AI pick" column shown as `—` placeholder (filled later).
2. **`/results` — Results & scoreboard**
   - Top: total score (You). AI column present but empty for now.
   - Per-match breakdown table: match, your pick, AI pick (—), actual result, points earned, stage weight badge.
   - Filter by stage; show accuracy %.

## Scoring (weighted by stage)
Group 1 · R32 2 · R16 3 · QF 5 · SF 8 · 3rd-place 8 · Final 13. Awarded only when actual outcome matches pick.

## Backend pieces
- **DB tables** (`matches`, `guesses`, `predictions`) with RLS scoped to your user id.
  - `matches`: id, stage, group, kickoff, home_team, away_team, home_flag, away_flag, status, home_score, away_score, outcome.
  - `guesses`: user_id, match_id, pick ('home'|'draw'|'away'), created_at.
  - `predictions` (AI slot): match_id, pick, reasoning, model.
- **Server functions** (`src/lib/wc.functions.ts`):
  - `listMatches()` — reads from `matches`, joined with your guess.
  - `savePick({matchId, pick})` — upsert, rejects if kickoff passed.
  - `getScore()` — computes total + per-match points.
- **Sync route** `POST /api/public/sync-fixtures` — calls football-data.org `/competitions/WC/matches`, upserts into `matches`, recomputes outcomes. Protected by an `X-Sync-Secret` header. Trigger manually from a button on `/results` ("Refresh fixtures & results") and optionally by external cron later.

## Country flags
Use `https://flagcdn.com/w80/{iso2}.png` derived from team code returned by the API — no asset bundling needed.

## Style — dark & golden
- Background `oklch(0.16 0.02 260)` near-black with subtle radial gold glow.
- Primary gold `oklch(0.82 0.16 85)`, accent deep gold `oklch(0.68 0.18 70)`.
- Display font: Cinzel (championship feel); body: Inter.
- Cards: dark surface, 1px gold border, soft gold shadow on hover.
- Pick buttons: outlined gold → filled gold when selected; tie button uses muted gold.

## AI slot (future-ready, not built now)
Schema, UI column, and scoreboard row exist but inert. Adding AI later = one server function that calls Lovable AI Gateway and writes to `predictions`.

## Open items needing your input during build
1. **football-data.org token** — I'll request it via the secret prompt once we start.
2. **Auth**: confirm magic-link email is fine (vs. a simple hardcoded passcode).
3. **Initial fixtures**: if the API doesn't yet expose WC 2026 fixtures on the free tier at build time, I'll seed the 48 teams + group-stage schedule from a static JSON fallback and let the sync route overwrite once live.

---

### Technical details
- Lovable Cloud for DB/auth; `requireSupabaseAuth` middleware on all server fns.
- `matches` table public-readable to authed user; `guesses` RLS `user_id = auth.uid()`.
- Route tree: `src/routes/index.tsx` (guess), `src/routes/results.tsx`, `src/routes/api/public/sync-fixtures.ts`.
- Outcome derived: `home_score > away_score` → 'home', `<` → 'away', `=` → 'draw'; only set when `status='FINISHED'`.
- Pick lock check uses server time, not client.