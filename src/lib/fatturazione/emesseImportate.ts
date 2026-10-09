/**
 * Fatture EMESSE importate da un altro programma (Aruba, Fatture in Cloud…),
 * raggruppate per mese. Stanno in `invoices` (provider xml_import), non in
 * documenti_fiscali: la schermata Fatture non le mostrava, e per chi è passato
 * alla fatturazione interna (Renova, 01/10/2026) lo storico sembrava sparito.
 */

import { importoConSegno, isDocumentoEmesso, isTipoVendita } from "./registroVendite";

export interface EmessaImportata {
  id: string;
  invoice_number: string;
  document_type: string | null;
  status: string | null;
  client_company_name: string | null;
  issue_date: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total: number | null;
  paid_amount: number | null;
  client_fiscal_code?: string | null;
  client_vat_number?: string | null;
  client_address?: string | null;
  client_city?: string | null;
  client_zip?: string | null;
  due_date?: string | null;
  external_xml_url?: string | null;
  client_id?: string | null;
  order_id?: string | null;
  invoice_lines?: Array<{ description: string | null; sort_order: number | null }>;
}

export interface MeseEmesse {
  /** yyyy-MM, oppure «senza-data». */
  chiave: string;
  /** «Settembre 2026». */
  etichetta: string;
  fatture: EmessaImportata[];
  imponibile: number;
  iva: number;
  totale: number;
  incassato: number;
}

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

const due = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Il progressivo di «FPR 62/26» → 62, per ordinare 9 prima di 10 (non come testo). */
export function progressivoDaNumero(numero: string): number {
  const m = numero.match(/(\d+)\s*\/\s*\d{2,4}\s*$/) ?? numero.match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Raggruppa per mese di emissione, dal più recente. Dentro il mese le fatture
 * vanno per numero crescente; le note di credito (TD04) tolgono dal totale.
 */
export function raggruppaPerMese(righe: readonly EmessaImportata[]): MeseEmesse[] {
  const mesi = new Map<string, MeseEmesse>();
  for (const f of righe) {
    if (!isDocumentoEmesso(f.status) || !isTipoVendita(f.document_type)) continue;
    const d = f.issue_date && /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(f.issue_date) ? f.issue_date.slice(0, 7) : "senza-data";
    let m = mesi.get(d);
    if (!m) {
      const etichetta = d === "senza-data" ? "Senza data" : `${MESI[parseInt(d.slice(5, 7), 10) - 1]} ${d.slice(0, 4)}`;
      m = { chiave: d, etichetta, fatture: [], imponibile: 0, iva: 0, totale: 0, incassato: 0 };
      mesi.set(d, m);
    }
    m.fatture.push(f);
    m.imponibile = due(m.imponibile + importoConSegno(f.document_type, f.subtotal));
    m.iva = due(m.iva + importoConSegno(f.document_type, f.tax_amount));
    m.totale = due(m.totale + importoConSegno(f.document_type, f.total));
    m.incassato = due(m.incassato + importoConSegno(f.document_type, f.paid_amount));
  }
  const out = [...mesi.values()];
  for (const m of out) m.fatture.sort((a, b) => progressivoDaNumero(a.invoice_number) - progressivoDaNumero(b.invoice_number));
  return out.sort((a, b) => (a.chiave === "senza-data" ? 1 : b.chiave === "senza-data" ? -1 : b.chiave.localeCompare(a.chiave)));
}

/** Numeri mancanti nella serie (es. 63–72 se l'ultima importata è la 62 e si è passati a 73). */
export function numeriMancanti(righe: readonly EmessaImportata[], fino: number): number[] {
  const presenti = new Set(righe.map((r) => progressivoDaNumero(r.invoice_number)).filter((n) => n > 0));
  const out: number[] = [];
  for (let n = 1; n <= fino; n++) if (!presenti.has(n)) out.push(n);
  return out;
}
