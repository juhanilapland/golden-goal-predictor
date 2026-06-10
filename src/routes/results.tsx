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

const pickShort: Record<Pick, string> = { home: "H", draw: "D", away: "A" };

type LeaderRow = Predictor & { points: number; correct: number; finished: number };

function ResultsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [guesses, setGuesses] = useState<Record<number, Pick>>({});
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predictors, setPredictors] = useState<Predictor[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [openCell, setOpenCell] = useState<string | null>(null);
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

  const predIndex = useMemo(() => {
    const idx: Record<number, Record<string, Prediction>> = {};
    for (const p of predictions) (idx[p.match_id] ??= {})[p.predictor] = p;
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

  const leaderboard = useMemo<LeaderRow[]>(() => {
    const stats: Record<string, { points: number; correct: number; finished: number }> = {};
    for (const p of predictors) stats[p.id] = { points: 0, correct: 0, finished: 0 };
    for (const { m, actual } of matchRows) {
      if (!actual) continue;
      const w = stageWeight(m.stage);
      for (const pr of predictors) {
        const pick = pr.id === "juhani" ? guesses[m.id] : predIndex[m.id]?.[pr.id]?.pick;
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
    stageFilter === "ALL" ? matchRows : matchRows.filter((r) => r.m.stage === stageFilter);

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
  const upcomingCount = matchRows.length - finishedCount;
  const totalAwarded = leaderboard.reduce((a, b) => a + b.points, 0);
  const leader = leaderboard[0];

  // Order rivals for the inline pick grid by current leaderboard rank.
  const gridOrder = leaderboard;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl sm:text-5xl gold-text">Results</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-2 uppercase tracking-widest">
            {finishedCount} played · {upcomingCount} to play · {totalAwarded} pts awarded
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-[--gold-dim] hover:text-[--gold] font-display text-[10px] uppercase tracking-widest px-3 py-2 rounded-md border border-[--gold-deep]/40 hover:border-[--gold-deep] transition disabled:opacity-50 shrink-0"
        >
          {generating ? "Generating…" : "Generate picks"}
        </button>
      </header>

      {loading ? (
        <div className="text-center text-muted-foreground py-20">Loading…</div>
      ) : (
        <>
          <Podium leaderboard={leaderboard} hasData={finishedCount > 0} />
          <RestOfTable leaderboard={leaderboard} leaderPoints={leader?.points ?? 0} />

          {/* Stage filter */}
          <div className="flex gap-2 flex-wrap mb-4 mt-10">
            <FilterPill active={stageFilter === "ALL"} onClick={() => setStageFilter("ALL")}>
              All
            </FilterPill>
            {availableStages.map((s) => (
              <FilterPill
                key={s}
                active={stageFilter === s}
                onClick={() => setStageFilter(s)}
              >
                {stageLabel(s)}
              </FilterPill>
            ))}
          </div>

          {visibleRows.length === 0 ? (
            <div className="gold-border bg-card rounded-lg p-10 text-center text-muted-foreground">
              No matches yet.
            </div>
          ) : (
            <div className="space-y-2">
              {visibleRows.map(({ m, actual }) => (
                <MatchCard
                  key={m.id}
                  m={m}
                  actual={actual}
                  predictors={gridOrder}
                  guesses={guesses}
                  predIndex={predIndex}
                  openCell={openCell}
                  setOpenCell={setOpenCell}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-display uppercase tracking-widest border transition ${
        active
          ? "border-[--gold] text-[--gold] bg-[--gold]/5"
          : "border-[--gold-deep] text-muted-foreground hover:border-[--gold-dim] hover:text-[--gold-dim]"
      }`}
    >
      {children}
    </button>
  );
}

function Podium({ leaderboard, hasData }: { leaderboard: LeaderRow[]; hasData: boolean }) {
  const first = leaderboard[0];
  const second = leaderboard[1];
  const third = leaderboard[2];
  // Display order on md+: 2nd, 1st, 3rd. On mobile: 1st, 2nd, 3rd.
  if (!first) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-3 items-end">
      <PodiumTile
        row={second}
        rank={2}
        leaderPoints={first.points}
        hasData={hasData}
        className="md:order-1"
        height="md:min-h-[220px]"
      />
      <PodiumTile
        row={first}
        rank={1}
        leaderPoints={first.points}
        hasData={hasData}
        className="md:order-2 md:-mt-4 order-first"
        height="md:min-h-[260px]"
        accent
      />
      <PodiumTile
        row={third}
        rank={3}
        leaderPoints={first.points}
        hasData={hasData}
        className="md:order-3"
        height="md:min-h-[200px]"
      />
    </div>
  );
}

function PodiumTile({
  row,
  rank,
  leaderPoints,
  hasData,
  className = "",
  height = "",
  accent = false,
}: {
  row: LeaderRow | undefined;
  rank: 1 | 2 | 3;
  leaderPoints: number;
  hasData: boolean;
  className?: string;
  height?: string;
  accent?: boolean;
}) {
  if (!row) {
    return (
      <div className={`gold-border bg-card/40 rounded-lg p-4 ${className} ${height}`}>
        <div className="text-muted-foreground text-xs uppercase tracking-widest text-center">
          —
        </div>
      </div>
    );
  }
  const medalClass = rank === 1 ? "medal-gold" : rank === 2 ? "medal-silver" : "medal-bronze";
  const gap = rank === 1 ? null : leaderPoints - row.points;
  const isYou = row.id === "juhani";
  return (
    <div
      className={[
        "relative gold-border bg-card rounded-lg p-5 text-center flex flex-col items-center gap-3",
        accent ? "locked-accent shadow-[0_12px_40px_-12px_oklch(0.82_0.16_85/30%)]" : "",
        height,
        className,
      ].join(" ")}
    >
      {isYou && (
        <span className="absolute top-3 right-3 chip-gold chip-gold-active">You</span>
      )}
      <div className="relative">
        <img
          src={AVATARS[row.id]}
          alt={row.name}
          width={accent ? 96 : 80}
          height={accent ? 96 : 80}
          loading="lazy"
          className={`${accent ? "w-24 h-24" : "w-20 h-20"} rounded-full object-cover ring-2 ring-[--gold-deep] shrink-0`}
        />
        <span
          className={`absolute -bottom-1 -right-1 ${medalClass} w-8 h-8 rounded-full grid place-items-center font-display text-sm`}
        >
          {rank}
        </span>
      </div>
      <div className="min-w-0">
        <div className={`font-display ${accent ? "text-xl" : "text-lg"} truncate`}>{row.name}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest truncate">
          {row.tagline}
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <div
          className={`font-display ${accent ? "text-5xl" : "text-4xl"} text-[--gold] leading-none`}
        >
          {hasData ? row.points : "—"}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[--gold-dim]">points</div>
      </div>
      <div className="text-xs text-muted-foreground">
        {hasData ? `${row.correct} / ${row.finished} correct` : "no matches played yet"}
      </div>
      {hasData && gap !== null && gap > 0 && (
        <div className="text-[10px] uppercase tracking-widest text-[--gold-dim]">
          −{gap} from leader
        </div>
      )}
      {hasData && rank === 1 && leaderboard1Gap(row, leaderPoints) && (
        <div className="text-[10px] uppercase tracking-widest text-[--gold]">
          {leaderboard1Gap(row, leaderPoints)}
        </div>
      )}
    </div>
  );
}

// not actually used to compute lead — kept for compatibility, lead computed in RestOfTable
function leaderboard1Gap(_row: LeaderRow, _leaderPoints: number): string | null {
  return null;
}

function RestOfTable({
  leaderboard,
  leaderPoints,
}: {
  leaderboard: LeaderRow[];
  leaderPoints: number;
}) {
  const rest = leaderboard.slice(3);
  if (rest.length === 0) return null;
  return (
    <div className="gold-border bg-card rounded-lg overflow-hidden mt-3">
      {rest.map((p, i) => {
        const rank = i + 4;
        const acc = p.finished > 0 ? Math.round((p.correct / p.finished) * 100) : 0;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-3 px-4 py-3 border-t border-[--gold-deep]/20 first:border-t-0 ${
              p.id === "juhani" ? "bg-[--gold]/5" : ""
            }`}
          >
            <div className="w-6 font-display text-[--gold-dim] text-sm text-center shrink-0">
              {rank}
            </div>
            <img
              src={AVATARS[p.id]}
              alt={p.name}
              width={36}
              height={36}
              loading="lazy"
              className="w-9 h-9 rounded-full object-cover ring-1 ring-[--gold-deep] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm truncate">{p.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{p.tagline}</div>
            </div>
            <div className="text-xs text-muted-foreground w-16 text-right shrink-0">
              {acc}% acc
            </div>
            <div className="font-display text-[--gold] text-lg w-12 text-right shrink-0">
              {p.points}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[--gold-dim] w-16 text-right shrink-0">
              −{leaderPoints - p.points}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchCard({
  m,
  actual,
  predictors,
  guesses,
  predIndex,
  openCell,
  setOpenCell,
}: {
  m: Match;
  actual: string | null;
  predictors: Predictor[];
  guesses: Record<number, Pick>;
  predIndex: Record<number, Record<string, Prediction>>;
  openCell: string | null;
  setOpenCell: (k: string | null) => void;
}) {
  const finished = actual !== null;
  const upcoming = m.status === "SCHEDULED" || m.status === "TIMED";
  const kickoff = new Date(new Date(m.kickoff).getTime() + 3 * 60 * 60 * 1000);

  return (
    <div className="gold-border card-elevated bg-card rounded-lg p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[140px_minmax(0,1fr)_auto] gap-3 md:gap-5 md:items-center">
      {/* Stub */}
      <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-1 md:pr-4 md:border-r md:border-[--gold-deep]/30">
        <div className="font-display text-lg md:text-xl text-[--gold] leading-none">
          {kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {kickoff.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
        </div>
        <div className="flex flex-wrap gap-1 md:mt-1">
          <span className="chip-gold">{stageLabel(m.stage)}</span>
          {m.group_name && <span className="chip-gold">{m.group_name}</span>}
        </div>
      </div>

      {/* Matchup */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 text-right font-display text-sm sm:text-base truncate min-w-0">
          {m.home_team}
        </div>
        <div className="shrink-0 text-center min-w-[64px]">
          {finished ? (
            <>
              <div className="font-display text-xl text-[--gold] leading-none">
                {m.home_score}–{m.away_score}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-[--gold-dim] mt-1">FT</div>
            </>
          ) : upcoming ? (
            <span className="text-muted-foreground font-display text-base">vs</span>
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {m.status}
            </span>
          )}
        </div>
        <div className="flex-1 text-left font-display text-sm sm:text-base truncate min-w-0">
          {m.away_team}
        </div>
      </div>

      {/* Pick grid */}
      <div className="grid grid-cols-6 gap-1.5 md:gap-2">
        {predictors.map((pr) => {
          const pick =
            pr.id === "juhani" ? guesses[m.id] : predIndex[m.id]?.[pr.id]?.pick;
          const reasoning =
            pr.id === "juhani" ? null : predIndex[m.id]?.[pr.id]?.reasoning ?? null;
          const cellKey = `${m.id}:${pr.id}`;
          const isOpen = openCell === cellKey;
          let cellClass = "pick-cell-empty";
          if (pick && finished) cellClass = pick === actual ? "pick-cell-correct" : "pick-cell-wrong";
          else if (pick) cellClass = "pick-cell-pending";

          return (
            <div key={pr.id} className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenCell(isOpen ? null : cellKey);
                }}
                className={`w-full flex flex-col items-center gap-1 p-1.5 rounded-md border transition hover:scale-[1.03] ${cellClass}`}
                title={`${pr.name}: ${pick ? pick.toUpperCase() : "no pick"}${
                  reasoning ? ` — ${reasoning}` : ""
                }`}
              >
                <img
                  src={AVATARS[pr.id]}
                  alt={pr.name}
                  width={24}
                  height={24}
                  loading="lazy"
                  className="w-6 h-6 rounded-full object-cover ring-1 ring-[--gold-deep]/60 shrink-0"
                />
                <span className="font-display text-[11px] leading-none">
                  {pick ? pickShort[pick] : "—"}
                </span>
              </button>
              {isOpen && (
                <div
                  className="absolute z-20 top-full mt-1 right-0 w-56 gold-border bg-card rounded-md p-3 text-left shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <img
                      src={AVATARS[pr.id]}
                      alt=""
                      className="w-6 h-6 rounded-full object-cover ring-1 ring-[--gold-deep]"
                    />
                    <span className="font-display text-sm">{pr.name}</span>
                  </div>
                  <div className="text-[11px] text-[--gold-dim] uppercase tracking-widest mb-1">
                    Pick: {pick ? pick.toUpperCase() : "—"}
                    {finished && pick && (
                      <span className={`ml-2 ${pick === actual ? "text-[--gold]" : "text-destructive"}`}>
                        {pick === actual ? "✓" : "✗"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground italic">
                    {reasoning ?? (pr.id === "juhani" ? "Your pick." : "No reasoning recorded.")}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
