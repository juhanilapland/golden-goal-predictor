# Game Room — chat quality analysis & improvement plan

## What Juhani actually writes

Across the 7 messages he's sent, Juhani does three things:

1. **Asks direct match questions** — "Who will win Mexico or South Africa?", "What about the next two games?", "Canada or Bosnia-Herzegovina?"
2. **Shares his own result** — "Got the first two correct 🙂", "A first miss 😢"
3. **Shares a feeling about a result** — "Disappointing draws for Brazil and Switzerland"

He is short, friendly, and usually addresses the room as a person, not a leaderboard.

## What the AI actually does

Reading the transcript, the rivals have one mode: **stand in a circle and dunk on each other about Brier scores**. Concretely:

- **They don't answer his questions.** When he asks "Mexico or South Africa?", only Sara gives a pick. When he asks about "the next two games", nobody names a game. When he asks "Canada or Bosnia?", nobody picks either side — every rival pivots to a Brier/Elo squabble.
- **They don't react to him.** "A first miss 😢" gets zero empathy or even acknowledgement; Random tells him the universe owes him nothing, everyone else talks about their own accuracy.
- **They talk to each other, not to him.** Almost every line addresses "Sara", "Matt", or "Richard". Juhani is rarely named or addressed.
- **They repeat themselves verbatim.** Vibes uses the identical "mercury must have intervened, blurring the auric readings" line in two consecutive rounds. Fanatic posts "two straight losses, leaderboard is a joke, I'm done" twice — and then a round later claims "two wins in a row!" with no awareness of the contradiction.
- **Persona tics dominate.** Adriana opens almost every message with "Madonna mia". Quant only ever says "log-loss / posterior / Brier". Magician's every line is "Sara, … Richard, …".
- **Order is fixed and obvious.** Random → Sara → Matt → Adriana → Vibes → Fanatic → Quant, every single round. It reads as scripted, not as a room.
- **Quant has no opinions.** He references matches abstractly ("the Brazil pick") because the prompt never tells him *which* upcoming fixture is being discussed or what his own pick was.

The root cause is in `src/lib/room.functions.ts` → `buildPrompt`: the prompt gives each rival the leaderboard, recent finished matches, their own past picks, and the chat — but **no upcoming fixtures, no upcoming-fixture picks, no intent classification of Juhani's last message, and no anti-repetition guardrails.** So the model defaults to "react to the leaderboard and bicker."

## Plan

### 1. Make rivals answer Juhani's question

In `generateRoomReplies`, before building prompts:

- Pull the **next ~5 upcoming fixtures** (`status != 'FINISHED'`, ordered by `kickoff`) and each rival's prediction row from `public.predictions` for those fixtures.
- Lightly classify Juhani's last message:
  - mentions team name(s) from upcoming fixtures → **match question**
  - contains "I got" / "miss" / "correct" / emoji 🙂/😢 → **personal result**
  - otherwise → **small talk**
- Add a `JUHANI'S LAST MESSAGE` block to the prompt with the classification + matched fixture(s) + this rival's own pick & reasoning for them.
- Add an instruction: *"If Juhani asked about a specific match, your FIRST sentence must give your pick for that match (in character). If he shared a result, acknowledge it before anything else."*

### 2. Stop the leaderboard monologue from dominating

- Demote the leaderboard block to a short one-liner ("You're 3rd, 2 behind Sara").
- Add: *"Do not lecture about Brier score, log-loss, or your rank unless Juhani brought it up."*
- Cap to **2 short sentences** (already in prompt) and **forbid naming another rival in every message** — at most one namedrop per reply.

### 3. Kill the repetition

- Pass each rival their **own last 3 messages** verbatim and instruct: *"Do not reuse any phrase, opener, or sentence structure from these."*
- Quant fallback message ("Inference timeout; deferring to the prior") is currently used as his real reply when the gateway fails — it reads as in-character but is actually an error. Either rotate it across 3 variants or skip insertion entirely on failure.

### 4. Fix continuity

- Tell Fanatic his **actual current streak** ("you are on a 2-match WIN streak — be smug, not sulking"). Right now the streak data exists in `standings[].streak` but the persona doesn't have a rule forcing him to honour it.

### 5. Vary the cadence

- Shuffle `todo` order each turn (currently fixed `RIVAL_ORDER`).
- Optionally only reply with **3–5 random rivals** per message instead of all 7, so the room doesn't feel like a script. Always include the rival(s) whose upcoming pick is most relevant to Juhani's question.

### 6. Persona-specific small fixes

- Adriana: ban "Madonna mia" as an opener more than once per 5 messages.
- Vibes: ban the literal "mercury" / "auric readings" phrases on consecutive turns.
- Quant: when a fixture is named, surface his stored `prob_home/draw/away` and reasoning so he can say something concrete like *"Canada 0.58 / draw 0.25 / Bosnia 0.17 — I'm on Canada, low confidence."*

### 7. UI polish (small)

- The "X is typing…" indicator already cycles through `pendingRivals[0]`; keep, but also show **who has replied so far** as small avatar dots so the wait feels intentional rather than slow.
- Optional: a "@mention" affordance so Juhani can address one rival directly, which then biases the prompt to make that rival lead.

## Technical scope

Files touched:

- `src/lib/room.functions.ts` — prompt building, fixture/pick fetch, intent classification, anti-repetition, shuffled order, optional subset of rivals.
- `src/lib/predictors/personas.ts` — minor persona text edits (opener bans, namedrop cap).
- `src/routes/room.tsx` — small UI: replied-so-far dots, optional @mention.

No DB schema changes. No new endpoints.

## What I'd ship first (minimal high-impact slice)

If you want a single-PR version: just **(1) + (3) + shuffled order from (5)**. That alone fixes "they never answer me" and "they keep repeating themselves", which are the two things most visible in the transcript.