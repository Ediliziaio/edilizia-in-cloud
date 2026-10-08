import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
import { verifiedDocumentUrl } from "../shared/documentDestination.ts";
export const generaPdfModelloBagnoDef: Omit<ToolDef, "handler"> = {
  name: "genera_pdf_modello_bagno",
  description: "Dopo conferma genera il vero PDF del progetto BAGNI con modello congelato. Richiede progetto_id, modello e project_revision restituiti dalla preparazione. Non invia documenti WhatsApp né al cliente: restituisce un link temporaneo per controllarlo. Se mancano immagini, allegati o renderer, fermati senza PDF generico né retry automatico.",
  parameters: { type: "object", additionalProperties: false, properties: {
    progetto_id: { type: "string" }, modello: { type: "string", enum: ["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"] },
    revisione_progetto: { type: "string", description: "project_revision esatta restituita dallo strumento di preparazione." },
  }, required: ["progetto_id", "modello", "revisione_progetto"] },
  requires_grants: ["preventivi.pdf"], requires_confirmation: true,
};
export async function generaPdfModelloBagno(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind) || !uuid.test(String(args.progetto_id ?? "")) ||
      !["completo", "vasca-doccia", "doccia", "sanitari", "accessibilita", "rinnovo"].includes(String(args.modello)) ||
      typeof args.revisione_progetto !== "string" || !Number.isFinite(Date.parse(args.revisione_progetto))) {
    return errResult("invalid_project", "Verifica il progetto e la sua revisione esatta prima di generare il PDF.");
  }
  const base = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return errResult("renderer_unavailable", "Generatore PDF non disponibile. Apri il progetto nell’app.");
  try {
    const res = await fetch(`${base}/functions/v1/bgn-genera-pdf`, { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ company_id: ctx.company_id, per_utente: ctx.user_id, progetto_id: args.progetto_id,
        modello: args.modello, revisione_progetto: args.revisione_progetto }),
      signal: AbortSignal.timeout(40_000) });
    const result = await res.json().catch((): null => null);
    const prefix = `bagno/${ctx.company_id}/${args.progetto_id}/`;
    if (!res.ok || result?.success !== true || result.company_id !== ctx.company_id ||
        result.progetto_id !== args.progetto_id || result.model_id !== args.modello ||
        result.project_revision !== args.revisione_progetto || result.renderer !== "DocumentoEdilePDF" ||
        result.pdf_generated !== true || result.message_sent !== false || !uuid.test(String(result.artifact_id)) ||
        !/^[a-f0-9]{64}$/.test(String(result.pdf_sha256)) || result.renderer_version !== "documento-edile-bgn-v1" ||
        result.pdf_storage_path !== `${prefix}${result.fingerprint}-${result.pdf_sha256}.pdf` ||
        !/^[a-f0-9]{64}$/.test(String(result.fingerprint)) || typeof result.signed_url !== "string" ||
        new URL(result.signed_url).origin !== new URL(base).origin) {
      return errResult("pdf_not_verified", "Generazione del modello esatto non confermata. Nessun documento inviato; verifica nell’app prima di riprovare.");
    }
    verifiedDocumentUrl(result.signed_url, base, result.pdf_storage_path);
    return okResult(result, `PDF del modello ${args.modello} generato dal progetto salvato. Non inviato come documento e non inviato al cliente. Link temporaneo per la verifica: ${result.signed_url}`);
  } catch { return errResult("pdf_outcome_unknown", "Non riesco a confermare la generazione. Non ripeto automaticamente: verifica il progetto nell’app. Nessun invio WhatsApp effettuato da questo strumento."); }
}
