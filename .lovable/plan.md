## Goal

Add a `/personas` tab where you can edit each rival's chat persona. Edits are stored in the database and used immediately the next time the room generates replies. If a rival has no DB row, fall back to the hardcoded text in `src/lib/predictors/personas.ts`.

## Brainstorm seeds (suggested defaults in the editor)

For each rival, the textarea will be prefilled with a sharper persona than today. Same five rivals, but with:

- **Worldview** — what they believe football is
- **Obsession** — a recurring lens (numbers, dice, drama, cards…)
- **Rival** — who they bicker with in the room
- **When right / when wrong** — how they react
- **Don'ts** — guardrails to prevent drift (length, no apologies, no breaking character)

Example for Sara: *"You are Sara Statistics, a dry analyst. You believe football is mostly variance around team ratings; narrative is noise. Always cite one specific number (xG, rating diff, base rate). You bicker with Matt — he thinks his ML model invalidates classical stats. When right, you state the prior. When wrong, you blame variance, never your method. Never use exclamation marks. Max 2 sentences."*

The editor will ship these as defaults; you can rewrite any of them inline.

## Database

Migration: new table `rival_personas`.

| column | type | notes |
|---|---|---|
| `rival_id` | text PK | one of random, stats, magician, adriana, vibes |
| `persona` | text not null | the prompt body |
| `updated_at` | timestamptz default now() | bumped by trigger |

- Grants: SELECT/INSERT/UPDATE/DELETE to anon + authenticated; ALL to service_role (matches app's existing single-user open style — guesses table follows the same pattern).
- RLS enabled, two policies: anyone can read, anyone can write (consistent with `guesses`).
- Update trigger reuses existing `public.touch_updated_at()`.

## Server functions

New file `src/lib/personas.functions.ts`:

- `listPersonas()` — returns `Array<{ rival_id, persona, updated_at, isDefault }>`. Reads `rival_personas` and merges with `RIVAL_PERSONAS` so missing rows show the hardcoded default with `isDefault=true`.
- `savePersona({ rival_id, persona })` — upsert into `rival_personas`. Trims and length-checks (max ~2000 chars). Validates rival_id against `RIVAL_ORDER`.
- `resetPersona({ rival_id })` — delete the row so the code default takes over again.

## Wire into room replies

In `src/lib/room.functions.ts`, before the rival loop:

- Fetch all `rival_personas` rows in one query.
- Build `personasMap: Record<RivalId, string>` = DB row if present, else `RIVAL_PERSONAS[rivalId]`.
- Pass `personasMap[rivalId]` into `buildPrompt` instead of `RIVAL_PERSONAS[rivalId]`.

No prompt-shape change, no token impact.

## UI

New route `src/routes/personas.tsx`:

- Title "Persona Workshop" + short blurb explaining the inputs each rival receives (style, their picks, actual results, recent chat).
- For each of the 5 rivals (in `RIVAL_ORDER`):
  - Avatar + name + tagline (reuse `RIVAL_NAMES` + existing avatars from results route).
  - A `<textarea>` (10–14 rows, monospace-ish, character counter, ~2000 max) prefilled with current value.
  - "Save", "Reset to default", and a small "default" / "customized" badge.
  - Save button disabled until dirty; toast on success/failure.
- All five cards rendered in a single column on mobile, two columns on `md+`.

Add nav link "Personas" in `__root.tsx` alongside Room / Results.

## Out of scope (deliberately not in this round)

- No editing of prediction prompts in `predictors.functions.ts`.
- No global/system prompt above personas — that was option C and you picked A.
- No version history / undo beyond the single "reset to default" action.
- No auth gate (public tab, matches the rest of the app).
- No live preview of a generated message — keep the editor simple; test by going to `/room` and sending a message.

## Files

- new: `supabase/migrations/<ts>_create_rival_personas.sql`
- new: `src/lib/personas.functions.ts`
- new: `src/routes/personas.tsx`
- edit: `src/lib/room.functions.ts` (merge persona overrides into the loop)
- edit: `src/routes/__root.tsx` (nav link)
