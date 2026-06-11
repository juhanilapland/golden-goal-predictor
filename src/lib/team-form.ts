// Pure helper: compute points-per-game from a team's recent FINISHED matches.
// Used by the Quant predictor's logistic-regression form feature.

export type FormRow = {
  home_team: string;
  away_team: string;
  outcome: string | null;
  kickoff: string;
};

const DEFAULT_PPG = 1.5; // league-average-ish fallback when insufficient history

export function computeForm(results: FormRow[], team: string, lastN = 5): number {
  const relevant = results
    .filter((r) => r.home_team === team || r.away_team === team)
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, lastN);
  if (relevant.length < 2) return DEFAULT_PPG;
  let pts = 0;
  for (const r of relevant) {
    const isHome = r.home_team === team;
    if (r.outcome === "draw") pts += 1;
    else if (isHome && r.outcome === "home") pts += 3;
    else if (!isHome && r.outcome === "away") pts += 3;
  }
  return pts / relevant.length;
}
