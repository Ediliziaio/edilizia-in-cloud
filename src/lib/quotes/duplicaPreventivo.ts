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
import { allegaSchedeTecniche, type SchedaNonAllegata } from "@/lib/quotes/allegatiPreventivo";

/** Gli errori PostgREST sono oggetti semplici: si estrae un messaggio leggibile. */
function comeErrore(e: unknown, fallback: string): Error {
  if (e instanceof Error) return e;
  const msg = (e as { message?: string } | null)?.message;
  return new Error(msg || fallback);
}

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

export interface EsitoCopia {
  /** Id del nuovo preventivo. */
  id: string;
  /** Le schede tecniche dell'originale che il database non ha lasciato allegare alla copia. */
  nonAllegate: SchedaNonAllegata[];
}

/**
 * Esegue la duplicazione per davvero. Ritorna l'id del nuovo preventivo e le
 * schede tecniche rimaste fuori (avvisoSchedeNonAllegate le mette in parole).
 * Fallisce rumorosamente: chi chiama mostra il toast.
 */
export async function duplicaPreventivo(
  quoteId: string,
  companyId: string,
  opts: OpzioniCopia,
): Promise<EsitoCopia> {
  const { data: originale, error: eQuote } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("company_id", companyId)
    .single();
  if (eQuote || !originale) throw comeErrore(eQuote, "Preventivo non trovato");

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

  // Righe e allegati si leggono PRIMA di creare la copia: se una lettura non
  // riesce ci si ferma senza aver creato niente, e chi riprova non fa doppioni.
  const { data: righe, error: eRighe } = await supabase
    .from("quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (eRighe) throw comeErrore(eRighe, "Lettura righe non riuscita");

  // Allegati PDF selezionati: si copiano i riferimenti, non i file.
  const { data: allegati, error: eAllegati } = await supabase
    .from("quote_pdf_attachments")
    .select("material_id, sort_order, quote_pdf_materials(name)")
    .eq("quote_id", quoteId);
  if (eAllegati) throw comeErrore(eAllegati, "Lettura schede tecniche non riuscita");

  const payloadQuote = costruisciCopiaQuote(originale as Record<string, unknown>, opts);

  // created_by e' NOT NULL senza default: la copia la firma chi la crea.
  const { data: sessione } = await supabase.auth.getUser();
  if (!sessione?.user?.id) throw new Error("Sessione scaduta: accedi di nuovo.");
  payloadQuote.created_by = sessione.user.id;

  const { data: numData } = await supabase.rpc("generate_quote_number", {
    p_company_id: companyId,
  });
  payloadQuote.quote_number = numData || `OFF-${new Date().getFullYear()}-001`;

  const { data: nuovo, error: eIns } = await (supabase as any)
    .from("quotes")
    .insert(payloadQuote)
    .select("id")
    .single();
  if (eIns || !nuovo) throw comeErrore(eIns, "Creazione copia non riuscita");

  if ((righe ?? []).length > 0) {
    const { error: eRpc } = await supabase.rpc("save_quote_items_atomic", {
      p_quote_id: nuovo.id,
      p_company_id: companyId,
      p_items: costruisciPayloadRighe(righe as Array<Record<string, unknown>>),
    });
    if (eRpc) throw comeErrore(eRpc, "Copia righe non riuscita");
  }

  // Prima l'errore del database non si guardava: bastava una scheda rifiutata
  // (dal 26/09 quella di un'altra azienda) e la copia le perdeva tutte, in
  // silenzio. Ora le buone entrano e le altre tornano a chi chiama, che lo
  // dice. Niente eccezione: la copia ormai esiste, e chi riprova ne farebbe
  // un'altra.
  const nonAllegate = await allegaSchedeTecniche(
    nuovo.id as string,
    (allegati ?? []).map((a) => ({
      material_id: a.material_id,
      sort_order: a.sort_order,
      nome: a.quote_pdf_materials?.name ?? null,
    })),
  );

  return { id: nuovo.id as string, nonAllegate };
}
