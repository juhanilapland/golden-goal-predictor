import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateAllMissingPicks } from "@/lib/predictors.functions";
import {
  STAGE_ORDER,
  stageLabel,
  stageWeight,
  outcomeFromScore,
  type Pick,
} from "@/lib/wc-config";
import { toast } from "sonner";
import avatarJuhani from "@/assets/avatar-juhani.jpg";
import avatarRandom from "@/assets/avatar-random.jpg";
import avatarStats from "@/assets/avatar-stats.jpg";
import avatarMagician from "@/assets/avatar-magician.jpg";
import avatarAdriana from "@/assets/avatar-adriana.jpg";
import avatarVibes from "@/assets/avatar-vibes.jpg";

const AVATARS: Record<string, string> = {
  juhani: avatarJuhani,
  random: avatarRandom,
  stats: avatarStats,
  magician: avatarMagician,
  adriana: avatarAdriana,
  vibes: avatarVibes,
};


type Match = {
  id: number;
  stage: string;
  group_name: string | null;
  kickoff: string;
  home_team: string;
  away_team: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
};

type Predictor = { id: string; name: string; tagline: string; sort_order: number };

type Prediction = { match_id: number; predictor: string; pick: Pick; reasoning: string | null };

export const Route = createFileRoute("/results")({
  head: () => ({
    meta: [
      { title: "Results — WC 2026" },
      { name: "description", content: "Leaderboard and per-match breakdown for all guessers." },
    ],
  }),
  component: ResultsPage,
});

const pickLabel: Record<Pick, string> = { home: "Home", draw: "Draw", away: "Away" };

function PickPill({ pick, correct }: { pick: Pick | undefined; correct: boolean | null }) {
  if (!pick) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded text-[10px] font-display tracking-wider uppercase",
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
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predictors, setPredictors] = useState<Predictor[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const generateAll = useServerFn(generateAllMissingPicks);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: g }, { data: p }, { data: pr }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: true }),
      supabase.from("guesses").select("match_id, pick"),
      supabase.from("predictions").select("match_id, predictor, pick, reasoning"),
      supabase.from("predictors").select("*").order("sort_order"),
    ]);
    setMatches((m ?? []) as Match[]);
    const gm: Record<number, Pick> = {};
    (g ?? []).forEach((row) => (gm[row.match_id] = row.pick as Pick));
    setGuesses(gm);
    setPredictions((p ?? []) as Prediction[]);
    setPredictors((pr ?? []) as Predictor[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // predictions indexed by match -> predictor -> {pick, reasoning}
  const predIndex = useMemo(() => {
    const idx: Record<number, Record<string, Prediction>> = {};
    for (const p of predictions) {
      (idx[p.match_id] ??= {})[p.predictor] = p;
    }
    return idx;
  }, [predictions]);

  const matchRows = useMemo(() => {
    return matches.map((m) => {
      const actual =
        m.outcome ??
        (m.status === "FINISHED" ? outcomeFromScore(m.home_score, m.away_score) : null);
      return { m, actual };
    });
  }, [matches]);

  // Per-predictor totals
  const leaderboard = useMemo(() => {
    const stats: Record<string, { points: number; correct: number; finished: number }> = {};
    for (const p of predictors) stats[p.id] = { points: 0, correct: 0, finished: 0 };
    for (const { m, actual } of matchRows) {
      if (!actual) continue;
      const w = stageWeight(m.stage);
      for (const pr of predictors) {
        const pick =
          pr.id === "juhani" ? guesses[m.id] : predIndex[m.id]?.[pr.id]?.pick;
        if (!pick) continue;
        stats[pr.id].finished += 1;
        if (pick === actual) {
          stats[pr.id].correct += 1;
          stats[pr.id].points += w;
        }
      }
    }
    return predictors
      .map((p) => ({ ...p, ...stats[p.id] }))
      .sort((a, b) => b.points - a.points || b.correct - a.correct);
  }, [predictors, matchRows, guesses, predIndex]);

  const visibleRows =
    stageFilter === "ALL"
      ? matchRows
      : matchRows.filter((r) => r.m.stage === stageFilter);

  const availableStages = STAGE_ORDER.filter((s) => matches.some((m) => m.stage === s));

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await generateAll({ data: undefined });
      toast.success(`Generated ${res.generated} missing picks`);
      await load();
    } catch (e) {
      toast.error("Generate failed: " + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [generateAll, load]);

  const finishedCount = matchRows.filter((r) => r.actual).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl gold-text">Results</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {finishedCount} match{finishedCount === 1 ? "" : "es"} played.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="gold-border bg-card text-[--gold] font-display text-xs uppercase tracking-widest px-4 py-2 rounded-md hover:bg-[--muted] transition disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate missing picks"}
        </button>
      </header>

      {/* Leaderboard */}
      <div className="gold-border bg-card rounded-lg overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[--gold-dim] text-xs uppercase tracking-widest">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Guesser</th>
              <th className="text-right px-4 py-3">Correct</th>
              <th className="text-right px-4 py-3">Points</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((p, i) => (
              <tr
                key={p.id}
                className={`border-t border-[--gold-deep]/30 ${
                  p.id === "juhani" ? "bg-[--gold]/5" : ""
                }`}
              >
                <td className="px-4 py-3 font-display text-[--gold-dim]">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={AVATARS[p.id]}
                      alt={p.name}
                      width={40}
                      height={40}
                      loading="lazy"
                      className="w-10 h-10 rounded-full object-cover ring-1 ring-[--gold-deep] shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-display truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{p.tagline}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right px-4 py-3 text-muted-foreground">
                  {p.correct}/{p.finished}
                </td>
                <td className="text-right px-4 py-3 font-display text-[--gold] text-lg">
                  {p.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stage filter */}
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
          No matches yet.
        </div>
      ) : (
        <div className="gold-border bg-card rounded-lg overflow-hidden">
          {visibleRows.map(({ m, actual }) => {
            const isOpen = expanded === m.id;
            return (
              <div key={m.id} className="border-t border-[--gold-deep]/30 first:border-t-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : m.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-sm truncate">
                      {m.home_team} <span className="text-[--gold-dim]">vs</span> {m.away_team}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {stageLabel(m.stage)}
                      {m.group_name ? ` · ${m.group_name}` : ""}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground w-16 text-right">
                    {actual
                      ? `${m.home_score}–${m.away_score}`
                      : m.status === "SCHEDULED" || m.status === "TIMED"
                      ? "—"
                      : m.status}
                  </div>
                  <div className="text-[--gold-dim] text-xs w-4">{isOpen ? "▾" : "▸"}</div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 bg-background/30">
                    {predictors.map((pr) => {
                      const pick =
                        pr.id === "juhani"
                          ? guesses[m.id]
                          : predIndex[m.id]?.[pr.id]?.pick;
                      const reasoning =
                        pr.id === "juhani" ? null : predIndex[m.id]?.[pr.id]?.reasoning ?? null;
                      const correct = actual && pick ? pick === actual : null;
                      const pts = correct ? stageWeight(m.stage) : 0;
                      return (
                        <div
                          key={pr.id}
                          className="flex items-center gap-3 text-xs py-2 border-t border-[--gold-deep]/15 first:border-t-0"
                        >
                          <img
                            src={AVATARS[pr.id]}
                            alt={pr.name}
                            width={28}
                            height={28}
                            loading="lazy"
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-[--gold-deep] shrink-0"
                          />
                          <div className="w-24 sm:w-32 shrink-0">
                            <div className="font-display truncate">{pr.name}</div>
                          </div>
                          <div className="w-16 shrink-0">
                            <PickPill pick={pick} correct={correct} />
                          </div>
                          <div className="flex-1 text-muted-foreground italic min-w-0">
                            {reasoning ?? (pr.id === "juhani" ? "" : "—")}
                          </div>
                          <div className="w-8 text-right font-display text-[--gold]">
                            {actual ? pts : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
