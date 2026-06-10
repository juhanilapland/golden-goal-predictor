## Goal

Make the rivals talk about **every match finished since the last chat activity**, instead of always the latest 5 finished matches. This fits the "extract results once per day → several matches at once" flow.

## Change

Single file: `src/lib/room.functions.ts`, inside `generateRoomReplies`.

### New logic for the "recent matches" load

1. Determine `sinceTs`:
   - If the chat has at least one message before the new juhani message → use `created_at` of the chat message immediately preceding it.
   - If juhani's message is the very first in the room → use `now() - 7 days` (sensible cold-start window).
2. Query `matches`:
   - `status = 'FINISHED'`
   - `updated_at > sinceTs`
   - order by `kickoff` ascending (chronological story of the day)
   - limit 20 (safety cap for huge sync days)
3. Fallback: if that query returns **zero** rows, load the latest 3 finished matches (ordered by kickoff desc, then reversed to asc) so the room still has something to riff on during quiet days.
4. Load predictions for those match ids exactly as today.

### Prompt tweak

In `buildPrompt`, change the section header from
`Recent finished matches and how you did:`
to
`Matches finished since the last chat (chronological):`
when we're in the "new since last chat" branch, and keep the old wording for the fallback branch. Keeps the model grounded in what's actually new vs. old context.

## Out of scope

- No DB changes (`matches.updated_at` and `chat_messages.created_at` already exist).
- No UI changes.
- No token/cost logging (deferred per your call).
- No change to the 20-message chat-transcript window or persona files.

## Technical notes

- `sinceTs` is computed from the in-memory `chat` array we already load (last 20 messages, ascending). Index of the last juhani message is already known as `lastJuhaniIdx`; predecessor is `chat[lastJuhaniIdx - 1]`. If `lastJuhaniIdx === 0`, use the 7-day fallback.
- Reuse the existing `MatchWithPreds` shape; only the source query changes.
- Keep the existing dedupe/rate-limit and per-rival staggered insert loop unchanged.
