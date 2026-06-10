import { createServerFn } from "@tanstack/react-start";
import { RIVAL_ORDER, RIVAL_NAMES, RIVAL_PERSONAS, type RivalId } from "@/lib/predictors/personas";
import { outcomeFromScore, stageWeight, type Pick } from "@/lib/wc-config";

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
    if (!res.ok) return null;
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    let msg = String(parsed.message ?? "").trim();
    if (!msg) return null;
    // Strip leading "Name:" if model added it.
    msg = msg.replace(/^[A-Za-z .'-]{2,30}:\s*/, "");
    // Cap length
    if (msg.length > 400) msg = msg.slice(0, 400);
    return msg;
  } catch {
    return null;
  }
}

function buildPrompt(
  rivalId: RivalId,
  persona: string,
  rivalMatches: MatchWithPreds[],
  chat: ChatRow[],
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

  return `${persona}

Recent finished matches and how you did:
${myPicks.join("\n") || "(no recent results yet)"}

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

  // Load latest 5 finished matches with all predictions
  const { data: finishedMatches } = await supabaseAdmin
    .from("matches")
    .select("id, stage, home_team, away_team, home_score, away_score, outcome")
    .eq("status", "FINISHED")
    .order("kickoff", { ascending: false })
    .limit(5);
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

  let replied = 0;
  let runningChat: ChatRow[] = [...chat];

  for (const rivalId of todo) {
    const prompt = buildPrompt(rivalId, RIVAL_PERSONAS[rivalId], matchesWithPreds, runningChat);
    const message = await callGateway(apiKey, prompt);
    if (message) {
      const { data: inserted } = await supabaseAdmin
        .from("chat_messages")
        .insert({ author: rivalId, body: message })
        .select("author, body, created_at")
        .single();
      if (inserted) {
        runningChat.push(inserted as ChatRow);
        if (runningChat.length > 20) runningChat = runningChat.slice(-20);
        replied++;
      }
    }
    // Stagger 1.5–4s before the next rival
    await delay(1500 + Math.random() * 2500);
  }

  return { replied };
});
