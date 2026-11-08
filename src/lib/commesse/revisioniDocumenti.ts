/**
 * Revisioni dei documenti di commessa (order_attachments, migrazione
 * 20281222220000): tipo, codice dell'elaborato, revisione e stato. Approvando
 * una revisione, quella approvata prima con lo stesso codice diventa «superata»
 * (lo fa documento_commessa_revisione nel database).
 */

export type TipoDocumentoCommessa = "tavola" | "computo" | "specifica" | "relazione" | "contratto" | "altro";
export type StatoRevisione = "in_lavorazione" | "approvato" | "superato";

export const TIPI_DOCUMENTO: Array<{ valore: TipoDocumentoCommessa; etichetta: string }> = [
  { valore: "tavola", etichetta: "Tavola" },
  { valore: "computo", etichetta: "Computo metrico" },
  { valore: "specifica", etichetta: "Specifica tecnica" },
  { valore: "relazione", etichetta: "Relazione" },
  { valore: "contratto", etichetta: "Contratto" },
  { valore: "altro", etichetta: "Altro" },
];

export const STATI_REVISIONE: Array<{ valore: StatoRevisione; etichetta: string }> = [
  { valore: "in_lavorazione", etichetta: "In lavorazione" },
  { valore: "approvato", etichetta: "Approvato" },
  { valore: "superato", etichetta: "Superato" },
];

export interface DatiRevisione {
  tipo_documento?: string | null;
  codice_elaborato?: string | null;
  revisione?: string | null;
  stato_revisione?: string | null;
}

/** «Tavola A-01 · Rev. B»: vuoto se il documento non ha dati di revisione. */
export function testoRevisione(d: DatiRevisione): string {
  const tipo = TIPI_DOCUMENTO.find((t) => t.valore === d.tipo_documento)?.etichetta;
  return [
    [tipo, d.codice_elaborato?.trim()].filter(Boolean).join(" "),
    d.revisione?.trim() ? `Rev. ${d.revisione.trim()}` : null,
  ].filter(Boolean).join(" · ");
}

export function etichettaStato(stato: string | null | undefined): string | null {
  return STATI_REVISIONE.find((s) => s.valore === stato)?.etichetta ?? null;
}

/** Ha senso mostrare l'etichetta: c'è almeno un dato di revisione. */
export function haRevisione(d: DatiRevisione): boolean {
  return !!(d.tipo_documento || d.codice_elaborato?.trim() || d.revisione?.trim() || d.stato_revisione);
}

/**
 * Dopo l'approvazione di una nuova revisione di un computo o di una tavola,
 * cosa proporre. Le quantità della commessa (lavorazioni e materiali) vengono
 * dal computo e dalle tavole di prima: non si aggiornano da sole. Fino al
 * 07/11/2026 la finestra si chiudeva e nessuno lo diceva. Ora propone la
 * variante (lavorazioni in più o in meno, col cliente) e i materiali da
 * ricontrollare.
 */
export function proponiDopoApprovazione(
  tipo: string | null,
  statoNuovo: string | null,
  statoPrima: string | null,
): boolean {
  return statoNuovo === "approvato" && statoPrima !== "approvato" && (tipo === "computo" || tipo === "tavola");
}

export function linkDopoApprovazione(orderId: string) {
  return {
    varianti: `/azienda/ordini/${orderId}?tab=finanza&vista_economia=varianti`,
    materiali: `/azienda/ordini/${orderId}?tab=articoli&vista_materiali=articoli`,
  };
}
