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
 *   I totali della testata li ricalcola il database dalle righe a ogni
 *   salvataggio (do_recalculate_quote_totals): lo sconto della simulazione deve
 *   quindi stare in `quotes.discount_percent` ({@link testataPreventivo}).
 * - Commessa: `CreateOrder.tsx` → RPC `create_order_atomic({ p_order_data,
 *   p_items, p_salesperson, p_user_id, p_installments })` che ritorna
 *   `{ id, success }`. `p_order_data` usa total_amount (netto IVA), vat_rate,
 *   work_start_date/work_end_date, financing_amount/financing_cost, payment_type.
 */
import { calcolaVoce, round2, ripartoIvaVoci, type QuotaIvaVoce } from "./calcoli";
import type { SimulazioneDoc, SimulazioneRisultato, VoceSim, ScenariConfig } from "./tipi";

/** Aliquote della simulazione: modalità e aliquota unica. */
type ScenarioIva = Pick<ScenariConfig, "iva_mode" | "iva_rate_singola">;

/** Al massimo due decimali, come le colonne numeric(…, 2) di `quote_items`. */
const dueDecimali = (n: number): boolean => Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** "Cod. X · 12.5 mq": la quantità vera, quando la riga diventa 1 × il totale. */
const descrizioneQuantita = (v: VoceSim): string =>
  `${v.codice ? `Cod. ${v.codice} · ` : ""}${v.quantita} ${v.unita}`;

/** Le quote IVA di una voce con un importo (le quote a zero non diventano righe). */
const quoteConImporto = (quote: QuotaIvaVoce[]): QuotaIvaVoce[] => quote.filter((q) => q.imponibile !== 0);

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
  prezzo_acquisto: number;
  sort_order: number;
}

/**
 * mapVociToQuoteItems — voci simulate → righe `quote_items` insert-ready.
 *
 * - `name` = descrizione, `unit_price` = prezzo_unitario, `unit_of_measure` =
 *   unita, `line_total` = round2(quantita × prezzo_unitario).
 * - `vat_rate` = l'aliquota della voce secondo {@link ripartoIvaVoci}: in
 *   `singola` l'aliquota unica dello scenario (05/10/2026: prima la riga
 *   portava la sua `vat_rate`, e il database ricalcolava un'IVA diversa da
 *   quella simulata), in `mista` quella di riga.
 * - `tariffa_id` = riferimento_id solo se la fonte è 'listino' (le voci da
 *   prezzario/libere non hanno una tariffa aziendale collegata).
 * - `item_category` = 'posa' per la manodopera, 'prodotto' altrimenti.
 * - `prezzo_acquisto` = costo_unitario (così il margine nel CRM è corretto e non
 *   risulta 100%).
 * - `sort_order` = ordine della voce.
 *
 * Il database ricalcola i totali dalle righe (line_total generata, quantity e
 * unit_price a due decimali): una quantità o un prezzo con più decimali
 * avrebbe cambiato il totale di qualche centesimo, quindi quella riga diventa
 * 1 × il totale di riga (col costo di riga) e la quantità va nella descrizione.
 *
 * Beni significativi in IVA mista: la riga si divide nelle sue quote di
 * {@link ripartoIvaVoci} — "(bene significativo)" al 10% (posa e bene fino al
 * limite) ed "(eccedenza 22%)" — con `quantity: 1` e `unit_price` = quota. Le
 * quote sommano al totale della voce: il preventivo non cresce di un euro
 * (prima cresceva della posa). Il costo della voce sta sulla prima riga.
 */
export function mapVociToQuoteItems(
  voci: VoceSim[],
  companyId: string,
  quoteId: string,
  iva: ScenarioIva,
): QuoteItemInsert[] {
  const items: QuoteItemInsert[] = [];
  const riparto = ripartoIvaVoci(voci, iva);

  voci.forEach((v, idx) => {
    // Totale e costo di riga dallo stesso conto della simulazione (al centesimo esatto).
    const { imponibile_ricavo: totaleRiga, imponibile_costo: costoRiga } = calcolaVoce(v);
    const base = {
      quote_id: quoteId,
      company_id: companyId,
      description: v.codice ? `Cod. ${v.codice}` : null,
      unit_of_measure: v.unita,
      tariffa_id: v.fonte === "listino" ? v.riferimento_id : null,
      item_category: (v.is_manodopera ? "posa" : "prodotto") as "prodotto" | "posa",
      item_type: v.is_manodopera ? "service" : "product",
      prezzo_acquisto: round2(v.costo_unitario),
      sort_order: v.ordine,
    };
    const quote = riparto[idx];

    if (iva.iva_mode === "mista" && v.bene_significativo) {
      const conImporto = quoteConImporto(quote);
      // Riga a zero: resta una riga sola, come le altre.
      if (conImporto.length === 0) {
        items.push({
          ...base, name: v.descrizione, quantity: 1, unit_price: 0, vat_rate: 10, line_total: 0,
          description: descrizioneQuantita(v), prezzo_acquisto: costoRiga,
        });
        return;
      }
      conImporto.forEach((q, k) => {
        items.push({
          ...base,
          name: `${v.descrizione} ${q.aliquota === 22 ? "(eccedenza 22%)" : "(bene significativo)"}`,
          description: descrizioneQuantita(v),
          quantity: 1,
          unit_price: q.imponibile,
          vat_rate: q.aliquota,
          line_total: q.imponibile,
          // quantity è 1 → il costo di riga è il costo totale della voce, sulla prima.
          prezzo_acquisto: k === 0 ? costoRiga : 0,
        });
      });
      return;
    }

    const aliquota = quote[0]?.aliquota ?? v.vat_rate;
    if (dueDecimali(v.quantita) && dueDecimali(v.prezzo_unitario)) {
      items.push({
        ...base,
        name: v.descrizione,
        quantity: v.quantita,
        unit_price: v.prezzo_unitario,
        vat_rate: aliquota,
        line_total: totaleRiga,
      });
    } else {
      items.push({
        ...base,
        name: v.descrizione,
        description: descrizioneQuantita(v),
        quantity: 1,
        unit_price: totaleRiga,
        vat_rate: aliquota,
        line_total: totaleRiga,
        prezzo_acquisto: costoRiga,
      });
    }
  });

  return items;
}

/** Importi della testata `quotes` di un preventivo creato dalla simulazione. */
export interface TestataPreventivo {
  /** Somma delle righe, prima dello sconto. */
  subtotal: number;
  /** Sconto della simulazione in %: il database lo applica alle righe. */
  discount_percent: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
}

/**
 * testataPreventivo — importi della testata del preventivo, dal risultato della
 * simulazione. 05/10/2026: la testata nasceva con lo sconto a zero e il
 * database, ricalcolando i totali dalle righe, lo perdeva (10.000 € −10%
 * diventava un preventivo da 10.000 €). Ora lo sconto sta in
 * `discount_percent`, e gli altri importi sono quelli che il database ricalcola
 * dalle righe di {@link mapVociToQuoteItems}: ricavo lordo, sconto, IVA e totale
 * della simulazione.
 */
export function testataPreventivo(doc: SimulazioneDoc, risultato: SimulazioneRisultato): TestataPreventivo {
  return {
    subtotal: round2(risultato.ricavo_lordo),
    discount_percent: Math.min(100, Math.max(0, Number(doc.scenari.sconto_pct) || 0)),
    discount_amount: round2(risultato.sconto_valore),
    vat_amount: round2(risultato.iva_totale),
    total: round2(risultato.prezzo_cliente),
  };
}

/** Payload `p_items` per la RPC `create_order_atomic` (riga `order_items`). */
export interface OrderItemPayload {
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit_of_measure: string;
  vat_rate: number;
  /** Sconto della simulazione in % (lo legge la RPC, colonna `order_items.discount_percent`). */
  discount_percent: number;
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
 * - `total_amount` = ricavo NETTO, dopo lo sconto (IVA esclusa: la commessa
 *   aggiunge l'IVA con `vat_rate`, come in CreateOrder). 05/10/2026: prima era
 *   il ricavo lordo, e lo sconto della simulazione spariva (10.000 € −10%
 *   diventava una commessa da 10.000 €).
 * - `vat_rate` = aliquota singola attiva in modalità 'singola'; in 'mista'
 *   l'aliquota EFFETTIVA = round2(iva_totale / ricavo_netto × 100), così
 *   l'IVA della commessa combacia col simulato (fallback all'aliquota singola
 *   se l'imponibile è 0).
 * - `p_items`: `order_items.quantity` è INTEGER a DB (la RPC fa `::integer`),
 *   quindi una quantità decimale (es. 12,5 mq) farebbe fallire l'INSERT. Per
 *   ogni voce usiamo `quantity: 1` e `unit_price` = line_total della voce
 *   (round2(quantita × prezzo_unitario)); la quantità reale resta nella
 *   descrizione. L'aliquota di riga è quella di {@link ripartoIvaVoci} (in
 *   mista i beni significativi diventano due righe, 10% ed eccedenza 22%, come
 *   nel preventivo) e lo sconto della simulazione va su ogni riga
 *   (`discount_percent`): fatture e PDF della commessa lo leggono da lì.
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

  // Aliquota effettiva: in mista la deduciamo da iva_totale/netto così la
  // commessa applica la stessa IVA del simulato; in singola è l'aliquota scelta.
  const vatRate =
    doc.scenari.iva_mode === "singola"
      ? doc.scenari.iva_rate_singola
      : risultato.ricavo_netto > 0
        ? round2((risultato.iva_totale / risultato.ricavo_netto) * 100)
        : doc.scenari.iva_rate_singola;
  const scontoPct = Math.min(100, Math.max(0, Number(doc.scenari.sconto_pct) || 0));

  // `order_items.quantity` è INTEGER → quantità decimali farebbero fallire il
  // cast nella RPC. Comprimiamo ogni voce a quantity:1 con unit_price =
  // line_total (o la sua quota IVA); la quantità reale finisce in description.
  const riparto = ripartoIvaVoci(doc.voci, doc.scenari);
  const items: OrderItemPayload[] = [];
  doc.voci.forEach((v, idx) => {
    const quote = quoteConImporto(riparto[idx]);
    const divisa = doc.scenari.iva_mode === "mista" && v.bene_significativo && quote.length > 0;
    const righe = divisa
      ? quote
      : [{ aliquota: riparto[idx][0]?.aliquota ?? v.vat_rate, imponibile: calcolaVoce(v).imponibile_ricavo }];
    righe.forEach((q, k) => {
      items.push({
        name: divisa
          ? `${v.descrizione} ${q.aliquota === 22 ? "(eccedenza 22%)" : "(bene significativo)"}`
          : v.descrizione,
        description: descrizioneQuantita(v),
        quantity: 1,
        unit_price: q.imponibile,
        unit_of_measure: v.unita,
        vat_rate: q.aliquota,
        discount_percent: scontoPct,
        // quantity è forzato a 1 → il costo di riga è il costo totale della voce
        // (quantita × costo_unitario), non il costo unitario; sulla prima riga.
        purchase_price: k === 0 ? calcolaVoce(v).imponibile_costo : 0,
        position: items.length,
      });
    });
  });

  return {
    p_order_data: {
      company_id: opts.companyId,
      customer_id: opts.customerId,
      description: opts.description,
      total_amount: round2(risultato.ricavo_netto),
      vat_rate: vatRate,
      current_status_id: opts.statusId,
      payment_type: fin ? "financing" : "standard",
      work_start_date: workStart,
      work_end_date: workEnd,
      financing_amount: fin ? round2(fin.importo_finanziato) : 0,
      financing_cost: fin ? round2(opts.financingCost ?? 0) : 0,
    },
    p_items: items,
    p_salesperson: null,
    p_user_id: opts.userId,
    p_installments: [],
  };
}
