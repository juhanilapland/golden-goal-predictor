import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  STAGE_ORDER,
  stageLabel,
  stageWeight,
  outcomeFromScore,
  type Pick,
} from "@/lib/wc-config";

type Match = {
  id: number;
  stage: string;
  group_name: string | null;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_code: string | null;
  away_code: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
};


export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Results — WC 2026" },
      { name: "description", content: "Score, leaderboard, and per-match breakdown." },
    ],
  }),
  component: ResultsPage,
});

const pickLabel: Record<Pick, string> = { home: "Home", draw: "Draw", away: "Away" };

function pickDot(pick: Pick | null | undefined, correct?: boolean | null) {
  if (!pick) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded text-xs font-display tracking-wider uppercase",
        correct === true && "bg-[--gold] text-[--primary-foreground]",
        correct === false && "bg-destructive/20 text-destructive-foreground/80 line-through",
        correct == null && "bg-muted text-[--gold-dim]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {pickLabel[pick]}
    </span>
  );
}

function ResultsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [guesses, setGuesses] = useState<Record<number, Pick>>({});
  const [predictions, setPredictions] = useState<Record<number, Pick>>({});
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: g }, { data: p }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: true }),
      supabase.from("guesses").select("match_id, pick"),
      supabase.from("predictions").select("match_id, pick"),
    ]);
    setMatches((m ?? []) as Match[]);
    const gm: Record<number, Pick> = {};
    (g ?? []).forEach((row) => (gm[row.match_id] = row.pick as Pick));
    setGuesses(gm);
    const pm: Record<number, Pick> = {};
    (p ?? []).forEach((row) => (pm[row.match_id] = row.pick as Pick));
    setPredictions(pm);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const list = matches.map((m) => {
      const actual =
        m.outcome ??
        (m.status === "FINISHED"
          ? outcomeFromScore(m.home_score, m.away_score)
          : null);
      const yourPick = guesses[m.id];
      const aiPick = predictions[m.id];
      const weight = stageWeight(m.stage);
      const yourPts = actual && yourPick === actual ? weight : 0;
      const aiPts = actual && aiPick === actual ? weight : 0;
      const yourCorrect = actual ? yourPick === actual : null;
      const aiCorrect = actual ? aiPick === actual : null;
      return { m, actual, yourPick, aiPick, weight, yourPts, aiPts, yourCorrect, aiCorrect };
    });
    return list;
  }, [matches, guesses, predictions]);

  const totals = useMemo(() => {
    let you = 0, ai = 0, finished = 0, youRight = 0, aiRight = 0;
    for (const r of rows) {
      if (r.actual) {
        finished += 1;
        you += r.yourPts;
        ai += r.aiPts;
        if (r.yourCorrect) youRight += 1;
        if (r.aiCorrect) aiRight += 1;
      }
    }
    return { you, ai, finished, youRight, aiRight };
  }, [rows]);

  const visibleRows =
    stageFilter === "ALL" ? rows : rows.filter((r) => r.m.stage === stageFilter);

  const availableStages = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl sm:text-5xl gold-text">Results</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {totals.finished} match{totals.finished === 1 ? "" : "es"} played.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="gold-border bg-card rounded-lg p-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">You</div>
          <div className="text-5xl font-display gold-text mt-1">{totals.you}</div>
          <div className="text-xs text-muted-foreground mt-2">
            {totals.youRight}/{totals.finished} correct
          </div>
        </div>
        <div className="gold-border bg-card rounded-lg p-6 opacity-70">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">AI</div>
          <div className="text-5xl font-display text-muted-foreground mt-1">{totals.ai}</div>
          <div className="text-xs text-muted-foreground mt-2">
            {Object.keys(predictions).length === 0
              ? "Not active"
              : `${totals.aiRight}/${totals.finished} correct`}
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        <button
          onClick={() => setStageFilter("ALL")}
          className={`px-3 py-1 rounded text-xs font-display uppercase tracking-widest border ${
            stageFilter === "ALL"
              ? "border-[--gold] text-[--gold]"
              : "border-[--gold-deep] text-muted-foreground"
          }`}
        >
          All
        </button>
        {availableStages.map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={`px-3 py-1 rounded text-xs font-display uppercase tracking-widest border ${
              stageFilter === s
                ? "border-[--gold] text-[--gold]"
                : "border-[--gold-deep] text-muted-foreground"
            }`}
          >
            {stageLabel(s)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-20">Loading…</div>
      ) : visibleRows.length === 0 ? (
        <div className="gold-border bg-card rounded-lg p-10 text-center text-muted-foreground">
          No matches yet. Head to the guess page and tap <b>Refresh fixtures</b>.
        </div>
      ) : (
        <div className="gold-border bg-card rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[--gold-dim] text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left px-4 py-3">Match</th>
                <th className="text-center px-2 py-3">Wt</th>
                <th className="text-center px-2 py-3">You</th>
                <th className="text-center px-2 py-3">AI</th>
                <th className="text-center px-2 py-3">Score</th>
                <th className="text-right px-4 py-3">Pts</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ m, actual, yourPick, aiPick, weight, yourPts, yourCorrect, aiCorrect }) => (
                <tr key={m.id} className="border-t border-[--gold-deep]/30">
                  <td className="px-4 py-3">
                    <div className="font-display text-sm">
                      {m.home_team} <span className="text-[--gold-dim]">vs</span> {m.away_team}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {stageLabel(m.stage)}
                      {m.group_name ? ` · ${m.group_name}` : ""}
                    </div>
                  </td>
                  <td className="text-center text-[--gold-dim]">{weight}</td>
                  <td className="text-center px-2 py-3">{pickDot(yourPick, yourCorrect)}</td>
                  <td className="text-center px-2 py-3">{pickDot(aiPick, aiCorrect)}</td>
                  <td className="text-center text-sm text-muted-foreground">
                    {actual
                      ? `${m.home_score}–${m.away_score}`
                      : m.status === "SCHEDULED" || m.status === "TIMED"
                      ? "—"
                      : m.status}
                  </td>
                  <td className="text-right px-4 py-3 font-display text-[--gold]">
                    {actual ? yourPts : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
