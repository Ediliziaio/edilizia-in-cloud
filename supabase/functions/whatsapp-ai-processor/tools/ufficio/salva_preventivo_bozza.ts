import { SILVIO_TOOLS, type ToolContext } from "../../../_shared/silvioTools.ts";
import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
export const salvaPreventivoBozzaDef: Omit<ToolDef, "handler"> = {
  name: "salva_preventivo_bozza",
  description: "Salva atomicamente la BOZZA dopo aver mostrato e confermato tutte le voci esatte (cliente, quantità, unità, prezzi e IVA). Usa i dati_da_confermare dell'anteprima, corretti dall'utente se necessario. Non genera prezzi, non invia PDF o messaggi al cliente. Non rilanciarlo dopo un salvataggio incerto: verifica prima la lista preventivi.",
  parameters: { ...SILVIO_TOOLS.create_quote_draft.schema.function.parameters, additionalProperties: false },
  requires_grants: ["preventivi.ai"], requires_confirmation: true,
};
export async function salvaPreventivoBozza(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind)) return errResult("no_user", "Questo salvataggio richiede un utente dell’ufficio autorizzato.");
  const result = await SILVIO_TOOLS.create_quote_draft.executor(args, {
    supabase: ctx.supabase, companyId: ctx.company_id, userId: ctx.user_id,
    primaryRole: ctx.kind === "admin" ? "company_admin" : "company_staff", channel: "whatsapp",
  } as ToolContext);
  if (result?.error) return errResult("quote_save_unconfirmed", result.error);
  const eur = (value: number) => value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  return okResult(result, `Bozza ${result.quote_number ?? result.quote_id} salvata: ${result.items_count} voci. Imponibile ${eur(result.subtotal_eur)}, IVA ${eur(result.vat_eur)}, totale ${eur(result.total_eur)}. Nulla inviato al cliente. Verifica la bozza nell’app prima di inviare il PDF.`);
}
