/**
 * trasforma — mapper PURI dal documento simulazione ai payload di creazione
 * di un preventivo (`quotes` + `quote_items`) o di una commessa (`orders` via
 * RPC `create_order_atomic`). Nessun side-effect: il dialog si occupa di
 * eseguire gli insert/RPC reali (gli stessi usati da QuoteBuilder/CreateOrder).
 *
 * Riferimenti ai flussi reali:
 * - Preventivo: `QuoteBuilder.tsx` → insert `quotes` + RPC `save_quote_items_atomic`.
 *   `quote_items` ha `vat_rate` per-riga, `unit_of_measure`, `item_category`
 *   ('prodotto' | 'posa'), `tariffa_id`, `sort_order`. `line_total` a DB è una
 *   colonna GENERATED ALWAYS (qui calcolata solo per anteprima/coerenza).
 * - Commessa: `CreateOrder.tsx` → RPC `create_order_atomic({ p_order_data,
 *   p_items, p_salesperson, p_user_id, p_installments })` che ritorna
 *   `{ id, success }`. `p_order_data` usa total_amount (netto IVA), vat_rate,
 *   work_start_date/work_end_date, financing_amount/financing_cost, payment_type.
 */
import { round2 } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato, VoceSim } from "./tipi";

/** Riga pronta per l'insert in `quote_items` (mappata dalla voce simulata). */
export interface QuoteItemInsert {
  quote_id: string;
  company_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  unit_of_measure: string;
  line_total: number;
  tariffa_id: string | null;
  item_category: "prodotto" | "posa";
  item_type: string;
  sort_order: number;
}

/**
 * mapVociToQuoteItems — voci simulate → righe `quote_items` insert-ready.
 *
 * - `name` = descrizione, `unit_price` = prezzo_unitario, `vat_rate` per-riga,
 *   `unit_of_measure` = unita, `line_total` = round2(quantita × prezzo_unitario).
 * - `tariffa_id` = riferimento_id solo se la fonte è 'listino' (le voci da
 *   prezzario/libere non hanno una tariffa aziendale collegata).
 * - `item_category` = 'posa' per la manodopera, 'prodotto' altrimenti.
 * - `sort_order` = ordine della voce.
 */
export function mapVociToQuoteItems(
  voci: VoceSim[],
  companyId: string,
  quoteId: string,
): QuoteItemInsert[] {
  return voci.map((v) => ({
    quote_id: quoteId,
    company_id: companyId,
    name: v.descrizione,
    description: v.codice ? `Cod. ${v.codice}` : null,
    quantity: v.quantita,
    unit_price: v.prezzo_unitario,
    vat_rate: v.vat_rate,
    unit_of_measure: v.unita,
    line_total: round2(v.quantita * v.prezzo_unitario),
    tariffa_id: v.fonte === "listino" ? v.riferimento_id : null,
    item_category: v.is_manodopera ? "posa" : "prodotto",
    item_type: v.is_manodopera ? "service" : "product",
    sort_order: v.ordine,
  }));
}

/** Payload `p_items` per la RPC `create_order_atomic` (riga `order_items`). */
export interface OrderItemPayload {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  purchase_price: number;
  position: number;
}

/** Payload completo per la RPC `create_order_atomic`. */
export interface CreateOrderAtomicPayload {
  p_order_data: {
    company_id: string;
    customer_id: string;
    description: string;
    total_amount: number;
    vat_rate: number;
    current_status_id: string;
    payment_type: "standard" | "financing";
    work_start_date: string | null;
    work_end_date: string | null;
    financing_amount: number;
    financing_cost: number;
  };
  p_items: OrderItemPayload[];
  p_salesperson: null;
  p_user_id: string;
  p_installments: never[];
}

export interface MapToOrderOpts {
  companyId: string;
  customerId: string;
  userId: string;
  statusId: string;
  description: string;
  /** Costo del finanziamento (interessi) dallo scenario, se presente. */
  financingCost?: number;
  /** Data di riferimento per le date lavori (default: oggi). Iniettabile nei test. */
  today?: Date;
}

const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * mapToOrderPayload — documento + risultato simulazione → payload
 * `create_order_atomic`.
 *
 * - `total_amount` = ricavo imponibile (netto IVA: la RPC aggiunge l'IVA con
 *   `vat_rate`, coerentemente con CreateOrder dove total_amount è il netto).
 * - `vat_rate` = aliquota singola attiva in modalità 'singola', altrimenti 22.
 * - work dates: `work_start_date` = oggi, `work_end_date` = oggi + durata×7gg
 *   (entrambe null se il cronoprogramma è vuoto, durata_settimane=0).
 * - finanziamento: se presente nello scenario → payment_type 'financing',
 *   financing_amount = importo_finanziato, financing_cost = costo passato.
 */
export function mapToOrderPayload(
  doc: SimulazioneDoc,
  risultato: SimulazioneRisultato,
  opts: MapToOrderOpts,
): CreateOrderAtomicPayload {
  const fin = doc.scenari.finanziamento;
  const today = opts.today ?? new Date();

  let workStart: string | null = null;
  let workEnd: string | null = null;
  if (risultato.durata_settimane > 0) {
    workStart = toDateStr(today);
    const end = new Date(today.getTime());
    end.setDate(end.getDate() + risultato.durata_settimane * 7);
    workEnd = toDateStr(end);
  }

  const vatRate =
    doc.scenari.iva_mode === "singola" ? doc.scenari.iva_rate_singola : 22;

  return {
    p_order_data: {
      company_id: opts.companyId,
      customer_id: opts.customerId,
      description: opts.description,
      total_amount: round2(risultato.ricavo_imponibile),
      vat_rate: vatRate,
      current_status_id: opts.statusId,
      payment_type: fin ? "financing" : "standard",
      work_start_date: workStart,
      work_end_date: workEnd,
      financing_amount: fin ? round2(fin.importo_finanziato) : 0,
      financing_cost: fin ? round2(opts.financingCost ?? 0) : 0,
    },
    p_items: doc.voci.map((v, idx) => ({
      name: v.descrizione,
      description: v.codice ? `Cod. ${v.codice}` : null,
      quantity: v.quantita,
      unit_price: v.prezzo_unitario,
      vat_rate: v.vat_rate,
      purchase_price: round2(v.costo_unitario),
      position: idx,
    })),
    p_salesperson: null,
    p_user_id: opts.userId,
    p_installments: [],
  };
}
