// MP02 — Carica foto cantiere.
//
// 25/09/2026: prima inseriva in foto_cantiere le colonne user_id e url, che la
// tabella non ha (ha uploaded_by e storage_path), e voleva dal modello un
// media_url che il modello non conosceva: ogni foto mandata su WhatsApp finiva
// in «Errore salvando la foto». Ora prende la foto arrivata con il messaggio
// (ctx.mediaCorrente, già scaricata da Meta nel bucket whatsapp-media), la
// copia nel bucket foto-cantiere con lo stesso percorso che usa l'app
// ({azienda}/{commessa}/{ora}-whatsapp.ext) e la registra: così compare nella
// galleria della commessa come quelle caricate dal telefono.

import type { ToolCtx, ToolResult, ToolDef } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { resolveCantiere } from "../shared/resolve_cantiere.ts";

export const caricaFotoCantiereDef: Omit<ToolDef, "handler"> = {
  name: "carica_foto_cantiere",
  description:
    "Salva sul cantiere la foto che l'utente ha appena mandato su WhatsApp, con descrizione e tag. " +
    "Non serve passare la foto: si usa quella arrivata con il messaggio.",
  parameters: {
    type: "object",
    properties: {
      order_id: { type: "string" },
      cantiere_hint: { type: "string", description: "Nome del cliente, indirizzo o numero della commessa" },
      descrizione: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: [],
    additionalProperties: false,
  },
  requires_grants: ["foto.write"],
};

interface Args {
  order_id?: string;
  cantiere_hint?: string;
  descrizione?: string;
  tags?: string[];
}

function estensione(storagePath: string): string {
  const m = storagePath.match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "jpg";
}

export async function caricaFotoCantiere(
  ctx: ToolCtx,
  args: Args,
): Promise<ToolResult<{ id: string }>> {
  const media = ctx.mediaCorrente;
  if (!media || media.tipo !== "image") {
    return errResult("no_media", "📷 Mandami la foto qui in chat (con una riga di descrizione) e la salvo sul cantiere.");
  }

  let orderId = args.order_id;
  if (orderId) {
    const { data: ordine } = await ctx.supabase
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("company_id", ctx.company_id)
      .maybeSingle();
    if (!ordine) orderId = undefined;
  }
  if (!orderId) {
    const resolved = await resolveCantiere(ctx, args.cantiere_hint);
    if (!resolved.cantiere_id) {
      return errResult("cantiere_ambiguous", resolved.ask_user ?? "A quale cantiere va questa foto?");
    }
    orderId = resolved.cantiere_id;
  }

  const { data: file, error: errScarica } = await ctx.supabase.storage
    .from("whatsapp-media")
    .download(media.storagePath);
  if (errScarica || !file) {
    return errResult(errScarica?.message ?? "download_vuoto", "Non riesco a recuperare la foto. Rimandamela, per favore.");
  }

  const percorso = `${ctx.company_id}/${orderId}/${Date.now()}-whatsapp.${estensione(media.storagePath)}`;
  const { error: errCarica } = await ctx.supabase.storage
    .from("foto-cantiere")
    .upload(percorso, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (errCarica) return errResult(errCarica.message, "Errore salvando la foto.");

  const { data: inserted, error } = await ctx.supabase
    .from("foto_cantiere")
    .insert({
      company_id: ctx.company_id,
      order_id: orderId,
      uploaded_by: ctx.user_id,
      storage_path: percorso,
      taken_at: new Date().toISOString(),
      descrizione: args.descrizione?.trim() || null,
      tags: args.tags ?? [],
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (error) {
    await ctx.supabase.storage.from("foto-cantiere").remove([percorso]);
    return errResult(error.message, "Errore salvando la foto.");
  }

  return okResult({ id: inserted.id }, "✅ Foto salvata sul cantiere.");
}
