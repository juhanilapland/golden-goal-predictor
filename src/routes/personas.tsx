import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { listPersonas, savePersona, resetPersona, type PersonaRow } from "@/lib/personas.functions";
import { RIVAL_NAMES, RIVAL_ORDER, RIVAL_PERSONAS, type RivalId } from "@/lib/predictors/personas";
import avatarRandom from "@/assets/avatar-random.jpg";
import avatarStats from "@/assets/avatar-stats.jpg";
import avatarMagician from "@/assets/avatar-magician.jpg";
import avatarAdriana from "@/assets/avatar-adriana.jpg";
import avatarVibes from "@/assets/avatar-vibes.jpg";
import avatarFanatic from "@/assets/avatar-fanatic.jpg";

const AVATARS: Record<RivalId, string> = {
  random: avatarRandom,
  stats: avatarStats,
  magician: avatarMagician,
  adriana: avatarAdriana,
  vibes: avatarVibes,
  fanatic: avatarFanatic,
};

const MAX_LEN = 2000;

export const Route = createFileRoute("/personas")({
  head: () => ({
    meta: [
      { title: "Persona Workshop — WC 2026" },
      { name: "description", content: "Edit how each AI rival writes in the Game Room." },
    ],
  }),
  component: PersonasPage,
});

function PersonasPage() {
  const list = useServerFn(listPersonas);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["personas"],
    queryFn: () => list(),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl gold-text">Persona Workshop</h1>
        <p className="text-muted-foreground text-sm mt-2 max-w-2xl">
          Each rival's chat reply is generated with their persona below, plus their picks,
          actual results, and the last 20 chat messages.{" "}
          <Link to="/room" className="text-[--gold] hover:underline">Test in the Room →</Link>
        </p>
      </header>

      {isLoading || !data ? (
        <div className="text-center text-muted-foreground py-10">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((row) => (
            <PersonaCard key={row.rival_id} row={row} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaCard({ row, onChanged }: { row: PersonaRow; onChanged: () => void }) {
  const [draft, setDraft] = useState(row.persona);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(savePersona);
  const reset = useServerFn(resetPersona);

  // Reset local draft if the server row changes underneath (e.g. after reset).
  useEffect(() => {
    setDraft(row.persona);
  }, [row.persona, row.isDefault]);

  const dirty = draft.trim() !== row.persona.trim();
  const tooLong = draft.length > MAX_LEN;
  const tooShort = draft.trim().length < 10;

  const handleSave = useCallback(async () => {
    if (!dirty || saving || tooLong || tooShort) return;
    setSaving(true);
    try {
      await save({ data: { rival_id: row.rival_id, persona: draft.trim() } });
      toast.success(`${RIVAL_NAMES[row.rival_id]} updated`);
      onChanged();
    } catch (e) {
      toast.error("Save failed: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, tooLong, tooShort, save, row.rival_id, draft, onChanged]);

  const handleReset = useCallback(async () => {
    if (saving) return;
    if (!confirm(`Reset ${RIVAL_NAMES[row.rival_id]} to the default persona?`)) return;
    setSaving(true);
    try {
      await reset({ data: { rival_id: row.rival_id } });
      setDraft(RIVAL_PERSONAS[row.rival_id]);
      toast.success(`${RIVAL_NAMES[row.rival_id]} reset to default`);
      onChanged();
    } catch (e) {
      toast.error("Reset failed: " + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [saving, reset, row.rival_id, onChanged]);

  return (
    <div className="gold-border bg-card rounded-lg p-4 flex flex-col">
      <div className="flex items-center gap-3 mb-3">
        <img
          src={AVATARS[row.rival_id]}
          alt={RIVAL_NAMES[row.rival_id]}
          className="w-12 h-12 rounded-full object-cover ring-1 ring-[--gold-deep]"
        />
        <div className="flex-1 min-w-0">
          <div className="font-display text-base gold-text truncate">
            {RIVAL_NAMES[row.rival_id]}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[--gold-dim]">
            {row.isDefault ? "default" : "customized"}
          </div>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={12}
        className="w-full resize-y rounded-md bg-background gold-border px-3 py-2 text-xs leading-relaxed font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-[--gold]"
        placeholder="Describe how this rival writes…"
      />

      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
        <span className={tooLong ? "text-destructive" : ""}>
          {draft.length} / {MAX_LEN}
        </span>
        <span>
          {tooShort
            ? "too short"
            : dirty
              ? "unsaved changes"
              : "saved"}
        </span>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={!dirty || saving || tooLong || tooShort}
          className="flex-1 px-3 py-2 rounded-md bg-[--gold] text-[--primary-foreground] font-display uppercase tracking-widest text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={handleReset}
          disabled={saving || row.isDefault}
          className="px-3 py-2 rounded-md gold-border text-xs font-display uppercase tracking-widest text-muted-foreground hover:text-[--gold] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
