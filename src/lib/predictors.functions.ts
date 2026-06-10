import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rating } from "@/lib/predictors/ratings";
import { isKnockout } from "@/lib/wc-config";

type Pick = "home" | "draw" | "away";

type MatchRow = {
  id: number;
  stage: string;
  group_name: string | null;
  home_team: string;
  away_team: string;
  kickoff: string;
  status: string;
};

type PredictionInsert = {
  match_id: number;
  predictor: string;
  pick: Pick;
  reasoning: string | null;
  model: string | null;
};

// ---------- Strategies ----------

function pickRandom(m: MatchRow): PredictionInsert {
  const opts: Pick[] = isKnockout(m.stage) ? ["home", "away"] : ["home", "draw", "away"];
  const pick = opts[Math.floor(Math.random() * opts.length)];
  return {
    match_id: m.id,
    predictor: "random",
    pick,
    reasoning: "Pure chance.",
    model: null,
  };
}

function pickStats(m: MatchRow): PredictionInsert {
  const h = rating(m.home_team);
  const a = rating(m.away_team);
  const diff = h - a;
  let pick: Pick;
  if (!isKnockout(m.stage) && Math.abs(diff) < 40) pick = "draw";
  else pick = diff >= 0 ? "home" : "away";
  return {
    match_id: m.id,
    predictor: "stats",
    pick,
    reasoning: `${m.home_team} ${h} vs ${m.away_team} ${a} (Δ ${diff >= 0 ? "+" : ""}${diff}).`,
    model: null,
  };
}

function pickMagician(m: MatchRow): PredictionInsert {
  const h = rating(m.home_team);
  const a = rating(m.away_team);
  // Logistic-style win probability from rating diff (Elo-ish, scale 200).
  const pHome = 1 / (1 + Math.pow(10, (a - h) / 200));
  const pAway = 1 - pHome;
  // Draw probability decays with |diff|, capped in group stage only.
  const drawBase = isKnockout(m.stage) ? 0 : 0.28;
  const pDraw = drawBase * Math.exp(-Math.pow((h - a) / 250, 2));
  // Renormalize
  const sum = pHome * (1 - pDraw) + pAway * (1 - pDraw) + pDraw;
  const probs = {
    home: (pHome * (1 - pDraw)) / sum,
    draw: pDraw / sum,
    away: (pAway * (1 - pDraw)) / sum,
  };
  const entries = Object.entries(probs) as [Pick, number][];
  const allowed = isKnockout(m.stage) ? entries.filter(([k]) => k !== "draw") : entries;
  const pick = allowed.sort((x, y) => y[1] - x[1])[0][0];
  const fmt = (n: number) => `${Math.round(n * 100)}%`;
  const reasoning = isKnockout(m.stage)
    ? `H ${fmt(probs.home / (probs.home + probs.away))} / A ${fmt(probs.away / (probs.home + probs.away))}`
    : `H ${fmt(probs.home)} / D ${fmt(probs.draw)} / A ${fmt(probs.away)}`;
  return { match_id: m.id, predictor: "magician", pick, reasoning, model: "logistic-elo-v1" };
}

function pickVibes(m: MatchRow): PredictionInsert {
  // Logic intentionally undocumented in chat — see source.
  const seed = `${m.home_team}|${m.away_team}|${m.id}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const day = new Date(m.kickoff).getUTCDate();
  const vibe = (h ^ (day * 2654435761)) >>> 0;
  const opts: Pick[] = isKnockout(m.stage) ? ["home", "away"] : ["home", "draw", "away"];
  const pick = opts[vibe % opts.length];
  const vibesList = ["✨ aura", "🌙 moon phase", "🔮 inner whisper", "🎴 card pulled", "🌊 tide"];
  const reasoning = `${vibesList[vibe % vibesList.length]} says so.`;
  return { match_id: m.id, predictor: "vibes", pick, reasoning, model: null };
}

async function pickAdriana(m: MatchRow, apiKey: string): Promise<PredictionInsert> {
  const allowDraw = !isKnockout(m.stage);
  const allowed = allowDraw ? '"home" | "draw" | "away"' : '"home" | "away"';
  const prompt = `You are Adriana Idriano, a witty football pundit predicting World Cup 2026 matches.

Match: ${m.home_team} (home) vs ${m.away_team} (away)
Stage: ${m.stage}${m.group_name ? ` · ${m.group_name}` : ""}
Allowed picks: ${allowed}

Respond with a JSON object only: { "pick": ${allowed}, "reasoning": "one short sentence (max 140 chars)" }`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    let pick = parsed.pick as Pick;
    if (!["home", "draw", "away"].includes(pick) || (!allowDraw && pick === "draw")) {
      pick = rating(m.home_team) >= rating(m.away_team) ? "home" : "away";
    }
    return {
      match_id: m.id,
      predictor: "adriana",
      pick,
      reasoning: String(parsed.reasoning ?? "").slice(0, 200),
      model: "google/gemini-2.5-flash",
    };
  } catch (e) {
    // Fallback: gracefully degrade to a rating-based pick so we don't block the others.
    const pick: Pick = rating(m.home_team) >= rating(m.away_team) ? "home" : "away";
    return {
      match_id: m.id,
      predictor: "adriana",
      pick,
      reasoning: `(AI unavailable: ${(e as Error).message.slice(0, 80)})`,
      model: null,
    };
  }
}

// ---------- Core ----------

const PREDICTORS = ["random", "stats", "magician", "adriana", "vibes"] as const;

async function generateForMatches(matches: MatchRow[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY ?? "";

  const ids = matches.map((m) => m.id);
  const { data: existing } = await supabaseAdmin
    .from("predictions")
    .select("match_id, predictor")
    .in("match_id", ids);
  const have = new Set((existing ?? []).map((r) => `${r.match_id}:${r.predictor}`));

  const inserts: PredictionInsert[] = [];
  await Promise.all(
    matches.map(async (m) => {
      const tasks: Promise<PredictionInsert>[] = [];
      for (const p of PREDICTORS) {
        if (have.has(`${m.id}:${p}`)) continue;
        if (p === "random") tasks.push(Promise.resolve(pickRandom(m)));
        else if (p === "stats") tasks.push(Promise.resolve(pickStats(m)));
        else if (p === "magician") tasks.push(Promise.resolve(pickMagician(m)));
        else if (p === "vibes") tasks.push(Promise.resolve(pickVibes(m)));
        else if (p === "adriana") tasks.push(pickAdriana(m, apiKey));
      }
      const results = await Promise.all(tasks);
      inserts.push(...results);
    }),
  );

  if (inserts.length === 0) return { generated: 0 };

  const { error } = await supabaseAdmin
    .from("predictions")
    .upsert(inserts, { onConflict: "match_id,predictor" });
  if (error) throw new Error(error.message);
  return { generated: inserts.length };
}

export const generateCompetitorPicks = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ matchId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error } = await supabaseAdmin
      .from("matches")
      .select("id, stage, group_name, home_team, away_team, kickoff, status")
      .eq("id", data.matchId)
      .single();
    if (error || !m) throw new Error(error?.message ?? "Match not found");
    if (new Date(m.kickoff).getTime() <= Date.now()) return { generated: 0, skipped: "kicked off" };
    return await generateForMatches([m as MatchRow]);
  });

export const generateAllMissingPicks = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("id, stage, group_name, home_team, away_team, kickoff, status")
    .gte("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: true });
  if (error) throw new Error(error.message);
  return await generateForMatches((matches ?? []) as MatchRow[]);
});
