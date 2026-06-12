import { createFileRoute } from "@tanstack/react-router";

// Public endpoint exposing finished, scored matches for the local Quincy Quant
// pipeline to retrain on. Dev-only; add a shared-secret header before exposing publicly.
// TODO: require x-quant-secret header before publishing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PLACEHOLDER_PATTERNS = ["Winner ", "Runner-up "];

function isPlaceholder(team: string | null | undefined): boolean {
  if (!team) return true;
  if (team === "TBD") return true;
  return PLACEHOLDER_PATTERNS.some((p) => team.startsWith(p));
}

export const Route = createFileRoute("/api/public/quant-results")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("matches")
          .select("id, kickoff, stage, group_name, home_team, away_team, home_score, away_score")
          .eq("status", "FINISHED")
          .not("home_score", "is", null)
          .not("away_score", "is", null)
          .order("kickoff", { ascending: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const results = (data ?? [])
          .filter((m) => !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team))
          .map((m) => ({
            match_id: m.id,
            date: m.kickoff,
            stage: m.stage,
            group_name: m.group_name,
            home_team: m.home_team,
            away_team: m.away_team,
            home_score: m.home_score,
            away_score: m.away_score,
            tournament: "FIFA World Cup",
            country: null as string | null,
            neutral: true,
          }));

        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
