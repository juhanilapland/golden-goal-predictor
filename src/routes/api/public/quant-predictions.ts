import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Public endpoint for pushing Quincy Quant's predictions from a locally-trained
// ML model. No auth header today (dev-only).
// TODO before publishing publicly: require a shared-secret header, e.g.
//   const expected = process.env.QUANT_PUSH_SECRET;
//   if (request.headers.get("x-quant-secret") !== expected) return new Response("unauthorized", { status: 401 });

const BodySchema = z.object({
  model: z.string().min(1).max(200),
  predictions: z
    .array(
      z.object({
        match_id: z.number().int().positive(),
        pick: z.enum(["home", "draw", "away"]),
        confidence: z.number().min(0).max(1).optional(),
        reasoning: z.string().max(500).optional(),
        prob_home: z.number().min(0).max(1).optional(),
        prob_draw: z.number().min(0).max(1).optional(),
        prob_away: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(200),
});

const methodNotAllowed = () =>
  new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });

export const Route = createFileRoute("/api/public/quant-predictions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid body", details: parsed.error.flatten() }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const rows = parsed.data.predictions.map((p) => {
          const conf = typeof p.confidence === "number" ? ` (confidence=${p.confidence.toFixed(2)})` : "";
          const reasoning = `${p.reasoning ?? "Local logistic regression."}${conf}`;
          return {
            match_id: p.match_id,
            predictor: "quant",
            pick: p.pick,
            reasoning: reasoning.slice(0, 500),
            model: "local-logreg",
            prob_home: p.prob_home ?? null,
            prob_draw: p.prob_draw ?? null,
            prob_away: p.prob_away ?? null,
          };
        });

        const { error } = await supabaseAdmin
          .from("predictions")
          .upsert(rows, { onConflict: "match_id,predictor" });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ inserted: rows.length }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => methodNotAllowed(),
      DELETE: async () => methodNotAllowed(),
    },
  },
});
