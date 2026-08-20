/**
 * Duplica preventivo — la logica in un posto solo, per due gesti diversi:
 *
 *  - "Duplica": copia indipendente, titolo "(copia)", nessun legame col padre.
 *  - "Nuova revisione": stessa offerta che evolve — parent_quote_id punta
 *    all'originale e revision_number cresce tra i fratelli.
 *
 * In entrambi i casi la copia nasce BOZZA e senza storia: niente firme,
 * niente invii, niente scadenze ereditate. Il numero e' nuovo (RPC
 * generate_quote_number), le righe passano dalla stessa RPC atomica del
 * builder cosi' la gerarchia padre/figlio delle voci si ricostruisce intera.
 */
import { supabase } from "@/integrations/supabase/client";

/** Campi che una copia NON deve mai ereditare. */
const CAMPI_DA_AZZERARE = [
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "quote_number",
  "sent_at",
  "viewed_at",
  "signed_at",
  "signed_by_ip",
  "signed_by_name",
  "signature_token",
  "refused_at",
  "refused_reason",
  "expires_at",
  "deleted_at",
  "deleted_by",
  "pdf_generated_at",
  "pdf_storage_path",
  "ai_pdf_run_id",
  "ai_cost_billed_eur",
  "ai_last_predicted_at",
  "ai_predicted_close_date",
  "ai_close_probability_pct",
  "ai_close_factors",
  "approval_status",
  "parent_quote_id",
  "revision_number",
] as const;

export interface OpzioniCopia {
  /** true = Nuova revisione (legame col padre); false = copia libera. */
  comeRevisione: boolean;
  /** Numero revisione da assegnare (calcolato dal chiamante sui fratelli). */
  numeroRevisione?: number;
}

/**
 * Costruisce il payload del NUOVO quote a partire dalla riga originale.
 * Pura: nessun accesso a rete, testabile a tavolino.
 */
export function costruisciCopiaQuote(
  originale: Record<string, unknown>,
  opts: OpzioniCopia,
): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...originale };
  for (const campo of CAMPI_DA_AZZERARE) delete copia[campo];
  copia.status = "bozza";
  if (opts.comeRevisione) {
    copia.parent_quote_id = originale.id;
    copia.revision_number = opts.numeroRevisione ?? 1;
    // La revisione mantiene il titolo: e' la stessa offerta che cambia.
  } else {
    const titolo = String(originale.title ?? "").trim();
    copia.title = titolo ? `${titolo} (copia)` : "Preventivo (copia)";
  }
  return copia;
}

/**
 * Trasforma le righe DB del preventivo originale nel payload della RPC
 * save_quote_items_atomic, ricostruendo la gerarchia con i temp id.
 * Pura: testabile a tavolino.
 */
export function costruisciPayloadRighe(
  righe: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return righe.map((r, idx) => ({
    sort_order: idx,
    client_temp_id: String(r.id),
    parent_temp_id: r.parent_item_id ? String(r.parent_item_id) : null,
    item_type: r.item_type,
    name: r.name,
    description: r.description ?? null,
    quantity: r.quantity,
    unit_price: r.unit_price,
    discount_percent: r.discount_percent ?? 0,
    vat_rate: r.vat_rate ?? 22,
    unit_of_measure: r.unit_of_measure,
    article_template_id: r.article_template_id ?? null,
    item_category: r.item_category ?? "prodotto",
    tariffa_id: r.tariffa_id ?? null,
    prezzo_acquisto: r.prezzo_acquisto ?? 0,
    mostra_nel_pdf: r.mostra_nel_pdf ?? true,
    is_optional: r.is_optional ?? false,
    misura_x: r.misura_x ?? null,
    misura_y: r.misura_y ?? null,
    family_id: r.family_id ?? null,
    axis_selections: r.axis_selections ?? null,
    supplier_catalog_id: r.supplier_catalog_id ?? null,
    supplier_product_line_id: r.supplier_product_line_id ?? null,
  }));
}

/**
 * Esegue la duplicazione per davvero. Ritorna l'id del nuovo preventivo.
 * Fallisce rumorosamente: chi chiama mostra il toast.
 */
export async function duplicaPreventivo(
  quoteId: string,
  companyId: string,
  opts: OpzioniCopia,
): Promise<string> {
  const { data: originale, error: eQuote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("company_id", companyId)
    .single();
  if (eQuote || !originale) throw eQuote ?? new Error("Preventivo non trovato");

  let numeroRevisione = opts.numeroRevisione;
  if (opts.comeRevisione && numeroRevisione == null) {
    // La radice della catena: se sto revisionando una revisione, i fratelli
    // contano rispetto al capostipite, non al ramo intermedio.
    const radiceId =
      ((originale as Record<string, unknown>).parent_quote_id as string | null) ?? quoteId;
    const { data: fratelli } = await (supabase as any)
      .from("quotes")
      .select("revision_number")
      .eq("parent_quote_id", radiceId);
    const massimo = Math.max(
      0,
      ...(((fratelli ?? []) as Array<{ revision_number: number | null }>).map(
        (f) => Number(f.revision_number ?? 0),
      )),
    );
    numeroRevisione = massimo + 1;
    (opts as OpzioniCopia).numeroRevisione = numeroRevisione;
    (originale as Record<string, unknown>).parent_quote_id = null; // gia' letto sopra
    (originale as Record<string, unknown>).id = radiceId;
  }

  const payloadQuote = costruisciCopiaQuote(originale as Record<string, unknown>, opts);

  const { data: numData } = await supabase.rpc("generate_quote_number", {
    p_company_id: companyId,
  });
  payloadQuote.quote_number = numData || `OFF-${new Date().getFullYear()}-001`;

  const { data: nuovo, error: eIns } = await (supabase as any)
    .from("quotes")
    .insert(payloadQuote)
    .select("id")
    .single();
  if (eIns || !nuovo) throw eIns ?? new Error("Creazione copia non riuscita");

  const { data: righe, error: eRighe } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (eRighe) throw eRighe;

  if ((righe ?? []).length > 0) {
    const { error: eRpc } = await supabase.rpc("save_quote_items_atomic", {
      p_quote_id: nuovo.id,
      p_company_id: companyId,
      p_items: costruisciPayloadRighe(righe as Array<Record<string, unknown>>),
    });
    if (eRpc) throw eRpc;
  }

  // Allegati PDF selezionati: si copiano i riferimenti, non i file.
  const { data: allegati } = await supabase
    .from("quote_pdf_attachments")
    .select("material_id, sort_order")
    .eq("quote_id", quoteId);
  if ((allegati ?? []).length > 0) {
    await supabase.from("quote_pdf_attachments").insert(
      (allegati ?? []).map((a) => ({
        quote_id: nuovo.id,
        material_id: a.material_id,
        sort_order: a.sort_order,
      })),
    );
  }

  return nuovo.id as string;
}
