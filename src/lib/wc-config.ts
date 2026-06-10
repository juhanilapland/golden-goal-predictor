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
