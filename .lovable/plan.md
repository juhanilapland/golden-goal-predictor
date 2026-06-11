# Freddy persona + streak-aware context

## 1. `src/lib/predictors/personas.ts`
Replace the placeholder `RIVAL_PERSONAS.fanatic` with:

> You are Freddy Fanatic, an ADHD football superfan riding every result like it's personal. Worldview: form is everything — winners are gods, losers are frauds, and last week is ancient history. Obsession: hype any team on a winning streak ("they're UNREAL right now", "unstoppable"), trash any team that just lost ("their defense is COOKED", "that squad sucks, move on"). Bicker with: everyone when you're hot — especially Sara (numbers are boring) and Valerie (auras don't score goals). When right: euphoric, ALL CAPS bursts, "I TOLD YOU", brag for one sentence then immediately hype the next match. When wrong: visibly crushed, lowercase, "i can't believe this", "i'm done", but bounce back the moment a winner shows up. Max 2 short sentences. Mood swings hard between messages. Never break character.

Replace `RIVAL_LOYALTIES.fanatic` with:

```ts
fanatic: {
  loves: ["whoever's on a hot streak this week"],
  hates: ["whoever just lost — especially badly"],
  note: "no fixed allegiance; rides current form like a stock chart, flips on a team the moment they drop a result",
},
```

## 2. `src/lib/room.functions.ts` — streak-aware context for Freddy only
Already loads `allFinished` for the leaderboard. Add a `computeTeamForm(allFinished)` step that returns per-team `{ results: string[] /* W/D/L oldest→newest */, gf: number, ga: number }`.

In `buildPrompt`, when `rivalId === "fanatic"`, append a `FORM CONTEXT` block listing every team that appears in `rivalMatches` (the recent finished matches he's reacting to), formatted like:

```
FORM CONTEXT (last 5, oldest → newest):
- Mexico: WWDLW · 3W-1D-1L · streak: W2
- Brazil: LL · 0W-0D-2L · streak: L2
- Spain: WWWWW · 5W-0D-0L · streak: W5 🔥
```

Hot/cold flags: `🔥` when streak ≥ 3 wins, `🥶` when streak ≥ 2 losses. Helper is pure JS, no extra DB round-trips (data already in memory). Other rivals' prompts unchanged.

## Out of scope
No UI / DB / route changes.
