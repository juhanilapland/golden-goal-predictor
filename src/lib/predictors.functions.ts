import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { rating } from "@/lib/predictors/ratings";
import { isKnockout } from "@/lib/wc-config";
import { computeForm, type FormRow } from "@/lib/team-form";

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
  // Neutral-venue model: rating diff drives both sides symmetrically. No home boost.
  const h = rating(m.home_team);
  const a = rating(m.away_team);
  const pHome = 1 / (1 + Math.pow(10, (a - h) / 200));
  const pAway = 1 - pHome;
  const drawBase = isKnockout(m.stage) ? 0 : 0.28;
  const pDraw = drawBase * Math.exp(-Math.pow((h - a) / 250, 2));
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
    ? `${m.home_team} ${fmt(probs.home / (probs.home + probs.away))} / ${m.away_team} ${fmt(probs.away / (probs.home + probs.away))}`
    : `${m.home_team} ${fmt(probs.home)} / Draw ${fmt(probs.draw)} / ${m.away_team} ${fmt(probs.away)}`;
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

Match: ${m.home_team} vs ${m.away_team} (neutral venue — World Cup, no home advantage)
Stage: ${m.stage}${m.group_name ? ` · ${m.group_name}` : ""}
Allowed picks: ${allowed} (where "home" = ${m.home_team}, "away" = ${m.away_team})

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

const PREDICTORS = ["random", "stats", "magician", "adriana", "vibes", "fanatic", "quant"] as const;

type SupabaseAdmin = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

async function pickFanatic(m: MatchRow, supabaseAdmin: SupabaseAdmin): Promise<PredictionInsert> {
  const { data: prior } = await supabaseAdmin
    .from("matches")
    .select("home_team, away_team, outcome")
    .eq("status", "FINISHED")
    .lt("kickoff", m.kickoff)
    .or(
      `home_team.in.("${m.home_team}","${m.away_team}"),away_team.in.("${m.home_team}","${m.away_team}")`,
    );

  let winsH = 0;
  let winsA = 0;
  for (const row of prior ?? []) {
    if (row.outcome === "home") {
      if (row.home_team === m.home_team) winsH++;
      else if (row.home_team === m.away_team) winsA++;
    } else if (row.outcome === "away") {
      if (row.away_team === m.home_team) winsH++;
      else if (row.away_team === m.away_team) winsA++;
    }
  }

  const knockout = isKnockout(m.stage);
  let pick: Pick;
  let reasoning: string;
  if (winsH > winsA) {
    pick = "home";
    reasoning = `${m.home_team} ${winsH}W · ${m.away_team} ${winsA}W — backing ${m.home_team}.`;
  } else if (winsA > winsH) {
    pick = "away";
    reasoning = `${m.home_team} ${winsH}W · ${m.away_team} ${winsA}W — backing ${m.away_team}.`;
  } else {
    const opts: Pick[] = knockout ? ["home", "away"] : ["home", "draw", "away"];
    pick = opts[Math.floor(Math.random() * opts.length)];
    reasoning =
      winsH === 0 && winsA === 0
        ? `No prior games — coin flip → ${pick}.`
        : `Both ${winsH}W — tie, rolled ${pick}.`;
  }
  return { match_id: m.id, predictor: "fanatic", pick, reasoning, model: null };
}

// ---------- Quincy Quant ----------
// Multinomial logistic regression over (rating diff, form diff). Coefficients
// are fixed constants calibrated from historical international fixtures —
// rating gap dominates, recent form is a small adjustment, ~26% baseline draw
// in group stage. World Cup games are at neutral venues, so no home boost.
const QUANT_BETA = {
  intercept: -0.55, // log-odds of a side vs draw at zero feature values (~26% draw rate)
  rating: 1.25, // per 100-Elo-points of rating diff
  form: 0.35, // per 1.0 PPG of recent-form diff
};

function pickQuant(m: MatchRow, history: FormRow[]): PredictionInsert {
  const rDiff = (rating(m.home_team) - rating(m.away_team)) / 100;
  const fHome = computeForm(history, m.home_team);
  const fAway = computeForm(history, m.away_team);
  const fDiff = fHome - fAway;
  const knockout = isKnockout(m.stage);
  const linear = QUANT_BETA.rating * rDiff + QUANT_BETA.form * fDiff;
  const zHome = (knockout ? 0 : QUANT_BETA.intercept) + linear;
  const zAway = (knockout ? 0 : QUANT_BETA.intercept) - linear;
  const zDraw = 0;
  const zs = knockout ? [zHome, zAway] : [zHome, zDraw, zAway];
  const max = Math.max(...zs);
  const exps = zs.map((z) => Math.exp(z - max));
  const denom = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / denom);
  const pHome = probs[0];
  const pAway = knockout ? probs[1] : probs[2];
  const pDraw = knockout ? 0 : probs[1];
  let pick: Pick = "draw";
  if (knockout) pick = pHome >= pAway ? "home" : "away";
  else {
    const top = Math.max(pHome, pDraw, pAway);
    pick = top === pHome ? "home" : top === pAway ? "away" : "draw";
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const reasoning = knockout
    ? `${m.home_team} ${pct(pHome)} / ${m.away_team} ${pct(pAway)} — β·Δrating ${rDiff.toFixed(2)}, β·Δform ${fDiff.toFixed(2)}`
    : `${m.home_team} ${pct(pHome)} / Draw ${pct(pDraw)} / ${m.away_team} ${pct(pAway)} — Δrating ${rDiff.toFixed(2)}, Δform ${fDiff.toFixed(2)}`;
  return { match_id: m.id, predictor: "quant", pick, reasoning, model: "multinomial-logit-v1" };
}

async function generateForMatches(matches: MatchRow[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY ?? "";

  const ids = matches.map((m) => m.id);
  const { data: existing } = await supabaseAdmin
    .from("predictions")
    .select("match_id, predictor")
    .in("match_id", ids);
  const have = new Set((existing ?? []).map((r) => `${r.match_id}:${r.predictor}`));

  // Pre-fetch all finished matches once for Quant's form feature.
  const needsQuant = matches.some((m) => !have.has(`${m.id}:quant`));
  let history: FormRow[] = [];
  if (needsQuant) {
    const { data: hist } = await supabaseAdmin
      .from("matches")
      .select("home_team, away_team, outcome, kickoff")
      .eq("status", "FINISHED");
    history = (hist ?? []) as FormRow[];
  }

  const inserts: PredictionInsert[] = [];
  await Promise.all(
    matches.map(async (m) => {
      const tasks: Promise<PredictionInsert>[] = [];
      // Quant uses only matches strictly before this fixture's kickoff.
      const priorHistory = history.filter((h) => +new Date(h.kickoff) < +new Date(m.kickoff));
      for (const p of PREDICTORS) {
        if (have.has(`${m.id}:${p}`)) continue;
        if (p === "random") tasks.push(Promise.resolve(pickRandom(m)));
        else if (p === "stats") tasks.push(Promise.resolve(pickStats(m)));
        else if (p === "magician") tasks.push(Promise.resolve(pickMagician(m)));
        else if (p === "vibes") tasks.push(Promise.resolve(pickVibes(m)));
        else if (p === "adriana") tasks.push(pickAdriana(m, apiKey));
        else if (p === "fanatic") tasks.push(pickFanatic(m, supabaseAdmin));
        else if (p === "quant") tasks.push(Promise.resolve(pickQuant(m, priorHistory)));
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

// Backfills any (match × predictor) pair missing a prediction — across all matches,
// not just upcoming ones. This is what lets a new guesser added mid-tournament
// participate fairly: their picks get generated for every past match too.
// Safe because the upsert's onConflict("match_id,predictor") never overwrites
// an existing pick, and none of the predictors peek at match outcomes
// (Freddy only reads FINISHED matches strictly before m.kickoff).
export const generateAllMissingPicks = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Only backfill matches that already have at least one prediction — i.e. ones
  // the user has picked at some point (picks are what trigger rival generation).
  // Future un-picked matches stay untouched until the user picks them.
  const { data: predRows, error: predErr } = await supabaseAdmin
    .from("predictions")
    .select("match_id");
  if (predErr) throw new Error(predErr.message);
  const ids = Array.from(new Set((predRows ?? []).map((r) => r.match_id)));
  if (ids.length === 0) return { generated: 0 };
  const { data: matches, error } = await supabaseAdmin
    .from("matches")
    .select("id, stage, group_name, home_team, away_team, kickoff, status")
    .in("id", ids)
    .order("kickoff", { ascending: true });
  if (error) throw new Error(error.message);
  return await generateForMatches((matches ?? []) as MatchRow[]);
});
