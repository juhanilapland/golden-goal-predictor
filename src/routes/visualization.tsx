import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Pick } from "@/lib/wc-config";

type Match = {
  id: number;
  kickoff: string;
  home_team: string;
  away_team: string;
  status: string;
  outcome: string | null;
};
type Predictor = { id: string; name: string; sort_order: number };
type Prediction = { match_id: number; predictor: string; pick: Pick };

export const Route = createFileRoute("/visualization")({
  head: () => ({
    meta: [
      { title: "Score Progression — WC 2026 Guesser" },
      {
        name: "description",
        content: "Cumulative points per guesser across completed World Cup 2026 matches.",
      },
    ],
  }),
  component: VisualizationPage,
  errorComponent: ({ error }) => (
    <div className="max-w-3xl mx-auto p-6 text-sm text-muted-foreground">
      Failed to load chart: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

const LINE_COLORS = [
  "#E5C76B",
  "#7CC4FF",
  "#FF8FA3",
  "#9AE6B4",
  "#C792EA",
  "#F6AD55",
  "#5EEAD4",
  "#FCA5A5",
  "#A5B4FC",
  "#FACC15",
];

function VisualizationPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictors, setPredictors] = useState<Predictor[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: m }, { data: pr }, { data: pred }] = await Promise.all([
        supabase
          .from("matches")
          .select("id, kickoff, home_team, away_team, status, outcome")
          .eq("status", "FINISHED")
          .order("kickoff", { ascending: true }),
        supabase.from("predictors").select("id, name, sort_order").order("sort_order"),
        supabase.from("predictions").select("match_id, predictor, pick"),
      ]);
      if (cancelled) return;
      setMatches((m ?? []) as Match[]);
      setPredictors((pr ?? []) as Predictor[]);
      setPredictions((pred ?? []) as Prediction[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { chartData, lines } = useMemo(() => {
    const byMatch = new Map<number, Map<string, Pick>>();
    for (const p of predictions) {
      if (!byMatch.has(p.match_id)) byMatch.set(p.match_id, new Map());
      byMatch.get(p.match_id)!.set(p.predictor, p.pick);
    }
    const running: Record<string, number> = {};
    for (const p of predictors) running[p.id] = 0;

    const data: Array<Record<string, number | string>> = [
      { idx: 0, label: "Start", ...running },
    ];

    matches.forEach((m, i) => {
      const picks = byMatch.get(m.id);
      if (picks && m.outcome) {
        for (const p of predictors) {
          if (picks.get(p.id) === m.outcome) running[p.id] = (running[p.id] ?? 0) + 1;
        }
      }
      data.push({
        idx: i + 1,
        label: `${i + 1}. ${m.home_team.slice(0, 3).toUpperCase()}–${m.away_team
          .slice(0, 3)
          .toUpperCase()}`,
        ...running,
      });
    });

    const lines = predictors.map((p, i) => ({
      id: p.id,
      name: p.name,
      color: LINE_COLORS[i % LINE_COLORS.length],
    }));

    return { chartData: data, lines };
  }, [matches, predictors, predictions]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl gold-text">Score Progression</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cumulative correct picks per guesser across completed matches (+1 per correct pick).
        </p>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading chart…</div>
      ) : matches.length === 0 ? (
        <div className="rounded border border-[--gold-deep]/40 bg-background/40 p-6 text-sm text-muted-foreground">
          No completed matches yet — chart will populate as results come in.
        </div>
      ) : (
        <div className="rounded border border-[--gold-deep]/40 bg-background/40 p-3 sm:p-4">
          <div className="h-[60vh] min-h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: -16 }}>
                <CartesianGrid stroke="rgba(229,199,107,0.12)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="idx"
                  stroke="rgba(229,199,107,0.5)"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: "Match #",
                    position: "insideBottom",
                    offset: -4,
                    fill: "rgba(229,199,107,0.6)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  stroke="rgba(229,199,107,0.5)"
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1a2a",
                    border: "1px solid rgba(229,199,107,0.4)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={(idx) => {
                    const row = chartData[idx as number];
                    return row?.label ?? `Match ${idx}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {lines.map((l) => (
                  <Line
                    key={l.id}
                    type="monotone"
                    dataKey={l.id}
                    name={l.name}
                    stroke={l.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </main>
  );
}
