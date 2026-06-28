export type Stage =
  | "GROUP_STAGE"
  | "LAST_32"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type Pick = "home" | "draw" | "away";

export const STAGE_WEIGHTS: Record<string, number> = {
  GROUP_STAGE: 1,
  LAST_32: 2,
  LAST_16: 3,
  QUARTER_FINALS: 5,
  SEMI_FINALS: 8,
  THIRD_PLACE: 8,
  FINAL: 13,
};

export const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Group Stage",
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals",
  THIRD_PLACE: "Third Place",
  FINAL: "Final",
};

export const STAGE_ORDER: string[] = [
  "GROUP_STAGE",
  "LAST_32",
  "LAST_16",
  "QUARTER_FINALS",
  "SEMI_FINALS",
  "THIRD_PLACE",
  "FINAL",
];

export function isKnockout(stage: string): boolean {
  return stage !== "GROUP_STAGE";
}

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function stageWeight(stage: string): number {
  return STAGE_WEIGHTS[stage] ?? 1;
}

export function outcomeFromScore(home: number | null, away: number | null): Pick | null {
  if (home == null || away == null) return null;
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

/**
 * Default stage to surface in the UI. We intentionally hide the group stage
 * by default and show the earliest knockout stage that still has unfinished
 * matches. Once every match in that stage is FINISHED, the next stage takes
 * over automatically.
 */
export function defaultActiveStage(
  matches: { stage: string; status: string }[],
): string {
  const knockout = STAGE_ORDER.filter((s) => s !== "GROUP_STAGE");
  for (const s of knockout) {
    const inStage = matches.filter((m) => m.stage === s);
    if (inStage.length === 0) continue;
    const allFinished = inStage.every((m) => m.status === "FINISHED");
    if (!allFinished) return s;
  }
  // Everything knockout-wise is done (or not loaded yet) → pick the latest
  // knockout stage that exists, falling back to LAST_32.
  const latestWithMatches = [...knockout]
    .reverse()
    .find((s) => matches.some((m) => m.stage === s));
  return latestWithMatches ?? "LAST_32";
}
