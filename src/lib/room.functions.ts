import { createServerFn } from "@tanstack/react-start";
import {
  RIVAL_ORDER,
  RIVAL_NAMES,
  RIVAL_PERSONAS,
  RIVAL_LOYALTIES,
  type RivalId,
} from "@/lib/predictors/personas";
import { outcomeFromScore, stageWeight, type Pick } from "@/lib/wc-config";

type Standing = {
  rivalId: RivalId;
  points: number;
  correct: number;
  total: number;
  rank: number;
  streak: string; // e.g. "WWLW-" (most recent last)
};

type ChatRow = { author: string; body: string; created_at: string };

type MatchWithPreds = {
  id: number;
  stage: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  outcome: string | null;
  predictions: { predictor: string; pick: Pick; reasoning: string | null }[];
};

function authorDisplay(author: string): string {
  if (author === "juhani") return "Juhani";
  return RIVAL_NAMES[author as RivalId] ?? author;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGateway(apiKey: string, prompt: string): Promise<string | null> {
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
    if (!res.ok) {
      console.warn("[room] gateway HTTP", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { message?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      // Some models return prose instead of JSON; treat the raw content as the message.
      parsed = { message: content };
    }
    let msg = String(parsed.message ?? "").trim();
    if (!msg) {
      console.warn("[room] gateway empty message", JSON.stringify(json).slice(0, 300));
      return null;
    }
    msg = msg.replace(/^[A-Za-z .'-]{2,30}:\s*/, "");
    if (msg.length > 400) msg = msg.slice(0, 400);
    return msg;
  } catch (e) {
    console.warn("[room] gateway threw", (e as Error).message);
    return null;
  }
}

const FALLBACK_MESSAGES: Record<RivalId, string> = {
  random: "…dice rolled off the table. Skipping this one.",
  stats: "Skipping — insufficient signal this round.",
  magician: "Model timed out. Next match.",
  adriana: "Madonna mia, my microphone is dead. Next time, amore.",
  vibes: "the signal is muddled tonight 🌙 i'll return when the cards are clearer",
  fanatic: "lost connection mid-rant — back next match",
  quant: "Inference timeout; deferring to the prior. Skipping this turn.",
};

type TeamForm = { results: string[]; w: number; d: number; l: number; streak: string };

function computeTeamForm(
  allFinished: { home_team?: string; away_team?: string; outcome: string | null; home_score: number | null; away_score: number | null }[],
  matchesWithTeams: { home_team: string; away_team: string }[],
): Map<string, TeamForm> {
  // We need home_team/away_team on allFinished; if missing fall back to empty form.
  const form = new Map<string, TeamForm>();
  for (const m of allFinished) {
    if (!m.home_team || !m.away_team) continue;
    const actual = m.outcome ?? outcomeFromScore(m.home_score, m.away_score);
    if (!actual) continue;
    for (const team of [m.home_team, m.away_team]) {
      if (!form.has(team)) form.set(team, { results: [], w: 0, d: 0, l: 0, streak: "" });
    }
    const h = form.get(m.home_team)!;
    const a = form.get(m.away_team)!;
    if (actual === "home") { h.results.push("W"); h.w++; a.results.push("L"); a.l++; }
    else if (actual === "away") { a.results.push("W"); a.w++; h.results.push("L"); h.l++; }
    else { h.results.push("D"); h.d++; a.results.push("D"); a.d++; }
  }
  // Compute current streak (consecutive identical results at the tail).
  for (const f of form.values()) {
    if (f.results.length === 0) { f.streak = "—"; continue; }
    const last = f.results[f.results.length - 1];
    let n = 0;
    for (let i = f.results.length - 1; i >= 0 && f.results[i] === last; i--) n++;
    f.streak = `${last}${n}`;
  }
  // Only keep teams referenced in the recent matches block.
  const wanted = new Set<string>();
  for (const m of matchesWithTeams) { wanted.add(m.home_team); wanted.add(m.away_team); }
  for (const team of Array.from(form.keys())) {
    if (!wanted.has(team)) form.delete(team);
  }
  return form;
}

function formatFormBlock(form: Map<string, TeamForm>): string {
  if (form.size === 0) return "";
  const lines = Array.from(form.entries()).map(([team, f]) => {
    const last5 = f.results.slice(-5).join("");
    let flag = "";
    if (f.streak.startsWith("W") && Number(f.streak.slice(1)) >= 3) flag = " 🔥";
    else if (f.streak.startsWith("L") && Number(f.streak.slice(1)) >= 2) flag = " 🥶";
    return `- ${team}: ${last5} · ${f.w}W-${f.d}D-${f.l}L · streak: ${f.streak}${flag}`;
  });
  return `\nFORM CONTEXT (last 5, oldest → newest):\n${lines.join("\n")}\n`;
}

function buildPrompt(
  rivalId: RivalId,
  persona: string,
  rivalMatches: MatchWithPreds[],
  chat: ChatRow[],
  matchesHeader: string,
  standings: Standing[],
  formBlock: string,
): string {
  const myPicks = rivalMatches.map((m) => {
    const mine = m.predictions.find((p) => p.predictor === rivalId);
    const actual = m.outcome ?? outcomeFromScore(m.home_score, m.away_score);
    const correct = mine && actual && mine.pick === actual;
    const pts = correct ? stageWeight(m.stage) : 0;
    return `- ${m.home_team} ${m.home_score ?? "?"}-${m.away_score ?? "?"} ${m.away_team} | my pick: ${mine?.pick ?? "—"}${mine?.reasoning ? ` ("${mine.reasoning}")` : ""} | actual: ${actual ?? "?"} | ${correct ? `+${pts} pts ✓` : "0 pts ✗"}`;
  });

  const transcript = chat
    .map((c) => `${authorDisplay(c.author)}: ${c.body}`)
    .join("\n");

  const board = standings
    .map(
      (s) =>
        `${s.rank}. ${RIVAL_NAMES[s.rivalId]}${s.rivalId === rivalId ? " (you)" : ""} — ${s.points} pts, ${s.correct}/${s.total} correct, last 5: ${s.streak || "—"}`,
    )
    .join("\n");

  const me = standings.find((s) => s.rivalId === rivalId);
  const loyalty = RIVAL_LOYALTIES[rivalId];
  const loyaltyLine = `You love: ${loyalty.loves.join(", ")}. You can't stand: ${loyalty.hates.join(", ")}. (${loyalty.note}) — let this bias show when those teams come up, but never break character to explain it.`;

  const standingLine = me
    ? `You are currently RANK ${me.rank}/${standings.length} with ${me.points} pts. Your last 5 picks: ${me.streak || "—"}. React in character to this position (gloat if 1st, deflect if last, panic on a losing streak, smug on a winning one).`
    : "";

  return `${persona}

${loyaltyLine}

Current leaderboard (most points first):
${board || "(no scoring yet)"}

${standingLine}

${matchesHeader}
${myPicks.join("\n") || "(no recent results yet)"}
${formBlock}
Current chat in the game room (oldest first):
${transcript || "(empty)"}

Now write your NEXT message in this chat. Stay fully in character. Max 2 short sentences. React to what was just said and/or the results above. Do NOT prefix with your name. Respond as JSON only: {"message": "..."}`;
}

export const generateRoomReplies = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.LOVABLE_API_KEY ?? "";
  if (!apiKey) return { replied: 0, error: "missing LOVABLE_API_KEY" };

  // Load last 20 chat messages
  const { data: chatDesc } = await supabaseAdmin
    .from("chat_messages")
    .select("author, body, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const chat = (chatDesc ?? []).reverse() as ChatRow[];

  // Find most recent juhani message
  const lastJuhaniIdx = [...chat].map((c) => c.author).lastIndexOf("juhani");
  if (lastJuhaniIdx === -1) return { replied: 0, skipped: "no user message yet" };
  const afterJuhani = chat.slice(lastJuhaniIdx + 1);
  const alreadyReplied = new Set(afterJuhani.map((c) => c.author));
  const todo = RIVAL_ORDER.filter((r) => !alreadyReplied.has(r));
  if (todo.length === 0) return { replied: 0, skipped: "all rivals already replied" };

  // Determine the "since" timestamp: the chat message immediately before this juhani message,
  // or a 7-day cold-start window if juhani's message is the very first in the room.
  let sinceTs: string;
  let usingSinceLastChat: boolean;
  if (lastJuhaniIdx > 0) {
    sinceTs = chat[lastJuhaniIdx - 1].created_at;
    usingSinceLastChat = true;
  } else {
    sinceTs = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    usingSinceLastChat = true;
  }

  // Load matches finished since then (chronological).
  let { data: finishedMatches } = await supabaseAdmin
    .from("matches")
    .select("id, stage, home_team, away_team, home_score, away_score, outcome, updated_at")
    .eq("status", "FINISHED")
    .gt("updated_at", sinceTs)
    .order("kickoff", { ascending: true })
    .limit(20);

  // Fallback: if nothing new, grab the latest 3 finished so the room still has context.
  if (!finishedMatches || finishedMatches.length === 0) {
    const { data: recent } = await supabaseAdmin
      .from("matches")
      .select("id, stage, home_team, away_team, home_score, away_score, outcome, updated_at")
      .eq("status", "FINISHED")
      .order("kickoff", { ascending: false })
      .limit(3);
    finishedMatches = (recent ?? []).slice().reverse();
    usingSinceLastChat = false;
  }

  const matchesHeader = usingSinceLastChat
    ? "Matches finished since the last chat (chronological):"
    : "Recent finished matches and how you did:";

  const matchIds = (finishedMatches ?? []).map((m) => m.id);
  const { data: preds } = matchIds.length
    ? await supabaseAdmin
        .from("predictions")
        .select("match_id, predictor, pick, reasoning")
        .in("match_id", matchIds)
    : { data: [] as { match_id: number; predictor: string; pick: string; reasoning: string | null }[] };

  const matchesWithPreds: MatchWithPreds[] = (finishedMatches ?? []).map((m) => ({
    ...m,
    predictions: (preds ?? [])
      .filter((p) => p.match_id === m.id)
      .map((p) => ({ predictor: p.predictor, pick: p.pick as Pick, reasoning: p.reasoning })),
  }));

  // Load persona overrides from DB; fall back to code defaults per rival.
  const { data: personaRows } = await supabaseAdmin
    .from("rival_personas")
    .select("rival_id, persona");
  const personaOverrides = new Map<string, string>(
    (personaRows ?? []).map((r) => [r.rival_id, r.persona]),
  );

  // Compute standings across ALL finished matches (cumulative leaderboard + streak).
  const { data: allFinished } = await supabaseAdmin
    .from("matches")
    .select("id, stage, home_team, away_team, home_score, away_score, outcome, kickoff")
    .eq("status", "FINISHED")
    .order("kickoff", { ascending: true });
  const allMatchIds = (allFinished ?? []).map((m) => m.id);
  const { data: allPreds } = allMatchIds.length
    ? await supabaseAdmin
        .from("predictions")
        .select("match_id, predictor, pick")
        .in("match_id", allMatchIds)
    : { data: [] as { match_id: number; predictor: string; pick: string }[] };

  const predsByMatch = new Map<number, { predictor: string; pick: string }[]>();
  for (const p of allPreds ?? []) {
    const arr = predsByMatch.get(p.match_id) ?? [];
    arr.push({ predictor: p.predictor, pick: p.pick });
    predsByMatch.set(p.match_id, arr);
  }

  const acc: Record<string, { points: number; correct: number; total: number; history: string[] }> = {};
  for (const r of RIVAL_ORDER) acc[r] = { points: 0, correct: 0, total: 0, history: [] };
  for (const m of allFinished ?? []) {
    const actual = m.outcome ?? outcomeFromScore(m.home_score, m.away_score);
    if (!actual) continue;
    const rowPreds = predsByMatch.get(m.id) ?? [];
    for (const p of rowPreds) {
      const a = acc[p.predictor];
      if (!a) continue;
      a.total++;
      if (p.pick === actual) {
        a.correct++;
        a.points += stageWeight(m.stage);
        a.history.push("W");
      } else {
        a.history.push("L");
      }
    }
  }
  const standings: Standing[] = RIVAL_ORDER.map((r) => ({
    rivalId: r,
    points: acc[r].points,
    correct: acc[r].correct,
    total: acc[r].total,
    rank: 0,
    streak: acc[r].history.slice(-5).join(""),
  }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct)
    .map((s, i) => ({ ...s, rank: i + 1 }));

  let replied = 0;
  let runningChat: ChatRow[] = [...chat];

  const teamForm = computeTeamForm(allFinished ?? [], matchesWithPreds);
  const fanaticFormBlock = formatFormBlock(teamForm);

  for (const rivalId of todo) {
    const persona = personaOverrides.get(rivalId) ?? RIVAL_PERSONAS[rivalId];
    const formBlock = rivalId === "fanatic" ? fanaticFormBlock : "";
    const prompt = buildPrompt(rivalId, persona, matchesWithPreds, runningChat, matchesHeader, standings, formBlock);
    const message = await callGateway(apiKey, prompt);
    const finalMessage = message ?? FALLBACK_MESSAGES[rivalId];
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("chat_messages")
      .insert({ author: rivalId, body: finalMessage })
      .select("author, body, created_at")
      .single();
    if (insErr) {
      console.warn("[room] insert failed for", rivalId, insErr.message);
    }
    if (inserted) {
      runningChat.push(inserted as ChatRow);
      if (runningChat.length > 20) runningChat = runningChat.slice(-20);
      if (message) replied++;
    }
    // Stagger 1.5–4s before the next rival
    await delay(1500 + Math.random() * 2500);
  }

  return { replied };
});
