import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Match = {
  id: number;
  kickoff: string;
  stage: string;
  group_name: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  outcome: string | null;
};

type Standing = {
  team: string;
  group: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

export const Route = createFileRoute("/groups")({
  head: () => ({
    meta: [
      { title: "Standings & Bracket — WC 2026 Guesser" },
      {
        name: "description",
        content:
          "Live overall team leaderboard and knockout bracket visualization for World Cup 2026.",
      },
    ],
  }),
  component: GroupsPage,
});

const KNOCKOUT_STAGES: Array<{ id: string; label: string }> = [
  { id: "LAST_32", label: "Round of 32" },
  { id: "LAST_16", label: "Round of 16" },
  { id: "QUARTER_FINALS", label: "Quarter-finals" },
  { id: "SEMI_FINALS", label: "Semi-finals" },
  { id: "FINAL", label: "Final" },
];

function GroupsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("matches")
        .select(
          "id,kickoff,stage,group_name,home_team,away_team,home_score,away_score,status,outcome",
        )
        .order("kickoff", { ascending: true });
      if (!cancelled) {
        setMatches((data ?? []) as Match[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const leaderboard = useMemo<Standing[]>(() => {
    const tbl = new Map<string, Standing>();
    const ensure = (team: string, group: string) => {
      let s = tbl.get(team);
      if (!s) {
        s = { team, group, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
        tbl.set(team, s);
      }
      return s;
    };
    for (const m of matches) {
      if (m.home_team === "TBD" || m.away_team === "TBD") continue;
      const g = (m.group_name ?? "").replace("GROUP_", "");
      ensure(m.home_team, g);
      ensure(m.away_team, g);
      if (m.status !== "FINISHED" || m.home_score == null || m.away_score == null) continue;
      const h = ensure(m.home_team, g);
      const a = ensure(m.away_team, g);
      h.p++;
      a.p++;
      h.gf += m.home_score;
      h.ga += m.away_score;
      a.gf += m.away_score;
      a.ga += m.home_score;
      // Knockouts: use stored outcome (penalty winner), not raw score.
      if (m.stage !== "GROUP_STAGE") {
        if (m.outcome === "home") {
          h.w++; h.pts += 3; a.l++;
        } else if (m.outcome === "away") {
          a.w++; a.pts += 3; h.l++;
        }
        continue;
      }
      if (m.home_score > m.away_score) {
        h.w++;
        h.pts += 3;
        a.l++;
      } else if (m.home_score < m.away_score) {
        a.w++;
        a.pts += 3;
        h.l++;
      } else {
        h.d++;
        a.d++;
        h.pts++;
        a.pts++;
      }
    }
    for (const s of tbl.values()) s.gd = s.gf - s.ga;
    return [...tbl.values()].sort(
      (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team),
    );
  }, [matches]);

  const knockouts = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      if (m.stage === "GROUP_STAGE") continue;
      const list = map.get(m.stage) ?? [];
      list.push(m);
      map.set(m.stage, list);
    }
    return map;
  }, [matches]);

  const thirdPlace = knockouts.get("THIRD_PLACE") ?? [];

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl gold-text">Standings & Bracket</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overall team leaderboard (Pts · GD · GF) and knockout bracket.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <Card className="border-[--gold-deep]/40 bg-background/60">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg gold-text">
                Team Leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-[--gold-deep]/20">
                    <TableHead className="w-6 px-1">#</TableHead>
                    <TableHead className="px-1">Team</TableHead>
                    <TableHead className="px-1 hidden sm:table-cell">Grp</TableHead>
                    <TableHead className="px-1 text-right">P</TableHead>
                    <TableHead className="px-1 text-right">W</TableHead>
                    <TableHead className="px-1 text-right">D</TableHead>
                    <TableHead className="px-1 text-right">L</TableHead>
                    <TableHead className="px-1 text-right hidden sm:table-cell">GF</TableHead>
                    <TableHead className="px-1 text-right hidden sm:table-cell">GA</TableHead>
                    <TableHead className="px-1 text-right">GD</TableHead>
                    <TableHead className="px-1 text-right">Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((s, i) => {
                    const rank = i + 1;
                    return (
                      <TableRow key={s.team} className="border-[--gold-deep]/15">
                        <TableCell className="px-1 text-muted-foreground tabular-nums">
                          {rank}
                        </TableCell>
                        <TableCell className="px-1 font-medium">{s.team}</TableCell>
                        <TableCell className="px-1 text-muted-foreground hidden sm:table-cell">
                          {s.group}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums">{s.p}</TableCell>
                        <TableCell className="px-1 text-right tabular-nums">{s.w}</TableCell>
                        <TableCell className="px-1 text-right tabular-nums">{s.d}</TableCell>
                        <TableCell className="px-1 text-right tabular-nums">{s.l}</TableCell>
                        <TableCell className="px-1 text-right tabular-nums hidden sm:table-cell">
                          {s.gf}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums hidden sm:table-cell">
                          {s.ga}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums">
                          {s.gd > 0 ? `+${s.gd}` : s.gd}
                        </TableCell>
                        <TableCell className="px-1 text-right tabular-nums font-semibold text-[--gold]">
                          {s.pts}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <section className="mt-10">
            <h2 className="font-display text-2xl gold-text mb-3">Knockout Bracket</h2>
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-4 min-w-max">
                {KNOCKOUT_STAGES.map((stage) => {
                  const ms = knockouts.get(stage.id) ?? [];
                  if (ms.length === 0) return null;
                  return (
                    <div
                      key={stage.id}
                      className="flex flex-col justify-around gap-3 min-w-[220px]"
                    >
                      <div className="text-xs uppercase tracking-widest text-muted-foreground text-center">
                        {stage.label}
                      </div>
                      <div className="flex flex-col justify-around gap-3 flex-1">
                        {ms.map((m) => (
                          <BracketMatch key={m.id} m={m} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {thirdPlace.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Third Place Play-off
                </div>
                <div className="max-w-[260px]">
                  {thirdPlace.map((m) => (
                    <BracketMatch key={m.id} m={m} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function BracketMatch({ m }: { m: Match }) {
  const isFinished =
    m.status === "FINISHED" && m.home_score != null && m.away_score != null;
  const winner: "home" | "away" | null =
    m.outcome === "home" || m.outcome === "away"
      ? m.outcome
      : isFinished && m.home_score! !== m.away_score!
        ? m.home_score! > m.away_score!
          ? "home"
          : "away"
        : null;
  const date = new Date(m.kickoff);
  const TeamRow = ({
    team,
    score,
    isWinner,
    isLoser,
  }: {
    team: string;
    score: number | null;
    isWinner: boolean;
    isLoser: boolean;
  }) => (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-1.5 text-sm gap-2",
        isWinner && "text-[--gold] font-semibold",
        isLoser && "text-muted-foreground",
      )}
    >
      <span className={cn("truncate", team === "TBD" && "italic text-muted-foreground")}>
        {team || "TBD"}
      </span>
      <span className="tabular-nums shrink-0">{score ?? "–"}</span>
    </div>
  );
  return (
    <div className="rounded-md border border-[--gold-deep]/40 bg-background/60 overflow-hidden">
      <TeamRow
        team={m.home_team}
        score={m.home_score}
        isWinner={winner === "home"}
        isLoser={winner === "away"}
      />
      <div className="h-px bg-[--gold-deep]/20" />
      <TeamRow
        team={m.away_team}
        score={m.away_score}
        isWinner={winner === "away"}
        isLoser={winner === "home"}
      />
      <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground border-t border-[--gold-deep]/20 flex justify-between">
        <span>
          {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </span>
        <span>
          {isFinished ? "Final" : m.status === "LIVE" ? "Live" : "Scheduled"}
        </span>
      </div>
    </div>
  );
}
