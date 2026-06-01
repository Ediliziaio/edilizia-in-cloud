/**
 * ddtCarico — logica condivisa "documento DDT estratto → bozza di carico".
 *
 * Estratta 1:1 da email-ai-ddt-carico (MP-EMAIL-AI-07) per essere riusata da
 * più sorgenti senza duplicare la logica di match ODA + confronto righe:
 *   - email-ai-ddt-carico  (DDT arrivato via email/PEC)
 *   - whatsapp-ai-processor / carica_ddt  (DDT fotografato dall'operaio in cantiere)
 *
 * Regole (invariate rispetto all'originale):
 *   1) Match ODA: per riferimento_ordine (oda_number/supplier_reference) o, in
 *      fallback, ultimo ordine aperto del fornitore (per nome → suppliers).
 *   2) Confronto righe: articolo per articolo, qta in bolla vs qta ordinata
 *      (sku esatto, poi descrizione). Scostamenti EVIDENZIATI, mai nascosti.
 *   3) Salva una BOZZA di carico (stato 'bozza'). La giacenza NON si tocca:
 *      l'aggiornamento è azione umana successiva (mai movimento cieco).
 *
 * Il `campi` del documento estratto segue lo schema canonico MP-06:
 *   { numero:{valore}, data:{valore}, riferimento_ordine:{valore},
 *     fornitore_ragione_sociale:{valore}, righe:[{descrizione,codice,qta}] }
 */

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseImporto } from "./doc-validation.ts";

// Stati ODA considerati "aperti" per il match in fallback (non chiusi/annullati).
const ODA_STATI_CHIUSI = new Set([
  "closed",
  "cancelled",
  "annullato",
  "chiuso",
  "completed",
  "completato",
]);

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
}

export interface BuildDdtCaricoErr {
  ok: false;
  error: string;
  reason?: string;
  status: number;
}

export type BuildDdtCaricoResult = BuildDdtCaricoOk | BuildDdtCaricoErr;

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
  const dataDdt: string | null = campi.data?.valore ?? null;
  const riferimento: string | null = campi.riferimento_ordine?.valore ?? null;
  const ragione: string | null = campi.fornitore_ragione_sociale?.valore ?? null;

  // ── Match ODA ───────────────────────────────────────────────────────────
  let po: any = null;
  if (riferimento) {
    // SICUREZZA: ref è AI-estratto (untrusted). NIENTE .or() con stringa interpolata
    // (filter-injection PostgREST). Due .ilike() parametrizzate: supabase-js
    // URL-encoda il valore → niente sintassi-filtro iniettabile.
    const ref = riferimento.toString().trim().slice(0, 80);
    const sel = "id, oda_number, supplier_reference, supplier_id, status";
    const byOda = await supabase.from("purchase_orders").select(sel)
      .eq("company_id", doc.company_id).ilike("oda_number", `%${ref}%`).limit(1).maybeSingle();
    po = byOda.data ?? null;
    if (!po) {
      const bySupRef = await supabase.from("purchase_orders").select(sel)
        .eq("company_id", doc.company_id).ilike("supplier_reference", `%${ref}%`).limit(1).maybeSingle();
      po = bySupRef.data ?? null;
    }
  }
  if (!po && ragione) {
    const { data: sup } = await supabase
      .from("suppliers").select("id").eq("company_id", doc.company_id).ilike("name", ragione).limit(1).maybeSingle();
    if (sup) {
      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, supplier_reference, supplier_id, status")
        .eq("company_id", doc.company_id).eq("supplier_id", sup.id)
        .order("issue_date", { ascending: false }).limit(5);
      po = (pos || []).find((p: any) => !ODA_STATI_CHIUSI.has((p.status || "").toLowerCase())) ?? null;
    }
  }

  // ── Carica righe ordine + confronto ─────────────────────────────────────
  let poItems: any[] = [];
  if (po) {
    const { data: items } = await supabase
      .from("purchase_order_items")
      .select("id, description, sku, quantity, quantity_received, unit_of_measure")
      .eq("purchase_order_id", po.id);
    poItems = items || [];
  }

  const usedItem = new Set<string>();
  const righe = righeRaw.map((r) => {
    const descr = (r.descrizione ?? r.descr ?? "").toString();
    const codice = (r.codice ?? r.sku ?? "").toString().trim();
    const qtaBolla = parseImporto(r.qta ?? r.quantita ?? r.quantity) ?? 0;
    // match: sku esatto → descrizione contiene
    let match: any = null;
    if (codice) match = poItems.find((it) => !usedItem.has(it.id) && (it.sku || "").toString().trim().toLowerCase() === codice.toLowerCase());
    if (!match && descr) {
      const d = descr.toLowerCase().slice(0, 40);
      match = poItems.find((it) => !usedItem.has(it.id) && (it.description || "").toString().toLowerCase().includes(d));
    }
    if (match) usedItem.add(match.id);
    const qtaOrdine = match ? (parseImporto(match.quantity) ?? 0) : null;
    const scostamento = qtaOrdine == null ? null : Number((qtaBolla - qtaOrdine).toFixed(3));
    let note: string | null = null;
    if (qtaOrdine == null) note = "Articolo non presente nell'ordine";
    else if (scostamento && scostamento !== 0) note = scostamento > 0 ? "Consegnato più dell'ordinato" : "Consegnato meno dell'ordinato";
    return { descrizione: descr, codice: codice || null, qta_bolla: qtaBolla, qta_ordine: qtaOrdine, scostamento, po_item_id: match?.id ?? null, note };
  });

  // articoli a ordine non consegnati (mancanti nella bolla)
  const mancanti = poItems.filter((it) => !usedItem.has(it.id)).map((it) => ({
    descrizione: (it.description || "").toString(), codice: it.sku ?? null,
    qta_bolla: 0, qta_ordine: parseImporto(it.quantity) ?? 0,
    scostamento: -(parseImporto(it.quantity) ?? 0), po_item_id: it.id, note: "Ordinato ma non in bolla",
  }));
  const righeFinali = [...righe, ...mancanti];
  const scostamentiTotali = righeFinali.filter((r) => r.scostamento == null || r.scostamento !== 0).length;

  // ── Salva bozza carico (sostituisce eventuale bozza viva per il documento) ─
  await supabase.from("email_ddt_carico").delete().eq("documento_estratto_id", doc.id).eq("stato", "bozza");
  const { data: carico, error: insErr } = await supabase
    .from("email_ddt_carico")
    .insert({
      company_id: doc.company_id,
      email_id: doc.email_id,
      documento_estratto_id: doc.id,
      fornitore_match_id: doc.fornitore_match_id,
      ddt_numero: numero,
      ddt_data: dataDdt && /^\d{4}-\d{2}-\d{2}$/.test(dataDdt) ? dataDdt : null,
      purchase_order_id: po?.id ?? null,
      purchase_order_numero: po?.oda_number ?? null,
      senza_ordine: !po,
      righe: righeFinali,
      scostamenti_totali: scostamentiTotali,
      created_by: createdBy,
    })
    .select("*").single();
  if (insErr) return { ok: false, error: "save_failed", reason: insErr.message, status: 500 };

  return { ok: true, carico, ordine_collegato: !!po, scostamenti: scostamentiTotali };
}
