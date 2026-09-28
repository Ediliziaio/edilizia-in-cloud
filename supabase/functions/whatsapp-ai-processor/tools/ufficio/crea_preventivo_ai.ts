// Preventivo col LISTINO e la MANODOPERA veri, da WhatsApp (28/09/2026).
//
// A differenza di crea_preventivo_bozza (match semplice sul nome), qui si usa il
// motore dell'app `ai-genera-preventivo-v2` (RPC match_articles / _families /
// _tariffe): torna le righe già prezzate col listino dell'azienda e la
// manodopera. Poi si crea la BOZZA (niente va al cliente). Chi vuole il PDF usa
// dopo invia_pdf_preventivo.

import { errResult, okResult, type ToolCtx, type ToolResult } from "../shared/types.ts";

interface Args {
  descrizione?: string;
  cliente_nome?: string;
  tipo_lavoro?: string;
  iva?: number;
}

interface RigaAI {
  nome?: string;
  descrizione?: string;
  quantita?: number;
  unita_misura?: string;
  unit_price?: number | null;
  family_id?: string | null;
  item_category?: string;
  is_posa_di?: string | null;
}

export const creaPreventivoAiDef = {
  name: "crea_preventivo_ai",
  description:
    "Crea un preventivo dettagliato usando il LISTINO e la MANODOPERA dell'azienda (non un match sul nome). " +
    "Dai una descrizione del lavoro (es. 'cappotto 120 mq su villetta, cordoli e ponteggio') e il nome del cliente. " +
    "Torna una BOZZA con le righe prezzate: niente viene inviato al cliente. Per il PDF su WhatsApp usa dopo invia_pdf_preventivo.",
  parameters: {
    type: "object",
    properties: {
      descrizione: { type: "string", description: "Cosa va preventivato, il più preciso possibile (misure, materiali, lavorazioni)." },
      cliente_nome: { type: "string", description: "Nome o ragione sociale del cliente." },
      tipo_lavoro: { type: "string", description: "Es. cappotto, infissi, bagno, fotovoltaico (aiuta il motore)." },
      iva: { type: "number", description: "Aliquota IVA %, default 22." },
    },
    required: ["descrizione", "cliente_nome"],
  },
  requires_grants: ["preventivi.ai"],
};

export async function creaPreventivoAi(ctx: ToolCtx, args: Args): Promise<ToolResult> {
  const descrizione = String(args.descrizione ?? "").trim();
  const clienteNome = String(args.cliente_nome ?? "").trim().slice(0, 200);
  if (descrizione.length < 5) return errResult("descrizione_corta", "Dimmi cosa devo preventivare, un po' più nel dettaglio.");
  if (!clienteNome) return errResult("cliente_mancante", "Per chi è il preventivo? Dimmi il nome del cliente.");
  if (!ctx.user_id) return errResult("no_user", "Per creare il preventivo serve il tuo accesso all'app.");

  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let sezioni: Array<{ righe?: RigaAI[] }> = [];
  try {
    const res = await fetch(`${base}/functions/v1/ai-genera-preventivo-v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({
        company_id: ctx.company_id,
        per_utente: ctx.user_id,
        descrizione,
        tipo_lavoro: args.tipo_lavoro ?? null,
        input_mode: "testo",
      }),
    });
    const j = await res.json().catch(() => null) as { sezioni?: Array<{ righe?: RigaAI[] }> } | null;
    if (!res.ok || !j?.sezioni) {
      console.error(JSON.stringify({ level: "error", fn: "crea_preventivo_ai", passo: "motore", status: res.status }));
      return errResult("motore_ko", "Non sono riuscito a costruire il preventivo. Riprova, oppure aprilo dall'app in Preventivi.");
    }
    sezioni = j.sezioni;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", fn: "crea_preventivo_ai", error: String(e) }));
    return errResult("motore_errore", "Non ci sono riuscito, riprova tra poco.");
  }

  const righe: RigaAI[] = sezioni.flatMap((s) => Array.isArray(s.righe) ? s.righe : []);
  if (righe.length === 0) return errResult("nessuna_riga", "Dalla descrizione non ho tirato fuori righe utili: dammi qualche dettaglio in più (misure, materiali).");

  const iva = Number.isFinite(Number(args.iva)) ? Number(args.iva) : 22;
  let quoteNumber = "";
  try {
    const { data } = await ctx.supabase.rpc("generate_quote_number", { p_company_id: ctx.company_id });
    quoteNumber = typeof data === "string" && data ? data : "";
  } catch { /* fallback sotto */ }
  if (!quoteNumber) quoteNumber = `OFF-WA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { data: quote, error: qErr } = await ctx.supabase
    .from("quotes")
    .insert({
      company_id: ctx.company_id,
      quote_number: quoteNumber,
      status: "bozza",
      client_name: clienteNome,
      title: `Preventivo ${clienteNome}`,
      created_by: ctx.user_id,
      source: "whatsapp",
    })
    .select("id, quote_number")
    .single();
  if (qErr || !quote) return errResult("insert_quote", `Preventivo non creato: ${qErr?.message ?? "insert vuoto"}`);

  const items: Array<Record<string, unknown>> = [];
  const senzaPrezzo: string[] = [];
  let totale = 0;
  let sort = 0;
  for (const r of righe) {
    const descr = String(r.descrizione ?? r.nome ?? "").trim().slice(0, 500);
    if (!descr) continue;
    const quantita = Number.isFinite(Number(r.quantita)) && Number(r.quantita) > 0 ? Number(r.quantita) : 1;
    const prezzo = Number.isFinite(Number(r.unit_price)) && Number(r.unit_price) >= 0 ? Number(r.unit_price) : 0;
    if (prezzo === 0) senzaPrezzo.push(descr.slice(0, 60));
    totale += prezzo * quantita;
    const tipo = r.is_posa_di || r.item_category === "manodopera" ? "labor" : "product";
    items.push({
      quote_id: quote.id,
      company_id: ctx.company_id,
      name: descr.slice(0, 200),
      description: descr,
      quantity: quantita,
      unit_price: prezzo,
      vat_rate: iva,
      unit_of_measure: String(r.unita_misura ?? "").trim().slice(0, 20) || null,
      item_type: tipo,
      sort_order: sort++,
      ...(r.family_id ? { family_id: r.family_id } : {}),
    });
  }
  if (items.length > 0) {
    const { error: iErr } = await ctx.supabase.from("quote_items").insert(items);
    if (iErr) return errResult("insert_items", `Preventivo ${quote.quote_number} creato ma righe non salvate: ${iErr.message}. Aprilo dall'app.`);
  }

  const tot = Math.round(totale * 100) / 100;
  const nota = senzaPrezzo.length > 0
    ? `📝 Preventivo ${quote.quote_number} pronto (bozza): ${items.length} righe, ~€ ${tot}. ${senzaPrezzo.length} righe senza prezzo a listino, da completare dall'app. Vuoi il PDF?`
    : `📝 Preventivo ${quote.quote_number} pronto (bozza): ${items.length} righe, imponibile stimato ~€ ${tot}. Vuoi che te lo mandi in PDF?`;
  return okResult({ quote_id: quote.id, quote_number: quote.quote_number, righe: items.length, totale_stimato: tot }, nota);
}
