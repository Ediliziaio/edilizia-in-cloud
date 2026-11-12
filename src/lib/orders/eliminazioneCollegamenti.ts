/**
 * Cosa succede eliminando un ordine, un DDT, una richiesta d'offerta o un sopralluogo (12/11/2026).
 *
 * Il database risponde, per ogni documento, con le tabelle toccate: quelle che si cancellano con
 * lui (le sue parti) e quelle che restano ma si scollegano (DDT, costi, fatture…). Qui diventano
 * parole, così chi conferma sa cosa sparisce e cosa no.
 */

const NOMI: Record<string, string> = {
  purchase_order_items: "righe dell'ordine",
  procurement_document_events: "voci dello storico",
  ddt_ordini_acquisto: "legami tra DDT e ordine",
  arrivi_posizione: "arrivi per posizione",
  controlli_documento_fornitore: "controlli della conferma",
  purchase_order_verifications: "verifiche dell'ordine",
  fattura_ricevuta_ordini: "legami tra fattura e ordine",
  mezzi_piani_spese: "spese sui mezzi",
  ddt_righe: "righe di DDT",
  ddt_consegne: "consegne della merce",
  ddt_operazioni_consegna: "operazioni di consegna",
  ddt_valorizzazioni: "valorizzazioni",
  fattura_ddt_quantita: "quantità abbinate in fattura",
  ddt_document_jobs: "letture del documento",
  supplier_rfq_items: "righe della richiesta",
  supplier_rfq_suppliers: "fornitori invitati",
  supplier_rfq_quotes: "prezzi offerti",
  survey_areas: "ambienti",
  survey_elements: "elementi rilevati",
  survey_media: "foto e allegati",
  survey_assignees: "incaricati",
  survey_activity_log: "voci del registro",
  ddt_ricezione: "DDT",
  company_costs: "costi",
  fatture_ricevute: "fatture ricevute",
  fattura_ddt: "abbinamenti fattura-DDT",
  supplier_rfqs: "richieste d'offerta",
  order_items: "voci di commessa",
  campo_acquisti: "acquisti dal cantiere",
  goods_receipts: "ricezioni",
  email_inbox: "email",
  giornale_eventi: "eventi del giornale",
  warehouse_scan_events: "letture del magazzino",
  planimetrie: "planimetrie",
  order_item_misure_storico: "misure storiche",
  email_ddt_carico: "email di carico",
  proposed_purchase_orders: "proposte d'ordine",
  rapportino_materiali_regolarizzati: "materiali dei rapportini",
};

const nome = (tabella: string) => NOMI[tabella] ?? tabella.replace(/_/g, " ");

/** «3 righe di DDT, 2 consegne della merce»: vuoto se non c'è niente. */
export function descriviTabelle(conteggi: Record<string, number> | null | undefined): string {
  return Object.entries(conteggi ?? {})
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => `${n} ${nome(t)}`)
    .join(", ");
}

/** La parola da scrivere per confermare un'eliminazione con collegamenti. */
export const PAROLA_CONFERMA = "CANCELLA";

export const confermaScrittaOk = (testo: string) => testo.trim().toUpperCase() === PAROLA_CONFERMA;
