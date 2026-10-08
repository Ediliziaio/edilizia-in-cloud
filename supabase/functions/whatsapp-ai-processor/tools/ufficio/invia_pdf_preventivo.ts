// Il PDF di un preventivo, mandato su WhatsApp a chi lo chiede (27/09/2026).
//
// Solo a chi sta scrivendo (ufficio o amministratore), MAI al cliente: l'invio
// al cliente resta nell'app, con la firma e i suoi controlli. Il preventivo
// deve essere dell'azienda del numero. Il PDF lo fa generate-quote-pdf (lo
// stesso dell'app), chiamato a nome dell'utente riconosciuto.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";
import { isWhatsAppReceipt } from "../../../_shared/whatsappReceipt.ts";
import { requireQuoteModelAccess } from "../../../_shared/quoteModelAccess.ts";
import { runWhatsAppTool } from "../../../_shared/whatsappOperations.ts";
import { requireDocumentConversation, verifiedDocumentUrl } from "../shared/documentDestination.ts";

interface Args {
  quote_id?: string;
  quote_numero?: string;
  modello_richiesto?: string;
}
interface QuoteRow { id: string; company_id: string; quote_number: string | null; client_name: string | null;
  deleted_at: string | null; source: string | null; pdf_storage_path: string | null }

export const inviaPdfPreventivoDef = {
  name: "invia_pdf_preventivo",
  description:
    "Manda su WhatsApp, a chi ti sta scrivendo, il PDF di un preventivo dell'azienda (per esempio quello appena " +
    "creato con crea_preventivo_bozza/crea_preventivo_ai). Passa il quote_id se ce l'hai; se hai solo il NUMERO del " +
    "preventivo (es. OFF-2026-007) mettilo in quote_numero e lo ritrovo io. Solo PDF CLASSICI: per i modelli bagno usa invia_pdf_modello_bagno con la ricevuta verificata. NON lo manda al cliente: per quello si usa l'app. Un esito incerto non autorizza un secondo invio.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      quote_id: { type: "string", description: "Id del preventivo (quote_id), se lo conosci." },
      quote_numero: { type: "string", description: "Numero del preventivo (es. OFF-2026-007), se non hai il quote_id." },
      modello_richiesto: { type: "string", description: "Modello specifico richiesto dall’utente, se presente. Non ometterlo per aggirare una verifica: il PDF generico non è un sostituto." },
    },
    required: [] as string[],
  },
  requires_grants: ["preventivi.pdf"],
  requires_confirmation: true,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeFile(testo: string): string {
  return testo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "Preventivo";
}

export async function inviaPdfPreventivo(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  if (!ctx.user_id) return errResult("no_user", "Per mandarti il PDF serve il tuo accesso all'app.");
  try {
    await requireDocumentConversation(ctx);
    await requireQuoteModelAccess(ctx.supabase, ctx.company_id, ctx.user_id);
  } catch {
    return errResult("destinazione_non_verificata", "Utente, permessi o conversazione non verificabili. Nessun PDF generato o inviato.");
  }

  const idArg = String(args.quote_id ?? "").trim();
  // Il numero può arrivare in quote_numero, o anche in quote_id se il modello non
  // aveva l'id (es. dopo un giro: ha solo «OFF-2026-007»).
  const numero = String(args.quote_numero ?? "").trim() || (idArg && !UUID_RE.test(idArg) ? idArg : "");

  let q: QuoteRow | null = null;
  if (UUID_RE.test(idArg)) {
    const { data, error } = await ctx.supabase
      .from("quotes").select("id, company_id, quote_number, client_name, deleted_at, source, pdf_storage_path")
      .eq("company_id", ctx.company_id).eq("id", idArg).is("deleted_at", null).maybeSingle();
    if (error) return errResult("quote_lookup_failed", "Lettura preventivo non disponibile. Nessun PDF inviato.");
    q = data;
  } else if (numero) {
    // Ritrovo il preventivo dal numero, nell'azienda del numero WhatsApp.
    const { data, error } = await ctx.supabase
      .from("quotes").select("id, company_id, quote_number, client_name, deleted_at, source, pdf_storage_path")
      .eq("company_id", ctx.company_id).ilike("quote_number", numero.replace(/[\\%_]/g, "\\$&")).is("deleted_at", null).limit(2);
    if (error) return errResult("quote_lookup_failed", "Lettura preventivo non disponibile. Nessun PDF inviato.");
    if ((data?.length ?? 0) > 1) return errResult("quote_ambiguous", "Più preventivi corrispondono al numero: indica l’ID esatto.");
    q = data?.[0];
  } else {
    return errResult("quote_id_non_valido", "Dimmi quale preventivo: il numero (es. OFF-2026-007) o quello appena creato.");
  }

  if (!q || q.company_id !== ctx.company_id || q.deleted_at) {
    return errResult("preventivo_non_trovato", numero ? `Non trovo il preventivo ${numero} nella tua azienda.` : "Non trovo questo preventivo nella tua azienda.");
  }
  const quoteId = String(q.id);
  if (args.modello_richiesto !== undefined) {
    // The generic quote receipt carries no verified intervention snapshot.
    // A module source tag alone is also insufficient to certify the specific model.
    return errResult("modello_da_verificare", "Hai richiesto un modello specifico: il suo collegamento e il PDF devono essere verificati nel preventivatore del modulo. Nessun PDF generico inviato al suo posto.");
  }
  if (typeof q.source === "string" && q.source.startsWith("modulo:") && !q.pdf_storage_path) {
    return errResult("pdf_modulo_mancante", "Il PDF del modulo non è ancora disponibile. Preparalo nel relativo preventivatore: non verrà sostituito con un PDF classico.");
  }
  if (typeof q.source === "string" && q.source.startsWith("modulo:")) {
    return errResult("pdf_modulo_da_verificare", "Per un modello dedicato usa la ricevuta verificata del modulo: il solo link salvato non certifica progetto e modello. Nessun PDF classico inviato.");
  }

  const base = Deno.env.get("SUPABASE_URL");
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !chiave) return errResult("sender_unavailable", "Invio non disponibile. Apri il preventivo nell’app.");
  const intestazioni = { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` };
  try {
  return await runWhatsAppTool(ctx.supabase, ctx.company_id, `pdf:${ctx.requestId}:${quoteId}`, "invia_pdf_preventivo",
    { quote_id: quoteId, user: ctx.user_id, phone: ctx.phone, number: ctx.waNumberId }, async () => {
  const pdfRes = await fetch(`${base}/functions/v1/generate-quote-pdf`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({ quote_id: quoteId, per_utente: ctx.user_id }),
    signal: AbortSignal.timeout(40_000),
  });
  const pdf = await pdfRes.json().catch((): null => null) as { signed_url?: string | null; pdf_path?: string; error?: string } | null;
  const link = typeof pdf?.signed_url === "string" ? pdf.signed_url : null;
  if (!pdfRes.ok || pdf?.error || !link) {
    console.error(JSON.stringify({ level: "error", fn: "invia_pdf_preventivo", passo: "pdf", status: pdfRes.status, errore: pdf?.error ?? null }));
    return errResult("pdf_non_generato", "Non sono riuscito a preparare il PDF. Riprova tra poco oppure aprilo dall'app, in Preventivi.");
  }
  if (typeof pdf?.pdf_path !== "string" || !pdf.pdf_path.startsWith(`${ctx.company_id}/`)) {
    return errResult("pdf_non_verificato", "Il PDF restituito non appartiene al percorso verificato dell’azienda. Nessun invio avviato.");
  }
  const verifiedLink = verifiedDocumentUrl(link, base, pdf.pdf_path);
  await requireDocumentConversation(ctx);
  await requireQuoteModelAccess(ctx.supabase, ctx.company_id, ctx.user_id!);
  const { data: current, error: currentError } = await ctx.supabase.from("quotes").select("id, source, pdf_storage_path")
    .eq("company_id", ctx.company_id).eq("id", quoteId).is("deleted_at", null).maybeSingle();
  if (currentError || !current || String(current.source ?? "").startsWith("modulo:") || current.pdf_storage_path !== pdf.pdf_path) {
    return errResult("pdf_non_verificato", "Il collegamento del documento è cambiato o non è verificabile. Controllalo nell’app: nessun invio avviato.");
  }

  const titolo = `Preventivo ${q.quote_number ?? ""}`.trim();
  let inv: Response;
  try { inv = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({
      company_id: ctx.company_id,
      ...(ctx.requestId ? { idempotency_key: `pdf:${ctx.requestId}:${quoteId}` } : {}),
      wa_number_id: ctx.waNumberId || null,
      to: ctx.phone,
      type: "document",
      document: {
        link: verifiedLink,
        filename: `${nomeFile(titolo)}.pdf`,
        caption: q.client_name ? `${titolo} — ${q.client_name}` : titolo,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  }); } catch {
    return errResult("invio_esito_sconosciuto", "PDF pronto, ma esito dell’invio sconosciuto. Non ripeto automaticamente: verifica la conversazione nell’app.");
  }
  const receipt = await inv.json().catch((): null => null);
  if (!inv.ok || !isWhatsAppReceipt(receipt)) {
    console.error(JSON.stringify({ level: "error", fn: "invia_pdf_preventivo", passo: "invio", status: inv.status }));
    return errResult("invio_non_confermato", "Il PDF è pronto ma l’invio WhatsApp non è confermato. Verifica la conversazione prima di riprovare; puoi aprirlo dall’app.");
  }
  return okResult({ inviato: true, provider_accepted: true, delivered: false, customer_sent: false, quote_number: q.quote_number, meta_message_id: receipt.meta_message_id }, `📄 WhatsApp ha accettato il PDF del ${titolo}. La consegna resta da verificare in conversazione.`);
  });
  } catch {
    return errResult("invio_non_verificabile", "Operazione o documento non verificabili. Nessun nuovo invio confermato: controlla gli esiti nell’app prima di riprovare.");
  }
}
