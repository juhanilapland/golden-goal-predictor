## Problem

Game 1 should display **22:00** and game 2 **05:00** in your local timezone, but the UI shows **04:00** / **11:00** because the kickoff is being timezone-shifted twice:

1. The DB migration I ran earlier added **+3 hours** to every `matches.kickoff` row (19:00 UTC → 22:00 UTC).
2. The UI in `src/routes/index.tsx:148` and `src/routes/results.tsx:441` also adds a hardcoded **+3 hours** before formatting:
   ```ts
   const kickoff = new Date(new Date(match.kickoff).getTime() + 3 * 60 * 60 * 1000);
   ```
3. `toLocaleTimeString("en-GB", …)` then applies the **browser's local timezone** on top of that.

Net effect: the offset is applied two or three times depending on viewer TZ. The real fixture kickoff for Mexico–South Africa is 19:00 UTC, which is naturally 22:00 in UTC+3.

## Fix

**1. Revert the DB shift** (back to the real UTC kickoffs from the football-data feed):
```sql
UPDATE public.matches SET kickoff = kickoff - interval '3 hours';
```

**2. Remove the hardcoded `+3h` in both UI files** so we trust the browser's timezone conversion:
- `src/routes/index.tsx:148` → `const kickoff = new Date(match.kickoff);`
- `src/routes/results.tsx:441` → `const kickoff = new Date(m.kickoff);`

The existing `toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })` will then display in the viewer's local timezone correctly: 22:00 / 05:00 for UTC+3 viewers, the right local times for everyone else.

## Why this is the right shape

Storing real UTC and converting on display is the standard approach: viewers in any timezone see correct local times automatically, and the sync job that writes `m.utcDate` from football-data stays consistent (no drift if it re-runs).
