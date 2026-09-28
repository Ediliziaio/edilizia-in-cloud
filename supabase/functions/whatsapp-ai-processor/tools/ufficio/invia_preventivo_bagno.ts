// Manda su WhatsApp il PDF "modello bagno" — il preventivo brandizzato del
// verticale Bagni (copertina, chi siamo, USP, voci, cronoprogramma, garanzie).
// (28/09/2026) Usa l'edge bgn-genera-pdf (PDF vero). Richiede che il modulo
// "Bagni" sia sbloccato per l'azienda; se non lo è, il bot lo dice e ripiega sul
// preventivo standard. Solo a chi scrive (ufficio/amministratore), mai al cliente.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";

interface Args {
  quote_id?: string;
  quote_numero?: string;
}

export const inviaPreventivoBagnoDef = {
  name: "invia_preventivo_bagno",
  description:
    "Manda su WhatsApp, a chi ti scrive, il PDF col MODELLO BAGNO (preventivo brandizzato ed estetico del verticale " +
    "Bagni: copertina, chi siamo, tempi, garanzie). Usalo quando l'utente vuole il preventivo bagno 'bello'/col modello e " +
    "il lavoro è un bagno. Passa il quote_id se ce l'hai, altrimenti il numero (es. OFF-2026-007) in quote_numero. " +
    "Richiede che il modulo Bagni sia attivo per l'azienda; se non lo è te lo dico e usi invia_pdf_preventivo standard.",
  parameters: {
    type: "object",
    properties: {
      quote_id: { type: "string", description: "Id del preventivo, se lo conosci." },
      quote_numero: { type: "string", description: "Numero del preventivo (es. OFF-2026-007), se non hai il quote_id." },
    },
    required: [],
  },
  requires_grants: ["preventivi.pdf"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nomeFile(testo: string): string {
  return testo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "Preventivo";
}

export async function inviaPreventivoBagno(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  if (!ctx.user_id) return errResult("no_user", "Per mandarti il PDF serve il tuo accesso all'app.");

  const idArg = String(args.quote_id ?? "").trim();
  const numero = String(args.quote_numero ?? "").trim() || (idArg && !UUID_RE.test(idArg) ? idArg : "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null;
  if (UUID_RE.test(idArg)) {
    const { data } = await ctx.supabase.from("quotes").select("id, company_id, quote_number, client_name, deleted_at").eq("id", idArg).maybeSingle();
    q = data;
  } else if (numero) {
    const { data } = await ctx.supabase.from("quotes").select("id, company_id, quote_number, client_name, deleted_at")
      .eq("company_id", ctx.company_id).ilike("quote_number", numero).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    q = data;
  } else {
    return errResult("quote_mancante", "Dimmi quale preventivo: il numero (es. OFF-2026-007) o quello appena creato.");
  }
  if (!q || q.company_id !== ctx.company_id || q.deleted_at) {
    return errResult("preventivo_non_trovato", numero ? `Non trovo il preventivo ${numero} nella tua azienda.` : "Non trovo questo preventivo nella tua azienda.");
  }

  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const intestazioni = { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` };

  const pdfRes = await fetch(`${base}/functions/v1/bgn-genera-pdf`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({ quote_id: q.id, per_utente: ctx.user_id }),
  });
  const pdf = await pdfRes.json().catch(() => null) as { signed_url?: string | null; error?: string } | null;
  if (pdfRes.status === 403) {
    return errResult("modulo_non_attivo", "Il modello bagno non è attivo per la tua azienda. Ti mando il preventivo standard con invia_pdf_preventivo?");
  }
  const link = typeof pdf?.signed_url === "string" ? pdf.signed_url : null;
  if (!pdfRes.ok || !link) {
    console.error(JSON.stringify({ level: "error", fn: "invia_preventivo_bagno", passo: "pdf", status: pdfRes.status, errore: pdf?.error ?? null }));
    return errResult("pdf_non_generato", "Non sono riuscito a preparare il modello bagno. Riprova tra poco.");
  }

  const titolo = `Preventivo bagno ${q.quote_number ?? ""}`.trim();
  const inv = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: intestazioni,
    body: JSON.stringify({
      company_id: ctx.company_id,
      wa_number_id: ctx.waNumberId || null,
      to: ctx.phone,
      type: "document",
      document: { link, filename: `${nomeFile(titolo)}.pdf`, caption: q.client_name ? `${titolo} — ${q.client_name}` : titolo },
    }),
  });
  if (!inv.ok) {
    const testo = await inv.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", fn: "invia_preventivo_bagno", passo: "invio", status: inv.status, body: testo.slice(0, 300) }));
    return errResult("invio_fallito", "Il PDF è pronto ma non sono riuscito a mandartelo qui: aprilo dall'app, in Preventivi.");
  }
  return okResult({ inviato: true, quote_number: q.quote_number, modello: "bagno" }, `📄 Ti ho mandato il preventivo bagno ${q.quote_number ?? ""} col modello estetico.`);
}
