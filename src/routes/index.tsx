import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
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

function Flag({ url, name }: { url: string | null; name: string }) {
  if (!url) {
    return (
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
        ?
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      className="w-12 h-12 rounded-full object-contain bg-background/40 p-1 ring-1 ring-[--gold-deep]"
      loading="lazy"
    />
  );
}

function PickButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "px-3 py-2 text-xs font-display tracking-wider uppercase rounded-md transition-all",
        "border",
        active
          ? "bg-[--gold] text-[--primary-foreground] border-[--gold] shadow-[0_0_18px_oklch(0.82_0.16_85/35%)]"
          : "border-[--gold-deep] text-[--gold-dim] hover:border-[--gold] hover:text-[--gold]",
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MatchRow({
  match,
  pick,
  onPick,
}: {
  match: Match;
  pick: Pick | undefined;
  onPick: (p: Pick) => void;
}) {
  const locked = new Date(match.kickoff).getTime() <= Date.now() || match.status !== "SCHEDULED" && match.status !== "TIMED";
  const knockout = isKnockout(match.stage);
  // football-data.org returns UTC; display in Helsinki (EEST, UTC+3)
  const kickoff = new Date(new Date(match.kickoff).getTime() + 3 * 60 * 60 * 1000);

  return (
    <div className="gold-border bg-card rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground sm:w-28">
        {kickoff.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
        <br />
        {kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        <span className="ml-1 text-[--gold-dim]">EEST</span>
        {match.group_name && <div className="mt-1 text-[--gold-dim]">{match.group_name}</div>}
      </div>

      <div className="flex-1 flex items-center justify-center gap-2 sm:gap-6 min-w-0">
        <div className="flex items-center gap-2 flex-1 justify-end text-right min-w-0">
          <span className="font-display text-xs sm:text-sm truncate">{match.home_team}</span>
          <Flag url={match.home_code} name={match.home_team} />
        </div>
        <span className="text-[--gold-dim] font-display text-[10px] shrink-0">vs</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Flag url={match.away_code} name={match.away_team} />
          <span className="font-display text-xs sm:text-sm truncate">{match.away_team}</span>
        </div>
      </div>

      <div className="flex gap-2 sm:w-64 justify-end">
        <PickButton active={pick === "home"} disabled={locked} onClick={() => onPick("home")}>
          Home
        </PickButton>
        <PickButton
          active={pick === "draw"}
          disabled={locked || knockout}
          onClick={() => onPick("draw")}
        >
          Draw
        </PickButton>
        <PickButton active={pick === "away"} disabled={locked} onClick={() => onPick("away")}>
          Away
        </PickButton>
      </div>
    </div>
  );
}

function GuessPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [guesses, setGuesses] = useState<Record<number, Pick>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("wc26_last_synced") ?? null;
    }
    return null;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, { data: g }] = await Promise.all([
      supabase.from("matches").select("*").order("kickoff", { ascending: true }),
      supabase.from("guesses").select("match_id, pick"),
    ]);
    setMatches((m ?? []) as Match[]);
    const map: Record<number, Pick> = {};
    (g ?? []).forEach((row) => {
      map[row.match_id] = row.pick as Pick;
    });
    setGuesses(map);
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
      }
    },
    [guesses],
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
        <button
          onClick={handleSync}
          disabled={syncing}
          className="gold-border bg-card text-[--gold] font-display text-xs uppercase tracking-widest px-4 py-2 rounded-md hover:bg-[--muted] transition disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Refresh fixtures"}
        </button>
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
