## Game Room

A single global chat room on a new `/room` route. You post first; the 5 rivals reply one after another with short staggered delays. Each rival has a written persona prompt and uses Lovable AI to generate their message based on the recent match results, their own picks vs actual outcomes, and the current chat transcript.

### 1. Database

New migration:
- `chat_messages` table: `id uuid pk`, `author text not null` (one of `juhani`, `random`, `stats`, `magician`, `adriana`, `vibes`), `body text not null`, `created_at timestamptz default now()`.
- Index on `created_at`.
- Open RLS (matches the single-user style of `guesses`): anyone can read, anyone can insert. No update/delete from client.
- Enable Realtime on the table so new messages stream in live.

### 2. Personas

Add `persona` (and keep existing `tagline`) on each rival. Each persona is a short paragraph telling the AI how that rival writes:

- **Richard Random** — chaotic, blames/credits luck, dice metaphors, sometimes types in ALL CAPS one word.
- **Sara Statistics** — dry, precise, cites ratings and historical patterns, ends with a probability or number.
- **Matt Magician** — cocky data-scientist energy, drops "the model said", logits/probabilities, mild gloating when right.
- **Adriana Idriano** — pundit on a sports panel, dramatic one-liners, Italian/Spanish football clichés, witty.
- **Valerie Vibes** — mystical, lowercase, emojis, talks about auras/tides/cards, never admits being wrong.

Stored in code (`src/lib/predictors/personas.ts`) so the source of truth is versioned, not in the DB.

### 3. Reply trigger and staggering

When you submit a message in the room:
1. Insert your message immediately.
2. Server fn `generateRoomReplies({ sinceMessageId })` runs the 5 rivals **sequentially** with a small randomized delay (1.5–4s) between each. Each insert lands in `chat_messages` and the UI receives it via Realtime, so it feels like they're typing in.
3. Replies are deduped: if rivals already replied to the most recent user message, the trigger is a no-op (prevents double-fire on reload).

Rate limit: the room is locked from sending a new user message until all rivals have replied to the previous one (UI shows "rivals replying…").

### 4. Per-rival AI input

For each rival, the prompt is built from:
- **My style**: their persona paragraph.
- **My guess**: their pick rows from `predictions` for the latest N finished matches, with reasoning.
- **Actual result**: home/away score, outcome, and points they earned for each of those matches.
- **Current chat messages**: last ~20 messages in the room, formatted as `name: body`.

Then: "Write your next message in the chat (max 2 sentences, in character). Do not prefix with your name."

Model: `google/gemini-2.5-flash`. JSON response with `{ message: string }` so we can sanity-check length and strip accidental name prefixes. Fallback on AI failure: skip that rival's turn (don't insert a "(AI unavailable)" line — keeps the room clean).

### 5. UI

New route `src/routes/room.tsx`:
- Header with link back to `/` and `/results`.
- Scrollable message list, bubbles with avatar + name. Your messages right-aligned in gold; rivals left-aligned.
- Composer at the bottom: textarea + Send button. Disabled while rivals are replying; shows a "Adriana is typing…" indicator cycling through the pending rivals.
- Auto-scroll to bottom on new message.
- Empty state: a small note "Drop your hot take. The rivals will chime in."

Add a "Game room" nav link on `/` and `/results`.

### 6. Technical details

- **New files**:
  - `src/lib/predictors/personas.ts` — persona text per rival.
  - `src/lib/room.functions.ts` — `generateRoomReplies` server fn.
  - `src/routes/room.tsx` — chat UI with Realtime subscription.
- **Migration**: `chat_messages` table with open RLS + grants + add to `supabase_realtime` publication.
- **Server fn flow** (`generateRoomReplies`):
  1. Load last 20 chat messages.
  2. Find the most recent user (`juhani`) message; if every rival already has a message after it → return.
  3. Load the latest ~5 finished matches with each rival's prediction and the actual outcome (single query joining `matches` + `predictions`).
  4. For each rival in fixed order (random, stats, magician, adriana, vibes), build the prompt, call gateway, insert message, await randomized delay before the next.
- **Realtime**: subscribe in `room.tsx` to `chat_messages` inserts; append to local state.
- **Trigger**: client calls `generateRoomReplies` after inserting the user message (fire-and-forget; the response trickles in via Realtime).
- **Reuses** existing Lovable AI Gateway pattern already in `predictors.functions.ts`.

### 7. Out of scope

- No threading/quoting individual messages.
- No editing or deleting messages.
- Juhani is the only human author; no auth/profiles needed (matches the rest of the app).
- No notifications when you're not on `/room`.
