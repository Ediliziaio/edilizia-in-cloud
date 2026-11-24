// Carica il rilievo (piano sopralluoghi, lotto 9: docs/piano-sopralluoghi-vendita-tecnico.md).
//
// Chi fa il sopralluogo su carta manda la foto del foglio (o il PDF) su WhatsApp e dice che è un
// sopralluogo: il file finisce nel rilievo della commessa. Se c'è un rilievo da eseguire (bozza o
// in corso) va lì, preferendo quello di cui chi scrive è il tecnico; altrimenti nasce un rilievo
// «su carta» (modello della registrazione rapida, mode express). Come carica_foto_cantiere, il file
// arriva già scaricato da Meta nel bucket whatsapp-media (ctx.mediaCorrente).

import type { ToolCtx, ToolDef, ToolResult } from "../shared/types.ts";
import { errResult, okResult } from "../shared/types.ts";
import { sceltaCantiere } from "../shared/sceltaCantiere.ts";

const MODELLO_SU_CARTA = "feca0825-6909-4208-9ed7-cd52070ea1d5";

export const caricaRilievoDef: Omit<ToolDef, "handler"> = {
  name: "carica_rilievo",
  description:
    "Mette nel rilievo (sopralluogo) della commessa la foto o il PDF del foglio che l'utente ha appena " +
    "mandato su WhatsApp. Da usare quando dice che è un sopralluogo, un rilievo o le misure prese su carta; " +
    "per le foto normali del cantiere si usa carica_foto_cantiere. Non serve passare il file.",
  parameters: {
    type: "object",
    properties: {
      order_id: { type: "string" },
      cantiere_hint: { type: "string", description: "Nome del cliente, indirizzo o numero della commessa" },
      nota: { type: "string", description: "Cosa c'è nel foglio, se l'utente lo dice" },
    },
    required: [],
    additionalProperties: false,
  },
  requires_grants: ["foto.write"],
};

interface Args { order_id?: string; cantiere_hint?: string; nota?: string }

export interface RilievoAperto {
  id: string;
  code: string | null;
  technician_id: string | null;
  mode: string | null;
  scheduled_at: string | null;
  created_at: string;
}

/** Il rilievo da eseguire giusto: prima quello del tecnico che scrive, poi su carta, poi il più vicino. */
export function rilievoDaUsare(aperti: RilievoAperto[], userId: string | null): RilievoAperto | null {
  const peso = (r: RilievoAperto) => (r.technician_id && r.technician_id === userId ? 0 : 2) + (r.mode === "express" ? 0 : 1);
  return [...aperti].sort((a, b) =>
    peso(a) - peso(b) || String(b.scheduled_at ?? b.created_at).localeCompare(String(a.scheduled_at ?? a.created_at)))[0] ?? null;
}

const estensione = (percorso: string, mime: string) =>
  mime === "application/pdf" ? "pdf" : percorso.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? "jpg";

export async function caricaRilievo(ctx: ToolCtx, args: Args): Promise<ToolResult<{ survey_id: string; media_id: string }>> {
  const media = ctx.mediaCorrente;
  if (!media || (media.tipo !== "image" && media.tipo !== "document")) {
    return errResult("no_media", "📄 Mandami qui la foto del foglio del sopralluogo (o il PDF) e lo metto nel rilievo della commessa.");
  }

  let orderId = args.order_id;
  if (orderId) {
    const { data: ordine } = await ctx.supabase.from("orders").select("id").eq("id", orderId).eq("company_id", ctx.company_id).maybeSingle();
    if (!ordine) orderId = undefined;
  }
  let motivo: string | null = null;
  if (!orderId) {
    const scelta = await sceltaCantiere(ctx, { hint: args.cantiere_hint ?? null });
    if (!scelta.proposto) {
      if (scelta.candidati.length === 0) return errResult("site_missing", "Non risulti su nessun cantiere aperto: chiedi all'ufficio di aggiungerti alla squadra della commessa.");
      const elenco = scelta.candidati.slice(0, 9).map((c, i) => `${i + 1}. ${c.titolo} — ${c.dettaglio}`).join("\n");
      return errResult("cantiere_ambiguous", `Di quale cantiere è questo sopralluogo?\n${elenco}\n\nScrivimi il numero o il nome.`);
    }
    orderId = scelta.proposto.id;
    motivo = scelta.proposto.motivo;
  }

  const { data: ordine } = await ctx.supabase.from("orders")
    .select("id, order_code, description, client_name, customer_id, indirizzo_lavori")
    .eq("company_id", ctx.company_id).eq("id", orderId).maybeSingle();
  if (!ordine) return errResult("order_missing", "Non trovo la commessa. Dimmi il nome del cliente o il numero.");

  const { data: aperti } = await ctx.supabase.from("surveys")
    .select("id, code, technician_id, mode, scheduled_at, created_at")
    .eq("company_id", ctx.company_id).eq("order_id", orderId).is("deleted_at", null)
    .in("status", ["draft", "in_progress"]).limit(20);
  let rilievo = rilievoDaUsare((aperti ?? []) as RilievoAperto[], ctx.user_id);
  let nuovo = false;
  if (!rilievo) {
    const { data: creato, error } = await ctx.supabase.from("surveys").insert({
      company_id: ctx.company_id, template_id: MODELLO_SU_CARTA, mode: "express", tipo: "tecnico", ruolo_misure: "definitivo",
      status: "draft", order_id: orderId, client_id: ordine.customer_id ?? null, address: ordine.indirizzo_lavori ?? null,
      technician_id: ctx.user_id, created_by: ctx.user_id, notes: args.nota?.trim() || null,
    }).select("id, code, technician_id, mode, scheduled_at, created_at").single();
    if (error || !creato) return errResult(error?.message ?? "survey_insert", "Non riesco a creare il rilievo. Riprova tra poco o avvisa l'ufficio.");
    rilievo = creato as RilievoAperto;
    nuovo = true;
  }

  const { data: file, error: errScarica } = await ctx.supabase.storage.from("whatsapp-media").download(media.storagePath);
  if (errScarica || !file) return errResult(errScarica?.message ?? "download_vuoto", "Non riesco a recuperare il file. Rimandamelo, per favore.");
  const mime = file.type || (media.tipo === "document" ? "application/pdf" : "image/jpeg");
  if (media.tipo === "document" && mime !== "application/pdf") {
    return errResult("tipo_file", "Del sopralluogo mi servono foto o PDF: questo file non lo posso mettere nel rilievo.");
  }
  const tipo = mime === "application/pdf" ? "document" : "photo";
  const percorso = `${ctx.company_id}/${rilievo.id}/${tipo === "document" ? "documents" : "photos"}/${crypto.randomUUID()}.${estensione(media.storagePath, mime)}`;
  const { error: errCarica } = await ctx.supabase.storage.from("surveys").upload(percorso, file, { contentType: mime, upsert: false });
  if (errCarica) return errResult(errCarica.message, "Errore salvando il foglio.");

  const { data: inserito, error } = await ctx.supabase.from("survey_media").insert({
    survey_id: rilievo.id, type: tipo, url: "", storage_path: percorso,
    filename: `whatsapp-${new Date().toISOString().slice(0, 10)}.${estensione(media.storagePath, mime)}`,
    mime_type: mime, size_bytes: file.size, taken_at: new Date().toISOString(),
    checklist_label: args.nota?.trim() || null,
  }).select("id").single();
  if (error || !inserito) {
    await ctx.supabase.storage.from("surveys").remove([percorso]);
    return errResult(error?.message ?? "media_insert", "Errore salvando il foglio.");
  }
  await ctx.supabase.from("survey_activity_log").insert({
    survey_id: rilievo.id, user_id: ctx.user_id, event_type: "foglio_da_whatsapp", event_data: { media_id: inserito.id, tipo },
  });

  const nome = [ordine.client_name || ordine.description, ordine.order_code].filter(Boolean).join(" · ") || "cantiere";
  return okResult(
    { survey_id: rilievo.id, media_id: inserito.id },
    `✅ ${tipo === "document" ? "PDF" : "Foglio"} messo nel ${nuovo ? "nuovo rilievo su carta" : "rilievo"} ${rilievo.code ?? ""} di ${nome}${motivo ? ` (${motivo})` : ""}. ` +
      "Mandami pure le altre pagine: finiscono nello stesso rilievo.",
  );
}
