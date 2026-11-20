/**
 * ddtCarico — logica condivisa "documento DDT estratto → bozza di carico".
 *
 * Estratta 1:1 da email-ai-ddt-carico (MP-EMAIL-AI-07) per essere riusata da
 * più sorgenti senza duplicare la logica di match ODA + confronto righe:
 *   - email-ai-ddt-carico  (DDT arrivato via email/PEC)
 *   - whatsapp-ai-processor / carica_ddt  (DDT fotografato dall'operaio in cantiere)
 *
 *   1) Cerca il riferimento esatto tra gli ordini compatibili del fornitore.
 *   2) Confronta le righe con la quantità ancora da ricevere.
 *   3) Salva una BOZZA di carico (stato 'bozza'). La giacenza NON si tocca:
 *      l'aggiornamento è azione umana successiva (mai movimento cieco).
 *
 * Il `campi` del documento estratto segue lo schema canonico MP-06:
 *   { numero:{valore}, data:{valore}, riferimento_ordine:{valore},
 *     fornitore_ragione_sociale:{valore}, righe:[{descrizione,codice,qta}] }
 */

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseImporto, validatePartitaIva } from "./doc-validation.ts";
import { confrontaNumeri, nomeConfrontabile, numeroDocumento, soloAlfanumerico, unitaCanonica } from "../../../shared/acquisti/normalizza.ts";

const STATI_IN_CONSEGNA = ["inviato", "confermato", "parziale"];

export interface OrdinePerCaricoDdt {
  id: string;
  oda_number: string | null;
  supplier_reference: string | null;
  supplier_id: string | null;
  issue_date: string | null;
  status: string | null;
}

export function ordiniDaRiferimentoDdt(
  riferimento: string, dataDdt: string | null, fornitoreId: string, ordini: OrdinePerCaricoDdt[],
): OrdinePerCaricoDdt[] {
  const numero = numeroDocumento(riferimento
    .replace(/^rif(?:erimento)?\.?\s*[:#]?\s*/i, "")
    .replace(/^(?:vs\.?|vostro)\s+/i, ""));
  if (!numero) return [];
  return ordini.filter((ordine) => {
    if (ordine.supplier_id !== fornitoreId || !STATI_IN_CONSEGNA.includes(ordine.status ?? "")) return false;
    if (dataDdt && ordine.issue_date && ordine.issue_date > dataDdt) return false;
    const annoOrdine = ordine.issue_date ? Number(ordine.issue_date.slice(0, 4)) : null;
    return [ordine.oda_number, ordine.supplier_reference].some((valore) => {
      const candidato = numeroDocumento(valore);
      const annoRiferimento = candidato?.anno ?? annoOrdine;
      return confrontaNumeri(numero, candidato) !== "diverso"
        && (numero.anno == null || numero.anno === annoRiferimento);
    });
  });
}

export interface DdtDocForCarico {
  id: string;
  company_id: string;
  email_id: string | null;
  campi: Record<string, any>;
  fornitore_match_id: string | null;
}

export interface BuildDdtCaricoOk {
  ok: true;
  carico: any;
  ordine_collegato: boolean;
  scostamenti: number;
  avviso_ordine: string | null;
}

export interface BuildDdtCaricoErr {
  ok: false;
  error: string;
  reason?: string;
  status: number;
}

export type BuildDdtCaricoResult = BuildDdtCaricoOk | BuildDdtCaricoErr;

async function fornitoreDellaBolla(supabase: SupabaseClient, doc: DdtDocForCarico): Promise<string | null> {
  const piva = String(doc.campi.piva?.valore ?? "").trim();
  if (piva) {
    if (!validatePartitaIva(piva)) return null;
    const { data, error } = await supabase.rpc("fornitore_unico_per_cedente", {
      p_company_id: doc.company_id, p_piva: piva, p_cf: null,
    });
    if (error) throw error;
    return typeof data === "string" ? data : null;
  }
  const ragione = String(doc.campi.fornitore_ragione_sociale?.valore ?? "").trim();
  if (!ragione) return null;
  const modello = ragione.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await supabase.from("suppliers").select("id")
    .eq("company_id", doc.company_id).ilike("name", modello).limit(2);
  if (error) throw error;
  const id = data?.length === 1 ? data[0].id : null;
  return id && (!doc.fornitore_match_id || doc.fornitore_match_id === id) ? id : null;
}

/**
 * Costruisce (e persiste) la bozza di carico per un documento DDT già estratto.
 * `supabase` deve essere un client SERVICE_ROLE (le query attraversano la RLS
 * solo lato chiamante, qui si lavora su dati già autorizzati).
 */
export async function buildDdtCarico(
  supabase: SupabaseClient,
  doc: DdtDocForCarico,
  createdBy: string | null,
): Promise<BuildDdtCaricoResult> {
  const campi = (doc.campi || {}) as Record<string, any>;
  const righeRaw: any[] = Array.isArray(campi.righe) ? campi.righe : [];
  if (righeRaw.length === 0) {
    return {
      ok: false,
      error: "nessuna_riga",
      reason: "Il documento non ha righe articolo estratte.",
      status: 422,
    };
  }

  const numero: string | null = campi.numero?.valore ?? null;
  const dataDdt = /^\d{4}-\d{2}-\d{2}$/.test(campi.data?.valore ?? "") ? String(campi.data.valore) : null;
  const riferimento = String(campi.riferimento_ordine?.valore ?? "").trim().slice(0, 100);
  const fornitoreId = await fornitoreDellaBolla(supabase, doc);

  let po: OrdinePerCaricoDdt | null = null;
  let avvisoOrdine: string | null = null;
  if (!riferimento) {
    avvisoOrdine = "La bolla non cita un ordine. Se c'è un ordine, verifica il riferimento prima di registrare.";
  } else if (!fornitoreId) {
    avvisoOrdine = `Ordine ${riferimento}. Verifica il fornitore della bolla.`;
  } else {
    const ordini: OrdinePerCaricoDdt[] = [];
    const pagina = 500;
    for (let da = 0; ; da += pagina) {
      const { data, error } = await supabase.from("purchase_orders")
        .select("id, oda_number, supplier_reference, supplier_id, issue_date, status")
        .eq("company_id", doc.company_id).eq("supplier_id", fornitoreId)
        .in("status", STATI_IN_CONSEGNA).order("id").range(da, da + pagina - 1);
      if (error) throw error;
      ordini.push(...(data ?? []));
      if (!data || data.length < pagina) break;
    }
    const candidati = ordiniDaRiferimentoDdt(riferimento, dataDdt, fornitoreId, ordini);
    if (candidati.length === 1) po = candidati[0];
    else avvisoOrdine = candidati.length
      ? `Il riferimento ${riferimento} corrisponde a più ordini del fornitore. Verifica quale copre la consegna.`
      : `Ordine ${riferimento} non trovato tra gli ordini da ricevere di questo fornitore.`;
  }

  // ── Carica righe ordine + confronto ─────────────────────────────────────
  let poItems: any[] = [];
  if (po) {
    const { data: items, error } = await supabase
      .from("purchase_order_items")
      .select("id, description, sku, quantity, quantity_received, unit_of_measure, order_item_id")
      .eq("purchase_order_id", po.id);
    if (error) throw error;
    poItems = items || [];
  }

  // Il su misura va al cantiere: la conferma non lo carica, e lo si dice subito sulla riga.
  const suMisura = new Set<string>();
  const collegate = poItems.map((it) => it.order_item_id).filter(Boolean);
  if (collegate.length > 0) {
    const { data: rc, error } = await supabase.from("order_items")
      .select("id, gruppo_id, measure_status, orders!order_items_order_id_fkey!inner(company_id)")
      .eq("orders.company_id", doc.company_id).in("id", collegate);
    if (error) throw error;
    for (const r of rc || []) if (r.gruppo_id != null || r.measure_status != null) suMisura.add(r.id);
  }

  const usedItem = new Set<string>();
  const righe = righeRaw.map((r) => {
    const descr = (r.descrizione ?? r.descr ?? "").toString();
    const codice = (r.codice ?? r.sku ?? "").toString().trim();
    const qtaBolla = parseImporto(r.qta ?? r.quantita ?? r.quantity) ?? 0;
    const articolo = soloAlfanumerico(codice);
    const descrizione = nomeConfrontabile(descr);
    const unita = unitaCanonica(r.unita_misura ?? r.unita ?? null);
    const compatibili = poItems.filter((it) => {
      const sku = soloAlfanumerico(it.sku);
      const um = unitaCanonica(it.unit_of_measure);
      return !usedItem.has(it.id) && (!unita || !um || unita === um)
        && (articolo && sku ? articolo === sku : descrizione.length >= 4 && nomeConfrontabile(it.description) === descrizione);
    });
    const match = compatibili.length === 1 && qtaBolla > 0 ? compatibili[0] : null;
    if (match) usedItem.add(match.id);
    const qtaOrdine = match ? (parseImporto(match.quantity) ?? 0) : null;
    const qtaResidua = qtaOrdine == null ? null : Math.max(0, qtaOrdine - (parseImporto(match.quantity_received) ?? 0));
    const scostamento = qtaResidua == null ? null : Number((qtaBolla - qtaResidua).toFixed(3));
    let note: string | null = null;
    if (qtaBolla <= 0) note = "Quantità della bolla da verificare";
    else if (po && compatibili.length > 1) note = "Più righe compatibili nell’ordine. Verifica l’articolo.";
    else if (po && !match) note = "Articolo o unità da verificare nell’ordine";
    else if (scostamento) note = scostamento > 0 ? "Consegnato più del residuo dell’ordine" : "Consegna parziale";
    if (match?.order_item_id && suMisura.has(match.order_item_id)) {
      note = [note, "Su misura: va al cantiere, si spunta posizione per posizione"].filter(Boolean).join(". ");
    }
    return { descrizione: descr, codice: codice || null, qta_bolla: qtaBolla, qta_ordine: qtaOrdine,
      qta_residua: qtaResidua, scostamento, po_item_id: match?.id ?? null, note };
  });

  // articoli a ordine non consegnati (mancanti nella bolla)
  const mancanti = poItems.filter((it) =>
    !usedItem.has(it.id) && (parseImporto(it.quantity) ?? 0) > (parseImporto(it.quantity_received) ?? 0)
  ).map((it) => ({
    descrizione: (it.description || "").toString(), codice: it.sku ?? null,
    qta_bolla: 0, qta_ordine: parseImporto(it.quantity) ?? 0,
    qta_residua: (parseImporto(it.quantity) ?? 0) - (parseImporto(it.quantity_received) ?? 0),
    scostamento: (parseImporto(it.quantity_received) ?? 0) - (parseImporto(it.quantity) ?? 0),
    po_item_id: it.id, note: "Ancora da ricevere, assente in questa bolla",
  }));
  const righeFinali = [...righe, ...mancanti];
  const scostamentiTotali = righeFinali.filter((r) => po
    ? r.scostamento !== 0
    : r.qta_bolla <= 0).length;

  // ── Salva bozza carico (sostituisce eventuale bozza viva per il documento) ─
  const { error: eliminaErrore } = await supabase.from("email_ddt_carico").delete()
    .eq("company_id", doc.company_id).eq("documento_estratto_id", doc.id).eq("stato", "bozza");
  if (eliminaErrore) return { ok: false, error: "save_failed", reason: eliminaErrore.message, status: 500 };
  const { data: carico, error: insErr } = await supabase
    .from("email_ddt_carico")
    .insert({
      company_id: doc.company_id,
      email_id: doc.email_id,
      documento_estratto_id: doc.id,
      fornitore_match_id: fornitoreId,
      ddt_numero: numero,
      ddt_data: dataDdt,
      purchase_order_id: po?.id ?? null,
      purchase_order_numero: po?.oda_number ?? null,
      senza_ordine: !po,
      avviso_ordine: avvisoOrdine,
      righe: righeFinali,
      scostamenti_totali: scostamentiTotali,
      created_by: createdBy,
    })
    .select("*").single();
  if (insErr) return { ok: false, error: "save_failed", reason: insErr.message, status: 500 };

  return { ok: true, carico, ordine_collegato: !!po, scostamenti: scostamentiTotali, avviso_ordine: avvisoOrdine };
}
