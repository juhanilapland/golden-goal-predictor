import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateCompetitorPicks } from "@/lib/predictors.functions";
import {
  STAGE_ORDER,
  isKnockout,
  stageLabel,
  type Pick,
} from "@/lib/wc-config";
import { toast } from "sonner";

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
};

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}



export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Guess — WC 2026" },
      { name: "description", content: "Pick winners for every World Cup 2026 match." },
    ],
  }),
  component: GuessPage,
});

function Flag({ url, name, size = 56 }: { url: string | null; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (!url) {
    return (
      <div
        style={style}
        className="rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground ring-1 ring-[--gold-deep] shrink-0"
      >
        ?
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      style={style}
      className="rounded-full object-contain bg-background/40 p-1 ring-1 ring-[--gold-deep] shadow-[0_4px_12px_-4px_oklch(0_0_0/40%)] shrink-0"
      loading="lazy"
    />
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden>
      <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SegmentedPicks({
  pick,
  locked,
  knockout,
  onPick,
}: {
  pick: Pick | undefined;
  locked: boolean;
  knockout: boolean;
  onPick: (p: Pick) => void;
}) {
  const opts: { id: Pick; label: string; disabled: boolean }[] = [
    { id: "home", label: "Home", disabled: locked },
    { id: "draw", label: "Draw", disabled: locked || knockout },
    { id: "away", label: "Away", disabled: locked },
  ];
  return (
    <div className="inline-flex w-full sm:w-auto rounded-md border border-[--gold-deep] overflow-hidden divide-x divide-[--gold-deep] bg-background/40">
      {opts.map((o) => {
        const active = pick === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            disabled={o.disabled}
            className={[
              "flex-1 sm:flex-initial sm:min-w-[72px] px-3 py-2 text-xs font-display tracking-wider uppercase transition-all inline-flex items-center justify-center gap-1.5",
              active
                ? "bg-gradient-to-b from-[oklch(0.88_0.16_85)] to-[oklch(0.74_0.16_85)] text-[--primary-foreground] shadow-[inset_0_1px_0_oklch(1_0_0/30%),inset_0_-1px_0_oklch(0_0_0/15%)]"
                : "text-[--gold-dim] hover:text-[--gold] hover:bg-[--gold]/5",
              o.disabled && !active ? "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-[--gold-dim]" : "",
              o.disabled ? "cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            {locked && active && <CheckIcon className="w-3 h-3" />}
            {locked && !active && o.disabled && <LockIcon className="w-3 h-3 opacity-50" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MatchRow({
  match,
  pick,
  rivalCount,
  onPick,
}: {
  match: Match;
  pick: Pick | undefined;
  rivalCount: number;
  onPick: (p: Pick) => void;
}) {
  const locked = new Date(match.kickoff).getTime() <= Date.now() || (match.status !== "SCHEDULED" && match.status !== "TIMED");
  const knockout = isKnockout(match.stage);
  // football-data.org returns UTC; display in Helsinki (EEST, UTC+3)
  const kickoff = new Date(match.kickoff);
  const hasPick = !!pick;
  const rivalsFull = rivalCount >= 5;

  return (
    <div
      className={[
        "relative gold-border card-elevated bg-card rounded-lg p-4",
        "flex flex-col sm:flex-row sm:items-center gap-4",
        hasPick ? "locked-accent" : "",
      ].join(" ")}
    >
      {/* Stub: date + meta */}
      <div className="sm:w-32 sm:pr-4 sm:border-r sm:border-[--gold-deep]/40 flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1.5">
        <div className="font-display text-xl sm:text-2xl text-[--gold] leading-none">
          {kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {kickoff.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
          <span className="ml-1 text-[--gold-dim]">EEST</span>
        </div>
        <div className="flex flex-wrap gap-1 sm:mt-1">
          {match.group_name && <span className="chip-gold">{match.group_name}</span>}
          {knockout && <span className="chip-gold chip-gold-active">KO</span>}
          <span className={`chip-gold ${rivalsFull ? "chip-gold-active" : ""}`}>
            {rivalsFull ? <CheckIcon className="w-2.5 h-2.5" /> : <LockIcon className="w-2.5 h-2.5" />}
            {rivalCount}/5
          </span>
        </div>
      </div>

      {/* Matchup */}
      <div className="flex-1 flex items-center justify-center gap-3 sm:gap-5 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-1 justify-end text-right min-w-0">
          <span className="font-display text-sm sm:text-base truncate">{match.home_team}</span>
          <Flag url={match.home_code} name={match.home_team} size={48} />
        </div>
        <div className="vs-rule shrink-0">VS</div>
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <Flag url={match.away_code} name={match.away_team} size={48} />
          <span className="font-display text-sm sm:text-base truncate">{match.away_team}</span>
        </div>
      </div>

      {/* Picks */}
      <div className="sm:w-auto">
        <SegmentedPicks pick={pick} locked={locked} knockout={knockout} onPick={onPick} />
      </div>
    </div>
  );
}

function GuessPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [guesses, setGuesses] = useState<Record<number, Pick>>({});
  const [rivalCounts, setRivalCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("wc26_last_synced");
    if (stored) setLastSynced(stored);
  }, []);

  const generatePicks = useServerFn(generateCompetitorPicks);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: g }, { data: preds }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: true }),
      supabase.from("guesses").select("match_id, pick"),
      supabase.from("predictions").select("match_id, predictor"),
    ]);
    setMatches((m ?? []) as Match[]);
    const map: Record<number, Pick> = {};
    (g ?? []).forEach((row) => {
      map[row.match_id] = row.pick as Pick;
    });
    setGuesses(map);
    const counts: Record<number, number> = {};
    (preds ?? []).forEach((r) => {
      counts[r.match_id] = (counts[r.match_id] ?? 0) + 1;
    });
    setRivalCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handlePick = useCallback(
    async (matchId: number, p: Pick) => {
      const prev = guesses[matchId];
      setGuesses((g) => ({ ...g, [matchId]: p }));
      const { error } = await supabase
        .from("guesses")
        .upsert({ match_id: matchId, pick: p }, { onConflict: "match_id" });
      if (error) {
        setGuesses((g) => {
          const next = { ...g };
          if (prev) next[matchId] = prev;
          else delete next[matchId];
          return next;
        });
        toast.error("Could not save pick: " + error.message);
        return;
      }
      // Fire-and-forget: have the 5 rivals lock in their picks for this match.
      generatePicks({ data: { matchId } })
        .then((res) => {
          if (res?.generated) {
            setRivalCounts((c) => ({ ...c, [matchId]: Math.min(5, (c[matchId] ?? 0) + res.generated) }));
          }
        })
        .catch((e) => {
          console.warn("Competitor picks failed", e);
        });
    },
    [guesses, generatePicks],
  );



  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/public/sync-fixtures", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error("Sync failed: " + (json.error ?? res.status));
      } else {
        toast.success(`Synced ${json.synced} matches`);
        if (json.syncedAt) {
          localStorage.setItem("wc26_last_synced", json.syncedAt);
          setLastSynced(json.syncedAt);
        }
        await load();
      }
    } catch (e) {
      toast.error("Sync failed: " + (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleSync();
    }, 10 * 60 * 1000); // auto-refresh every 10 minutes
    return () => clearInterval(interval);
  }, [handleSync]);

  const grouped = useMemo(() => {
    const byStage: Record<string, Match[]> = {};
    for (const m of matches) {
      (byStage[m.stage] ??= []).push(m);
    }
    return STAGE_ORDER.filter((s) => byStage[s]?.length).map((s) => ({
      stage: s,
      matches: byStage[s],
    }));
  }, [matches]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl sm:text-5xl gold-text">World Cup 2026</h1>
          <p className="text-muted-foreground text-sm mt-1">Pick the winner for every match.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="gold-border bg-card text-[--gold] font-display text-xs uppercase tracking-widest px-4 py-2 rounded-md hover:bg-[--muted] transition disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Refresh fixtures"}
          </button>
          <span className="text-[10px] text-muted-foreground">
            Last updated: {mounted ? formatTimeAgo(lastSynced) : "Never"}
          </span>
        </div>
      </header>

      {loading ? (
        <div className="text-center text-muted-foreground py-20">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="gold-border bg-card rounded-lg p-10 text-center">
          <p className="font-display text-2xl gold-text mb-2">No fixtures yet</p>
          <p className="text-muted-foreground text-sm mb-6">
            Click <b>Refresh fixtures</b> above to pull the latest World Cup 2026 schedule.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map(({ stage, matches: ms }) => (
            <section key={stage}>
              <h2 className="text-2xl gold-text mb-4">{stageLabel(stage)}</h2>
              <div className="space-y-3">
                {ms.map((m) => (
                  <MatchRow
                    key={m.id}
                    match={m}
                    pick={guesses[m.id]}
                    rivalCount={rivalCounts[m.id] ?? 0}
                    onPick={(p) => handlePick(m.id, p)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
