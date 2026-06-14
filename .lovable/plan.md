## Goal
Three focused UI tweaks to `/room`. No business logic, no backend changes.

## 1. Open the room scrolled to the bottom
On first load (after messages arrive), jump the scroll container straight to the bottom — no animation, no flicker. Track a `hasDoneInitialScroll` ref so this only happens once per mount.

## 2. Keep the first new reply pinned at the top while rivals stream in
Today, every realtime insert auto-scrolls to the bottom, so each new rival reply yanks the view down and Juhani loses the first answer. New behavior:

- When Juhani sends a message: scroll to the bottom once so his own message is visible, then enter a "reading replies" mode.
- While in "reading replies" mode (i.e. `pendingRivals.length > 0` OR a rival reply arrived in the last few seconds after Juhani's send), do NOT auto-scroll on new inserts. The first rival reply lands just under Juhani's message and stays put as later replies append below.
- Exit "reading replies" mode when all 7 rivals have replied (or a short idle timeout passes). After that, fall back to the existing "stick to bottom if user is already near bottom" behavior for future activity.
- Keep the existing realtime subscription untouched.

Edge case: if the user manually scrolls during streaming, respect their position (don't fight them).

## 3. Unique color per guesser
Add a stable accent color for each of the 8 chat participants (Juhani + 7 rivals). Used for:

- The avatar ring (replaces the current uniform `--gold-deep` ring).
- The author name label above each bubble.
- A 2px left border accent on rival bubbles (Juhani keeps his filled gold bubble as the "me" treatment).

Palette (distinct hues, all readable on the dark card background):

| id       | name              | hue        |
|----------|-------------------|------------|
| juhani   | Juhani            | gold (existing) |
| random   | Richard Random    | crimson    |
| stats    | Sara Statistics   | steel blue |
| magician | Matt Magician     | violet     |
| adriana  | Adriana Idriano   | tomato red |
| vibes    | Valerie Vibes     | mint/teal  |
| fanatic  | Freddy Fanatic    | orange     |
| quant    | Quincy Quant      | slate cyan |

Colors are added as CSS custom properties in `src/styles.css` (e.g. `--rival-random`, `--rival-stats`, …) using `oklch` to match the existing palette style. A small `RIVAL_COLORS` map in `src/lib/predictors/personas.ts` maps each id to its CSS var name so components can read it. Juhani uses the existing `--gold`.

## Files touched
- `src/routes/room.tsx` — scroll logic (1 + 2), apply per-author color to ring/label/left-accent.
- `src/styles.css` — add 7 `--rival-*` color tokens.
- `src/lib/predictors/personas.ts` — add `RIVAL_COLORS` map.

## Not in scope
Roster strip, typing-queue avatars, unlock composer, hovercards, fixture cards, reactions, header upgrade — all deferred from the earlier UI plan. This change is strictly the three items requested.
