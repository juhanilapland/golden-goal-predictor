import { createFileRoute } from "@tanstack/react-router";

type FDMatch = {
  id: number;
  utcDate: string;
  status: string;
  stage: string;
  group: string | null;
  homeTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null };
  awayTeam: { name: string | null; shortName: string | null; tla: string | null; crest: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

function outcomeOf(home: number | null, away: number | null): string | null {
  if (home == null || away == null) return null;
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

async function handleSync() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "FOOTBALL_DATA_TOKEN not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": token },
  });

  if (!res.ok) {
    const body = await res.text();
    return new Response(
      JSON.stringify({ error: "Upstream API failed", status: res.status, body: body.slice(0, 500) }),
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  const data = (await res.json()) as { matches: FDMatch[] };
  const rows = data.matches.map((m) => ({
    id: m.id,
    stage: m.stage,
    group_name: m.group,
    kickoff: m.utcDate,
    home_team: m.homeTeam.name ?? m.homeTeam.shortName ?? "TBD",
    away_team: m.awayTeam.name ?? m.awayTeam.shortName ?? "TBD",
    home_code: m.homeTeam.crest,
    away_code: m.awayTeam.crest,
    status: m.status,
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
    outcome: m.status === "FINISHED" ? outcomeOf(m.score.fullTime.home, m.score.fullTime.away) : null,
  }));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("matches").upsert(rows, { onConflict: "id" });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ synced: rows.length }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const Route = createFileRoute("/api/public/sync-fixtures")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: handleSync,
      POST: handleSync,
    },
  },
});
