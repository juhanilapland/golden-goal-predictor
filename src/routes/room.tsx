import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateRoomReplies } from "@/lib/room.functions";
import { RIVAL_NAMES, RIVAL_ORDER, type RivalId } from "@/lib/predictors/personas";
import { toast } from "sonner";
import avatarJuhani from "@/assets/avatar-juhani.jpg";
import avatarRandom from "@/assets/avatar-random.jpg";
import avatarStats from "@/assets/avatar-stats.jpg";
import avatarMagician from "@/assets/avatar-magician.jpg";
import avatarAdriana from "@/assets/avatar-adriana.jpg";
import avatarVibes from "@/assets/avatar-vibes.jpg";
import avatarFanatic from "@/assets/avatar-fanatic.jpg";
import avatarQuant from "@/assets/avatar-quant.jpg";

const AVATARS: Record<string, string> = {
  juhani: avatarJuhani,
  random: avatarRandom,
  stats: avatarStats,
  magician: avatarMagician,
  adriana: avatarAdriana,
  vibes: avatarVibes,
  fanatic: avatarFanatic,
  quant: avatarQuant,
};

const NAMES: Record<string, string> = {
  juhani: "Juhani",
  ...RIVAL_NAMES,
};

type ChatMessage = {
  id: string;
  author: string;
  body: string;
  created_at: string;
};

export const Route = createFileRoute("/room")({
  head: () => ({
    meta: [
      { title: "Game Room — WC 2026" },
      { name: "description", content: "Banter with the AI rivals about World Cup 2026 results." },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const generateReplies = useServerFn(generateRoomReplies);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load initial messages + subscribe to realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);
      if (mounted) {
        setMessages((data ?? []) as ChatMessage[]);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel("chat_messages_room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Compute who hasn't replied to the last juhani message yet
  const pendingRivals = useMemo<RivalId[]>(() => {
    const lastJuhaniIdx = [...messages].map((m) => m.author).lastIndexOf("juhani");
    if (lastJuhaniIdx === -1) return [];
    const after = messages.slice(lastJuhaniIdx + 1);
    const replied = new Set(after.map((m) => m.author));
    return RIVAL_ORDER.filter((r) => !replied.has(r));
  }, [messages]);

  const rivalsReplying = sending || pendingRivals.length > 0;

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || sending || pendingRivals.length > 0) return;
    setSending(true);
    setInput("");
    const { error } = await supabase
      .from("chat_messages")
      .insert({ author: "juhani", body });
    if (error) {
      toast.error("Could not send: " + error.message);
      setSending(false);
      return;
    }
    // Fire the rival replies; they trickle in via realtime.
    generateReplies({})
      .catch((e) => {
        console.warn("Rival replies failed", e);
        toast.error("Rivals couldn't reply: " + (e as Error).message);
      })
      .finally(() => setSending(false));
  }, [input, sending, pendingRivals.length, generateReplies]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 flex flex-col" style={{ minHeight: "calc(100vh - 3.5rem)" }}>
      <header className="mb-4">
        <h1 className="text-3xl sm:text-4xl gold-text">Game Room</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Drop your hot take. The rivals will chime in.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 gold-border bg-card rounded-lg p-4 overflow-y-auto space-y-3 min-h-[400px]"
      >
        {loading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">
            No messages yet. Say something — like <i>"That surely was an odd result."</i>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {rivalsReplying && pendingRivals.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-[--gold-dim] italic pl-2 pt-2">
            <span className="inline-flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[--gold] animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-[--gold] animate-pulse" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[--gold] animate-pulse" style={{ animationDelay: "300ms" }} />
            </span>
            {NAMES[pendingRivals[0]]} is typing…
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            pendingRivals.length > 0 ? "Rivals are replying…" : "Type your message…"
          }
          disabled={rivalsReplying}
          rows={2}
          className="flex-1 resize-none rounded-md bg-background gold-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[--gold] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={rivalsReplying || !input.trim()}
          className="px-4 py-2 rounded-md bg-[--gold] text-[--primary-foreground] font-display uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed self-stretch"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isMe = message.author === "juhani";
  const name = NAMES[message.author] ?? message.author;
  const avatar = AVATARS[message.author];

  return (
    <div className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
      {avatar && (
        <img
          src={avatar}
          alt={name}
          className="w-8 h-8 rounded-full object-cover ring-1 ring-[--gold-deep] shrink-0"
        />
      )}
      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
        <span className="text-[10px] uppercase tracking-widest text-[--gold-dim] mb-0.5 px-1">
          {name}
        </span>
        <div
          className={[
            "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
            isMe
              ? "bg-[--gold] text-[--primary-foreground]"
              : "bg-muted text-foreground border border-[--gold-deep]/40",
          ].join(" ")}
        >
          {message.body}
        </div>
      </div>
    </div>
  );
}
