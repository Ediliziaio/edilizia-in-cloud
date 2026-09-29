// Manda su WhatsApp il MODELLO BAGNO — il preventivo brandizzato ed estetico del
// verticale Bagni (copertina, chi siamo, USP, voci, cronoprogramma, garanzie).
//
// (29/09/2026) Non genera più il PDF sull'edge (il modello vero, 15+ pagine con
// foto, va oltre la memoria dell'edge). Invece: dal preventivo crea — o ritrova —
// un PROGETTO BAGNO vero (bgn_progetti + bgn_computo_voci) e manda il LINK alla
// pagina già aperta sul PDF. Da lì l'utente scarica il PDF col modello vero,
// disegnato dal suo telefono, oppure lo manda al cliente per la firma digitale.
// Richiede che il modulo "Bagni" sia sbloccato per l'azienda; se non lo è, il bot
// lo dice e ripiega sul preventivo standard. Solo a chi scrive, mai al cliente.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";
import { moduloAttivo } from "../../../_shared/moduloAttivo.ts";
import { progettoDaQuote, vociDaQuote, type QuoteItemLike } from "../../../_shared/bagnoDaQuote.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

interface Args {
  quote_id?: string;
  quote_numero?: string;
}

export const inviaPreventivoBagnoDef = {
  name: "invia_preventivo_bagno",
  description:
    "Manda su WhatsApp, a chi ti scrive, il MODELLO BAGNO: il preventivo brandizzato ed estetico del verticale Bagni " +
    "(copertina, chi siamo, tempi, garanzie). Prepara il progetto bagno dal preventivo e ti manda il LINK per aprirlo: " +
    "da lì scarichi il PDF col modello vero o lo mandi al cliente per la firma. Usalo quando l'utente vuole il preventivo " +
    "bagno 'bello'/col modello e il lavoro è un bagno. Passa il quote_id se ce l'hai, altrimenti il numero (es. OFF-2026-007) " +
    "in quote_numero. Richiede che il modulo Bagni sia attivo; se non lo è te lo dico e usi invia_pdf_preventivo standard.",
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

/** Codice progressivo come nell'app (BGN-anno-progressivo), fallback col timestamp. */
async function generaCodiceBgn(supabase: Any, companyId: string): Promise<string> {
  const anno = new Date().getFullYear();
  const { count, error } = await supabase.from("bgn_progetti")
    .select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (error || count === null || count === undefined) return `BGN-${anno}-${Date.now().toString().slice(-5)}`;
  return `BGN-${anno}-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

export async function inviaPreventivoBagno(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  if (!ctx.user_id) return errResult("no_user", "Per aprire il preventivo bagno serve il tuo accesso all'app.");

  const idArg = String(args.quote_id ?? "").trim();
  const numero = String(args.quote_numero ?? "").trim() || (idArg && !UUID_RE.test(idArg) ? idArg : "");

  // ── 1) Trovo il preventivo (per id o per numero) ────────────────────────────
  const COLS = "id, company_id, quote_number, client_name, subtotal, total, vat_amount, discount_amount, deleted_at";
  let q: Any = null;
  if (UUID_RE.test(idArg)) {
    const { data } = await ctx.supabase.from("quotes").select(COLS).eq("id", idArg).maybeSingle();
    q = data;
  } else if (numero) {
    const { data } = await ctx.supabase.from("quotes").select(COLS)
      .eq("company_id", ctx.company_id).ilike("quote_number", numero).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    q = data;
  } else {
    return errResult("quote_mancante", "Dimmi quale preventivo: il numero (es. OFF-2026-007) o quello appena creato.");
  }
  if (!q || q.company_id !== ctx.company_id || q.deleted_at) {
    return errResult("preventivo_non_trovato", numero ? `Non trovo il preventivo ${numero} nella tua azienda.` : "Non trovo questo preventivo nella tua azienda.");
  }

  // ── 2) Il modulo Bagni dev'essere sbloccato per l'azienda ───────────────────
  if (!(await moduloAttivo(ctx.supabase, ctx.company_id, "modulo_bagni_attivo"))) {
    return errResult("modulo_non_attivo", "Il modello bagno non è attivo per la tua azienda. Ti mando il preventivo standard con invia_pdf_preventivo?");
  }

  // ── 3) Progetto bagno: lo ritrovo (per non duplicarlo) o lo creo dal preventivo ─
  const notaLegame = q.quote_number ? `Da preventivo ${q.quote_number}` : null;
  let progettoId: string | null = null;

  if (notaLegame) {
    const { data: gia } = await ctx.supabase.from("bgn_progetti")
      .select("id").eq("company_id", ctx.company_id).eq("note", notaLegame).is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (gia?.id) progettoId = gia.id as string;
  }

  if (!progettoId) {
    const { data: tpl } = await ctx.supabase.from("bgn_template_pdf")
      .select("default_iva_pct, default_detrazione_pct").eq("company_id", ctx.company_id).maybeSingle();

    const code = q.quote_number || (await generaCodiceBgn(ctx.supabase, ctx.company_id));
    const nuovo = { ...progettoDaQuote(q, tpl ?? {}, ctx.company_id, ctx.user_id), code };
    const { data: creato, error: errProg } = await ctx.supabase.from("bgn_progetti").insert(nuovo).select("id").single();
    if (errProg || !creato?.id) {
      console.error(JSON.stringify({ level: "error", fn: "invia_preventivo_bagno", passo: "crea_progetto", err: errProg?.message ?? "no_id" }));
      return errResult("progetto_non_creato", "Non sono riuscito a preparare il progetto bagno. Riprova tra poco.");
    }
    progettoId = creato.id as string;

    const { data: items } = await ctx.supabase.from("quote_items")
      .select("name, description, quantity, unit_price, unit_of_measure, item_type, sort_order")
      .eq("quote_id", q.id).order("sort_order");
    const righe = vociDaQuote((items ?? []) as QuoteItemLike[], ctx.company_id).map((r) => ({ ...r, progetto_id: progettoId }));
    if (righe.length > 0) {
      const { error: errVoci } = await ctx.supabase.from("bgn_computo_voci").insert(righe);
      if (errVoci) {
        console.error(JSON.stringify({ level: "error", fn: "invia_preventivo_bagno", passo: "crea_voci", err: errVoci.message }));
        // Il progetto c'è: la pagina si apre comunque, l'utente può completare il computo.
      }
    }
  }

  // ── 4) Mando il link alla pagina già aperta sul PDF del modello ─────────────
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com";
  const link = `${appUrl}/azienda/bagni/${progettoId}/modifica?step=pdf`;

  const numeroMostra = q.quote_number ? ` ${q.quote_number}` : "";
  const testo =
    `📐 Ecco il tuo preventivo bagno${numeroMostra} col modello completo (copertina, chi siamo, tempi, garanzie).\n\n` +
    `Aprilo qui:\n${link}\n\n` +
    `Da lì lo scarichi in PDF oppure lo mandi al cliente per la firma. ` +
    `Se ti chiede di entrare, è il tuo solito accesso a Edilizia in Cloud.`;

  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const inv = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
    body: JSON.stringify({
      company_id: ctx.company_id,
      wa_number_id: ctx.waNumberId || null,
      to: ctx.phone,
      type: "text",
      text: { body: testo },
    }),
  });
  if (!inv.ok) {
    const errText = await inv.text().catch(() => "");
    console.error(JSON.stringify({ level: "error", fn: "invia_preventivo_bagno", passo: "invio_link", status: inv.status, body: errText.slice(0, 300) }));
    // Il link non è partito come messaggio a parte: lo restituisco così la
    // risposta del modello lo può includere (fallback).
    return okResult(
      { progetto_id: progettoId, link, quote_number: q.quote_number, modello: "bagno", link_inviato: false },
      `Apri il tuo preventivo bagno da qui e lo scarichi o lo mandi alla firma: ${link}`,
    );
  }

  return okResult(
    { progetto_id: progettoId, link, quote_number: q.quote_number, modello: "bagno", link_inviato: true },
    // Il link è GIÀ stato mandato come messaggio a parte: non ripeterlo, conferma e basta.
    "Ho già mandato all'utente, in un messaggio a parte, il link per aprire il preventivo bagno col modello (da lì scarica il PDF o lo manda alla firma). Conferma brevemente, senza ripetere il link.",
  );
}
