// Il PDF di un preventivo, mandato su WhatsApp a chi lo chiede (27/09/2026).
//
// Solo a chi sta scrivendo (ufficio o amministratore), MAI al cliente: l'invio
// al cliente resta nell'app, con la firma e i suoi controlli. Il preventivo
// deve essere dell'azienda del numero. Il PDF lo fa generate-quote-pdf (lo
// stesso dell'app), chiamato a nome dell'utente riconosciuto.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";

interface Args {
  quote_id?: string;
  quote_numero?: string;
}

export const inviaPdfPreventivoDef = {
  name: "invia_pdf_preventivo",
  description:
    "Manda su WhatsApp, a chi ti sta scrivendo, il PDF di un preventivo dell'azienda (per esempio quello appena " +
    "creato con crea_preventivo_bozza/crea_preventivo_ai). Passa il quote_id se ce l'hai; se hai solo il NUMERO del " +
    "preventivo (es. OFF-2026-007) mettilo in quote_numero e lo ritrovo io. NON lo manda al cliente: per quello si usa l'app.",
  parameters: {
    type: "object",
    properties: {
      quote_id: { type: "string", description: "Id del preventivo (quote_id), se lo conosci." },
      quote_numero: { type: "string", description: "Numero del preventivo (es. OFF-2026-007), se non hai il quote_id." },
    },
    required: [],
  },
  requires_grants: ["preventivi.pdf"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeFile(testo: string): string {
  return testo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "Preventivo";
}

export async function inviaPdfPreventivo(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  if (!ctx.user_id) return errResult("no_user", "Per mandarti il PDF serve il tuo accesso all'app.");

  const idArg = String(args.quote_id ?? "").trim();
  // Il numero può arrivare in quote_numero, o anche in quote_id se il modello non
  // aveva l'id (es. dopo un giro: ha solo «OFF-2026-007»).
  const numero = String(args.quote_numero ?? "").trim() || (idArg && !UUID_RE.test(idArg) ? idArg : "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null;
  if (UUID_RE.test(idArg)) {
    const { data } = await ctx.supabase
      .from("quotes").select("id, company_id, quote_number, client_name, deleted_at")
      .eq("id", idArg).maybeSingle();
    q = data;
  } else if (numero) {
    // Ritrovo il preventivo dal numero, nell'azienda del numero WhatsApp.
    const { data } = await ctx.supabase
      .from("quotes").select("id, company_id, quote_number, client_name, deleted_at")
      .eq("company_id", ctx.company_id).ilike("quote_number", numero).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    q = data;
  } else {
    return errResult("quote_id_non_valido", "Dimmi quale preventivo: il numero (es. OFF-2026-007) o quello appena creato.");
  }

  if (!q || q.company_id !== ctx.company_id || q.deleted_at) {
    return errResult("preventivo_non_trovato", numero ? `Non trovo il preventivo ${numero} nella tua azienda.` : "Non trovo questo preventivo nella tua azienda.");
  }
  const quoteId = String(q.id);

  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const intestazioni = { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` };

  const pdfRes = await fetch(`${base}/functions/v1/generate-quote-pdf`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({ quote_id: quoteId, per_utente: ctx.user_id }),
  });
  const pdf = await pdfRes.json().catch(() => null) as { signed_url?: string | null; error?: string } | null;
  const link = typeof pdf?.signed_url === "string" ? pdf.signed_url : null;
  if (!pdfRes.ok || !link) {
    console.error(JSON.stringify({ level: "error", fn: "invia_pdf_preventivo", passo: "pdf", status: pdfRes.status, errore: pdf?.error ?? null }));
    return errResult("pdf_non_generato", "Non sono riuscito a preparare il PDF. Riprova tra poco oppure aprilo dall'app, in Preventivi.");
  }

  const titolo = `Preventivo ${q.quote_number ?? ""}`.trim();
  const inv = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({
      company_id: ctx.company_id,
      wa_number_id: ctx.waNumberId || null,
      to: ctx.phone,
      type: "document",
      document: {
        link,
        filename: `${nomeFile(titolo)}.pdf`,
        caption: q.client_name ? `${titolo} — ${q.client_name}` : titolo,
      },
    }),
  });
  if (!inv.ok) {
    const testo = await inv.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", fn: "invia_pdf_preventivo", passo: "invio", status: inv.status, body: testo.slice(0, 300) }));
    return errResult("invio_fallito", "Il PDF è pronto ma non sono riuscito a mandartelo qui: aprilo dall'app, in Preventivi.");
  }
  return okResult({ inviato: true, quote_number: q.quote_number }, `📄 Ti ho mandato il PDF del ${titolo}.`);
}
