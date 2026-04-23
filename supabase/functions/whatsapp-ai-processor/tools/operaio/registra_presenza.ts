// MP02 — Registra presenza entrata/uscita/pausa.
// UPSERT su hr_giornate (schema reale del progetto).

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";

export const registraPresenzaDef: Omit<ToolDef, "handler"> = {
  name: "registra_presenza",
  description:
    "Registra entrata/uscita/pausa dell'operaio con ora e coordinate opzionali. " +
    "UPSERT su hr_giornate (se stessa giornata, aggiorna invece di duplicare).",
  parameters: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["entrata", "uscita", "inizio_pausa", "fine_pausa"],
      },
      ora: { type: "string", description: "HH:MM (default ora corrente)" },
      lat: { type: "number" },
      lng: { type: "number" },
      note: { type: "string" },
    },
    required: ["tipo"],
    additionalProperties: false,
  },
  requires_grants: ["presenze.write"],
};

interface Args {
  tipo: "entrata" | "uscita" | "inizio_pausa" | "fine_pausa";
  ora?: string;
  lat?: number;
  lng?: number;
  note?: string;
}

export async function registraPresenza(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string; tipo: string }>> {
  if (!ctx.user_id) return errResult("no_user_id", "Non riesco a identificarti.");

  const now = new Date();
  const oggi = now.toISOString().substring(0, 10);
  const oraCorrente = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const ora = args.ora ?? oraCorrente;

  // Cerca giornata esistente
  const { data: existing } = await ctx.supabase
    .from("hr_giornate")
    .select("id, ora_entrata, ora_uscita, inizio_pausa, fine_pausa")
    .eq("user_id", ctx.user_id)
    .eq("data", oggi)
    .maybeSingle();

  const fieldMap: Record<Args["tipo"], string> = {
    entrata: "ora_entrata",
    uscita: "ora_uscita",
    inizio_pausa: "inizio_pausa",
    fine_pausa: "fine_pausa",
  };

  const colonnaOra = fieldMap[args.tipo];

  if (existing) {
    const updatePayload: Record<string, unknown> = {
      [colonnaOra]: ora,
      updated_at: new Date().toISOString(),
    };
    if (args.lat !== undefined) updatePayload.gps_lat = args.lat;
    if (args.lng !== undefined) updatePayload.gps_lng = args.lng;
    if (args.note) updatePayload.note = args.note;

    const { error } = await ctx.supabase
      .from("hr_giornate")
      .update(updatePayload)
      .eq("id", existing.id);
    if (error) return errResult(error.message, "Errore aggiornando la presenza.");
    return okResult(
      { id: existing.id, tipo: args.tipo },
      `✅ ${args.tipo.replace("_", " ")} registrata alle ${ora}.`,
    );
  }

  const insertPayload: Record<string, unknown> = {
    company_id: ctx.company_id,
    user_id: ctx.user_id,
    data: oggi,
    [colonnaOra]: ora,
    source: "whatsapp",
  };
  if (args.lat !== undefined) insertPayload.gps_lat = args.lat;
  if (args.lng !== undefined) insertPayload.gps_lng = args.lng;
  if (args.note) insertPayload.note = args.note;

  const { data: inserted, error } = await ctx.supabase
    .from("hr_giornate")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) return errResult(error.message, "Errore registrando la presenza.");

  return okResult(
    { id: inserted.id, tipo: args.tipo },
    `✅ ${args.tipo.replace("_", " ")} registrata alle ${ora}.`,
  );
}
