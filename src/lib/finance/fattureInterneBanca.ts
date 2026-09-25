/**
 * Fatture della fatturazione interna (documenti_fiscali) nella riconciliazione
 * bancaria, accanto a quelle dei gestionali esterni (invoices).
 *
 * Un bonifico abbinato a una di queste è il suo incasso vero: lo registra la
 * RPC riconcilia_bonifico_fattura (movimento, prima nota, scadenza, stato della
 * fattura e rata della commessa insieme); scollega_bonifico_fattura lo storna.
 * Qui solo la parte pura: quali documenti sono candidati e in che forma.
 */

/** Documenti che si incassano con un bonifico (non note di credito, DDT, proforma…). */
export const TIPI_INCASSABILI_DA_BANCA = [
  "fattura",
  "fattura_pa",
  "parcella",
  "fattura_accompagnatoria",
  "acconto_fattura",
  "acconto_parcella",
  "fattura_differita_b",
  "fattura_riepilogativa",
  "nota_debito",
] as const;

/** Emesse e non ancora saldate: niente bozze, annullate, stornate o rifiutate. */
export const STATI_INCASSABILI_DA_BANCA = [
  "emessa",
  "inviata_sdi",
  "consegnata",
  "accettata",
  "scaduta",
  "parzialmente_pagata",
] as const;

export const SELECT_FATTURE_INTERNE_DA_INCASSARE =
  "id, numero, numero_progressivo, anno, cliente_snapshot, totale_da_pagare, importo_pagato, stato, data_scadenza, data_emissione";

export interface FatturaInternaDaIncassare {
  id: string;
  numero: string | null;
  numero_progressivo: number | null;
  anno: number | null;
  cliente_snapshot: { ragione_sociale?: string | null; nome?: string | null; cognome?: string | null } | null;
  totale_da_pagare: number | string | null;
  importo_pagato: number | string | null;
  stato: string;
  data_scadenza: string | null;
  data_emissione: string | null;
}

/** Stessa forma delle righe di invoices che la riconciliazione già usa. */
export interface CandidatoFatturaInterna {
  id: string;
  fonte: "interna";
  invoice_number: string;
  /** «37/2026»: la forma che chi paga scrive più spesso nella causale. */
  numero_breve: string | null;
  client_company_name: string;
  /** Quanto deve pagare il cliente (al netto di ritenuta e split payment). */
  total: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  issue_date: string | null;
  bank_iban: null;
  external_provider: null;
}

export function nomeClienteSnapshot(snapshot: FatturaInternaDaIncassare["cliente_snapshot"]): string {
  if (!snapshot) return "";
  const ragioneSociale = (snapshot.ragione_sociale ?? "").trim();
  if (ragioneSociale) return ragioneSociale;
  return [snapshot.nome, snapshot.cognome].filter(Boolean).join(" ").trim();
}

export function candidatoDaFatturaInterna(d: FatturaInternaDaIncassare): CandidatoFatturaInterna {
  return {
    id: d.id,
    fonte: "interna",
    invoice_number: d.numero ?? "",
    numero_breve: d.numero_progressivo && d.anno ? `${d.numero_progressivo}/${d.anno}` : null,
    client_company_name: nomeClienteSnapshot(d.cliente_snapshot),
    total: Number(d.totale_da_pagare ?? 0),
    paid_amount: Number(d.importo_pagato ?? 0),
    // Le anomalie riconoscono le scadute da «overdue», come per le esterne.
    status: d.stato === "scaduta" ? "overdue" : d.stato,
    due_date: d.data_scadenza,
    issue_date: d.data_emissione,
    bank_iban: null,
    external_provider: null,
  };
}

/** Solo quelle con qualcosa ancora da incassare. */
export function fattureInterneDaIncassare(righe: FatturaInternaDaIncassare[]): CandidatoFatturaInterna[] {
  return righe
    .map(candidatoDaFatturaInterna)
    .filter((c) => c.total - c.paid_amount > 0.005);
}

export function eFatturaInterna(inv: unknown): inv is CandidatoFatturaInterna {
  return (inv as { fonte?: string } | null)?.fonte === "interna";
}

/**
 * Riconciliazione che ha registrato l'incasso di una fattura interna: la si
 * scollega con scollega_bonifico_fattura (storno), mai toccando la scadenza a
 * mano. La scadenza della fattura è «entrata»: le riconciliazioni a scadenza
 * delle uscite puntano sempre a una scadenza fornitore («uscita»).
 */
export function eRiconciliazioneFatturaInterna(rec: {
  movimento_id?: string | null;
  scadenze?: { direction?: string | null } | null;
}): boolean {
  return Boolean(rec.movimento_id) || rec.scadenze?.direction === "entrata";
}
