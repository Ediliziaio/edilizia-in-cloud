// Compatibility name. Prepares a project with a frozen model, not a PDF send.
import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
export const inviaPreventivoBagnoDef: Omit<ToolDef, "handler"> = {
  name: "invia_preventivo_bagno",
  description: "Dopo verifica_modello_preventivo e conferma prepara atomicamente progetto bagno e computo dal preventivo classico. Congela il modello ESATTO dell’azienda e rifiuta dati cambiati. Restituisce un link all’app: NON genera né invia un PDF. Mostra prima cliente, modello, tutte le voci e totale; passa le revisioni della verifica. Niente fallback generico, niente nuova esecuzione automatica dopo esito incerto.",
  parameters: { type: "object", additionalProperties: false, properties: {
    quote_id: { type: "string" },
    modello: { type: "string", enum: ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"] },
    revisione_modello: { type: "string", description: "Versione esatta dalla verifica, confermata dall’utente." },
    revisione_preventivo: { type: ["string", "null"], description: "Versione esatta del preventivo dalla verifica." },
  }, required: ["quote_id", "modello", "revisione_modello", "revisione_preventivo"] },
  requires_grants: ["preventivi.pdf"], requires_confirmation: true,
};
export async function inviaPreventivoBagno(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind)) return errResult("no_user", "Serve un utente dell’ufficio autorizzato.");
  if (typeof args.quote_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.quote_id) ||
    !["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"].includes(String(args.modello)) ||
    typeof args.revisione_modello !== "string" || !Number.isFinite(Date.parse(args.revisione_modello)) ||
    !(args.revisione_preventivo === null || (typeof args.revisione_preventivo === "string" && Number.isFinite(Date.parse(args.revisione_preventivo))))) {
    return errResult("invalid_args", "Verifica modello e preventivo, mostra le voci e chiedi conferma delle revisioni esatte.");
  }
  const { data, error } = await ctx.supabase.rpc("whatsapp_prepare_bathroom_quote", {
    p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_quote_id: args.quote_id,
    p_model_id: args.modello, p_model_revision: args.revisione_modello, p_quote_revision: args.revisione_preventivo,
  });
  if (error || data?.success !== true || typeof data.progetto_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.progetto_id) ||
    data.model_id !== args.modello || data.pdf_generated !== false) {
    return errResult("progetto_non_confermato", "Preparazione del progetto non confermata. Modello o voci potrebbero essere cambiati, oppure la funzione deve essere attivata. Verifica nell’app prima di riprovare; nessun PDF dichiarato pronto.");
  }
  const base = (Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com").replace(/\/$/, "");
  const link = `${base}/azienda/bagni/${encodeURIComponent(data.progetto_id)}/modifica?step=pdf`;
  return okResult({ ...data, link, modello: args.modello, link_inviato: false },
    `Progetto bagno ${args.modello} ${data.reused ? "già preparato" : "preparato"}, con modello aziendale congelato e computo salvato. PDF non ancora generato o inviato. Aprilo per verificare il documento: ${link}`);
}
