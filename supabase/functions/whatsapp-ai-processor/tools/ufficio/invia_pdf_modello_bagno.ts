import { errResult, okResult, type ToolCtx, type ToolDef, type ToolResult } from "../shared/types.ts";
import { BATHROOM_MODELS, UUID, bathroomStateDigest, readBathroomDocumentState, requireBathroomDocumentAccess,
  validateBathroomArtifact, verifyBathroomArtifactBytes } from "../../../_shared/bathroomDocumentState.ts";
import { runWhatsAppTool } from "../../../_shared/whatsappOperations.ts";
import { isWhatsAppReceipt } from "../../../_shared/whatsappReceipt.ts";
import { requireDocumentConversation, verifiedDocumentUrl } from "../shared/documentDestination.ts";

export const inviaPdfModelloBagnoDef: Omit<ToolDef, "handler"> = {
  name: "invia_pdf_modello_bagno",
  description: "Dopo che l’utente ha aperto e verificato il PDF, chiedi conferma per mandargli il documento su QUESTO WhatsApp. Usa solo artifact_id, progetto_id, modello e revisione_progetto restituiti da genera_pdf_modello_bagno. Rilegge progetto e ricevuta, verifica i byte salvati, non rigenera né sostituisce il modello. Non invia al cliente o ad altro numero; accettazione Meta non significa consegna. Se l’esito è incerto non ripetere l’invio.",
  parameters: { type: "object", additionalProperties: false, properties: {
    artifact_id: { type: "string" }, progetto_id: { type: "string" },
    modello: { type: "string", enum: BATHROOM_MODELS },
    revisione_progetto: { type: "string" },
    documento_verificato: { type: "boolean", const: true, description: "L’utente ha controllato il link del PDF prima di approvarne l’invio. Non assumere che sia stato controllato." },
  }, required: ["artifact_id", "progetto_id", "modello", "revisione_progetto", "documento_verificato"] },
  requires_grants: ["preventivi.pdf"], requires_confirmation: true,
};

export async function inviaPdfModelloBagno(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolResult> {
  if (!ctx.user_id || !["ufficio", "admin"].includes(ctx.kind) || !ctx.role_grants.includes("preventivi.pdf") ||
      !UUID.test(String(args.artifact_id)) || !UUID.test(String(args.progetto_id)) ||
      !BATHROOM_MODELS.includes(String(args.modello)) || typeof args.revisione_progetto !== "string" ||
      args.documento_verificato !== true || !ctx.requestId || !ctx.waNumberId || !ctx.phone) {
    return errResult("document_send_not_ready", "Prima controlla il PDF generato e conferma l’invio nella conversazione verificata. Nessun documento inviato.");
  }
  const base = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) return errResult("sender_unavailable", "Invio non disponibile. Il documento resta consultabile nell’app.");
  try {
    await requireBathroomDocumentAccess(ctx.supabase, ctx.company_id, ctx.user_id);
    await requireDocumentConversation(ctx);
    const { data: artifact, error } = await ctx.supabase.from("whatsapp_quote_artifacts").select("*")
      .eq("company_id", ctx.company_id).eq("id", args.artifact_id).maybeSingle();
    if (error) throw new Error("Ricevuta PDF non leggibile.");
    const read = () => readBathroomDocumentState(ctx.supabase, ctx.company_id, String(args.progetto_id), String(args.modello), String(args.revisione_progetto));
    const fingerprint = await bathroomStateDigest(await read());
    validateBathroomArtifact(artifact, ctx.company_id, String(args.progetto_id), String(args.modello), String(args.revisione_progetto), fingerprint);
    await verifyBathroomArtifactBytes(ctx.supabase, artifact);
    const stable = { artifact_id: artifact.id, pdf_sha256: artifact.pdf_sha256, fingerprint,
      phone: ctx.phone, number: ctx.waNumberId, user: ctx.user_id };
    return await runWhatsAppTool(ctx.supabase, ctx.company_id, `model-pdf:${ctx.requestId}:${artifact.id}`,
      "invia_pdf_modello_bagno", stable, async (): Promise<ToolResult> => {
        const { data: signed, error: signError } = await ctx.supabase.storage.from("quote-pdfs").createSignedUrl(artifact.storage_path, 3600);
        if (signError) throw new Error("Link del documento non verificabile.");
        const link = verifiedDocumentUrl(signed?.signedUrl, base, artifact.storage_path);
        // Recheck after download/signing; frozen confirmation cannot send a changed project.
        if (await bathroomStateDigest(await read()) !== fingerprint) throw new Error("Progetto cambiato: ricontrolla il PDF e richiedi nuova conferma.");
        await requireBathroomDocumentAccess(ctx.supabase, ctx.company_id, ctx.user_id!);
        await requireDocumentConversation(ctx);
        let response: Response;
        try {
          response = await fetch(`${base}/functions/v1/whatsapp-send`, { method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ company_id: ctx.company_id, wa_number_id: ctx.waNumberId, to: ctx.phone,
              idempotency_key: `model-pdf:${ctx.requestId}:${artifact.id}`, type: "document",
              document: { link, filename: `Preventivo_bagno_${args.modello}.pdf`, caption: `Preventivo bagno — modello ${args.modello}` } }),
            signal: AbortSignal.timeout(30_000) });
        } catch {
          return errResult("document_send_unknown", "PDF pronto, ma esito dell’invio sconosciuto. Non ripeto automaticamente: verifica la conversazione nell’app.");
        }
        const result = await response.json().catch((): null => null);
        if (!response.ok || !isWhatsAppReceipt(result)) {
          return errResult("document_send_not_confirmed", "PDF pronto, ma invio WhatsApp non confermato. Verifica la conversazione prima di riprovare.");
        }
        return okResult({ artifact_id: artifact.id, model_id: artifact.model_id, pdf_generated: true,
          provider_accepted: true, delivered: false, customer_sent: false, meta_message_id: result.meta_message_id },
        "WhatsApp ha accettato il PDF del modello verificato per il tuo numero. La consegna è ancora da verificare; non è stato inviato al cliente.");
      });
  } catch {
    return errResult("document_send_blocked", "Documento, progetto, permessi o operazione non verificabili. Nessun nuovo invio avviato: controlla il PDF e gli esiti nella conversazione dell’app.");
  }
}
