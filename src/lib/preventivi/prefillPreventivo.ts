import { separaVoci, contrattoPreventivo } from "../../../supabase/functions/_shared/destinazioneVocePreventivo";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { Installment } from "@/lib/orderUtils";
import { parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { type BonusLine, parseBonusLines } from "@/lib/orders/bonusFiscali";
import { righeCommessaDaPreventivo } from "../../../supabase/functions/_shared/righeCommessaDaPreventivo";

/**
 * Dal preventivo ai dati della commessa nuova, senza database: lo usano la creazione
 * della commessa (`useQuotePrefill`, /azienda/ordini/nuovo) e il lettore del preventivo
 * di Silvio (src/lib/silvio-commessa/lettori). Spostato qui dall'hook il 31/10/2026.
 *
 * Porta con sé:
 *  - righe (articoli/prezzi/costi/IVA) + "spina misure" dei prodotti su misura;
 *  - FASI DI PAGAMENTO strutturate → rate della commessa (order_installments),
 *    stesso schema `type` (deposit/balance/financing);
 *  - MODALITÀ di pagamento;
 *  - dati CLIENTE del preventivo (per creare/collegare l'anagrafica in commessa).
 */

/**
 * Le righe del preventivo come righe di commessa: lo stesso conto della
 * conversione automatica (converti-preventivo-cantiere), che usa la stessa
 * funzione. Senza opzionali, con lo sconto di riga, e con le quantità decimali
 * portate a 1 × totale (order_items.quantity è un intero).
 */
export function righePreventivoPerCommessa(rows: Array<Record<string, unknown>>): OrderItem[] {
  return righeCommessaDaPreventivo(rows).map((r, idx): OrderItem => ({
    name: r.name,
    description: r.description ?? undefined,
    quantity: r.quantity,
    status: "da_ordinare",
    position: idx,
    unit_price: r.unit_price ?? undefined,
    purchase_price: r.purchase_price,
    vat_rate: r.vat_rate ?? undefined,
    discount_percent: r.discount_percent ?? undefined,
    // ── spina misure (solo prodotti su misura) ──
    family_id: r.family_id,
    axis_selections: r.axis_selections,
    misure_preventivo: r.misure_preventivo,
    measure_status: r.measure_status,
  }));
}

export interface QuotePrefillClient {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  fiscalCode: string;
  vatNumber: string;
  contactId: string | null;
}

export interface QuotePrefill {
  description: string;
  totalAmount: number;
  vatRate: number;
  version: number;
  workLines: Array<{ name: string; quantity: number; unit_of_measure?: string | null }>;
  quoteNumber: string | null;
  orderItems: OrderItem[];
  paymentMethod: string | null;
  installments: Installment[];
  /** Il preventivo ha un finanziamento (financing_table_id o importo finanziato). */
  hasFinancing: boolean;
  /** Ripartizione tra bonus edilizi decisa in preventivo (vuota se non usata). */
  bonusLines: BonusLine[];
  client: QuotePrefillClient;
}

/** Il preventivo (riga di `quotes`) e le sue righe (`quote_items`, in ordine) come dati della commessa. */
export function prefillDaPreventivo(quote: Record<string, unknown>, rows: Array<Record<string, unknown>>): QuotePrefill {
  const orderItems: OrderItem[] = righePreventivoPerCommessa(rows);

  const q = quote;
  const contratto = contrattoPreventivo(q);

  // Il prezzo a corpo resta sul contratto: non genera un materiale fittizio.
  // ── Fasi di pagamento del preventivo → rate della commessa ──
  // Quello che il preventivo sa lo sa anche la commessa (04/11/2026): il momento
  // d'incasso, quale SAL, e la percentuale. Prima restavano indietro: le rate nascevano
  // a data fissa con scadenze inventate, e «al SAL 2» non era più riconoscibile, così la
  // card «SAL da emettere» della commessa restava vuota.
  const installments: Installment[] = parseQuotePaymentPhases(q.payment_phases).map((p, idx) => ({
    position: idx,
    label: p.label,
    type: p.type,
    amount: p.amount,
    is_paid: false,
    percent: p.percent || undefined,
    trigger_evento: p.evento ?? "data_fissa",
    trigger_numero: p.evento === "sal_numero" ? p.numero ?? null : null,
  }));
  const paymentMethod = typeof q.payment_method === "string" ? q.payment_method : null;
  const hasFinancing = (Number(q.financing_amount) || 0) > 0 || q.financing_table_id != null;
  const bonusLines = parseBonusLines(q.bonus_lines);

  const quoteTyped = quote as {
    title?: string | null;
    description?: string | null;
    quote_number?: string | null;
    client_name?: string | null;
    client_email?: string | null;
    client_phone?: string | null;
    client_company?: string | null;
    client_address?: string | null;
    client_fiscal_code?: string | null;
    client_vat_number?: string | null;
    contact_id?: string | null;
  };

  return {
    description: quoteTyped.title || quoteTyped.description || quoteTyped.quote_number || "",
    totalAmount: contratto.imponibile,
    vatRate: contratto.aliquotaMedia,
    version: Number(q.version ?? 1),
    // Le righe di quote_items hanno almeno nome e quantità: le stesse che leggeva l'hook.
    workLines: separaVoci(rows).lavorazioni as unknown as QuotePrefill["workLines"],
    quoteNumber: quoteTyped.quote_number ?? null,
    orderItems,
    paymentMethod,
    installments,
    hasFinancing,
    bonusLines,
    client: {
      name: quoteTyped.client_name ?? "",
      email: quoteTyped.client_email ?? "",
      phone: quoteTyped.client_phone ?? "",
      company: quoteTyped.client_company ?? "",
      address: quoteTyped.client_address ?? "",
      fiscalCode: quoteTyped.client_fiscal_code ?? "",
      vatNumber: quoteTyped.client_vat_number ?? "",
      contactId: quoteTyped.contact_id ?? null,
    },
  };
}
