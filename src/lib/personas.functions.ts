import { createServerFn } from "@tanstack/react-start";
import { RIVAL_ORDER, RIVAL_PERSONAS, type RivalId } from "@/lib/predictors/personas";

export type PersonaRow = {
  rival_id: RivalId;
  persona: string;
  isDefault: boolean;
  updated_at: string | null;
};

const MAX_LEN = 2000;

function isRivalId(x: string): x is RivalId {
  return (RIVAL_ORDER as readonly string[]).includes(x);
}

export const listPersonas = createServerFn({ method: "GET" }).handler(async (): Promise<PersonaRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("rival_personas")
    .select("rival_id, persona, updated_at");
  if (error) throw new Error(error.message);

  const byId = new Map<string, { persona: string; updated_at: string }>();
  for (const row of data ?? []) {
    byId.set(row.rival_id, { persona: row.persona, updated_at: row.updated_at });
  }

  return RIVAL_ORDER.map((rid) => {
    const row = byId.get(rid);
    return {
      rival_id: rid,
      persona: row?.persona ?? RIVAL_PERSONAS[rid],
      isDefault: !row,
      updated_at: row?.updated_at ?? null,
    };
  });
});

export const savePersona = createServerFn({ method: "POST" })
  .inputValidator((input: { rival_id: string; persona: string }) => {
    if (!isRivalId(input.rival_id)) throw new Error("Unknown rival_id");
    const persona = String(input.persona ?? "").trim();
    if (persona.length < 10) throw new Error("Persona must be at least 10 characters");
    if (persona.length > MAX_LEN) throw new Error(`Persona must be under ${MAX_LEN} characters`);
    return { rival_id: input.rival_id, persona };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rival_personas")
      .upsert({ rival_id: data.rival_id, persona: data.persona, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetPersona = createServerFn({ method: "POST" })
  .inputValidator((input: { rival_id: string }) => {
    if (!isRivalId(input.rival_id)) throw new Error("Unknown rival_id");
    return { rival_id: input.rival_id };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rival_personas")
      .delete()
      .eq("rival_id", data.rival_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
