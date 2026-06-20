import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
      { title: "Groups & Bracket — WC 2026 Guesser" },
      {
        name: "description",
        content: "Live group standings and scheduled knockout fixtures for World Cup 2026.",
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
  { id: "THIRD_PLACE", label: "Third Place" },
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

  const groups = useMemo(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of matches) {
      if (m.stage !== "GROUP_STAGE" || !m.group_name) continue;
      const list = byGroup.get(m.group_name) ?? [];
      list.push(m);
      byGroup.set(m.group_name, list);
    }
    const result: Array<{ name: string; standings: Standing[] }> = [];
    for (const [name, ms] of [...byGroup.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const tbl = new Map<string, Standing>();
      const ensure = (team: string) => {
        let s = tbl.get(team);
        if (!s) {
          s = { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
          tbl.set(team, s);
        }
        return s;
      };
      for (const m of ms) {
        ensure(m.home_team);
        ensure(m.away_team);
        if (m.status !== "FINISHED" || m.home_score == null || m.away_score == null) continue;
        const h = ensure(m.home_team);
        const a = ensure(m.away_team);
        h.p++;
        a.p++;
        h.gf += m.home_score;
        h.ga += m.away_score;
        a.gf += m.away_score;
        a.ga += m.home_score;
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
      const standings = [...tbl.values()].sort(
        (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf,
      );
      result.push({ name: name.replace("GROUP_", "Group "), standings });
    }
    return result;
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

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl gold-text">Groups & Bracket</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live standings · top 2 advance · scheduled knockout fixtures below.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <Card key={g.name} className="border-[--gold-deep]/40 bg-background/60">
                <CardHeader className="pb-2">
                  <CardTitle className="font-display text-lg gold-text">{g.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[--gold-deep]/20">
                        <TableHead className="w-6 px-1">#</TableHead>
                        <TableHead className="px-1">Team</TableHead>
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
                      {g.standings.map((s, i) => {
                        const rank = i + 1;
                        const rowCls =
                          rank <= 2
                            ? "border-[--gold-deep]/20 bg-[--gold-deep]/15"
                            : rank === 3
                              ? "border-[--gold-deep]/20 bg-[--gold-deep]/5"
                              : "border-[--gold-deep]/20";
                        return (
                          <TableRow key={s.team} className={rowCls}>
                            <TableCell className="px-1 text-muted-foreground">{rank}</TableCell>
                            <TableCell className="px-1 font-medium">{s.team}</TableCell>
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
            ))}
          </section>

          <section className="mt-10 space-y-6">
            <h2 className="font-display text-2xl gold-text">Knockout Stage</h2>
            {KNOCKOUT_STAGES.map((stage) => {
              const ms = knockouts.get(stage.id) ?? [];
              if (ms.length === 0) return null;
              return (
                <Card key={stage.id} className="border-[--gold-deep]/40 bg-background/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-display text-lg gold-text">
                      {stage.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ul className="divide-y divide-[--gold-deep]/20">
                      {ms.map((m) => {
                        const date = new Date(m.kickoff);
                        const isFinished =
                          m.status === "FINISHED" &&
                          m.home_score != null &&
                          m.away_score != null;
                        const home = m.home_team || "TBD";
                        const away = m.away_team || "TBD";
                        return (
                          <li
                            key={m.id}
                            className="py-2 flex items-center justify-between gap-3 text-sm"
                          >
                            <div className="text-muted-foreground tabular-nums w-24 shrink-0">
                              {date.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                              <span className="hidden sm:inline">
                                {" · "}
                                {date.toLocaleTimeString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <div className="flex-1 text-center">
                              <span className={home === "TBD" ? "text-muted-foreground" : ""}>
                                {home}
                              </span>
                              <span className="mx-2 text-[--gold] font-semibold tabular-nums">
                                {isFinished ? `${m.home_score} – ${m.away_score}` : "vs"}
                              </span>
                              <span className={away === "TBD" ? "text-muted-foreground" : ""}>
                                {away}
                              </span>
                            </div>
                            <div className="w-16 text-right text-xs uppercase tracking-widest text-muted-foreground">
                              {isFinished ? "Final" : m.status === "LIVE" ? "Live" : ""}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
