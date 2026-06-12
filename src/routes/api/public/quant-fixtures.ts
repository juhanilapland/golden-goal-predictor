import { createFileRoute } from "@tanstack/react-router";

// Public endpoint that returns upcoming, unfinished group-stage fixtures for the
// local Quincy Quant pipeline to predict against. Dev-only; add a shared-secret
// header before exposing publicly.
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

export const Route = createFileRoute("/api/public/quant-fixtures")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("matches")
          .select("id, kickoff, stage, group_name, home_team, away_team, home_code, away_code, status")
          .eq("stage", "GROUP_STAGE")
          .neq("status", "FINISHED")
          .order("kickoff", { ascending: true });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const fixtures = (data ?? []).filter(
          (m) => !isPlaceholder(m.home_team) && !isPlaceholder(m.away_team),
        );

        return new Response(JSON.stringify({ fixtures }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      },
    },
  },
});
