import type { Tables } from "@/integrations/supabase/types";
import { dimenticaCommesseArchiviate } from "@/lib/orders/archivedOrderScope";
import { indiceSaldoFinale } from "@/lib/orders/saldoFinale";
import { supabase } from "@/integrations/supabase/client";
import type { OrderItem, Posizione } from "@/components/orders/OrderItemsList";
import type { PaymentType } from "@/components/orders/FinancialSummary";
import { calculateCollectedGrossFromInstallments, type InstallmentLike } from "@/lib/commissions";
import { agreedContractValue, variantiApprovateDatate } from "@/lib/orders/contractValue";

// ── Installment type ──────────────────────────────────────────────
export interface Installment {
  /** Importo esplicito del contratto: non ricalcolare un saldo non dichiarato. Solo stato del modulo. */
  amount_from_contract?: boolean;
  id?: string;
  position: number;
  label: string;
  type: 'deposit' | 'balance' | 'financing';
  amount: number;
  is_paid: boolean;
  paid_date?: string | null;
  expected_date?: string | null;
  /** Evento del cantiere che rende esigibile la rata (vedi lib/orders/rateEventi). */
  trigger_evento?: string | null;
  /** Solo per trigger_evento = 'stato_commessa': lo stato al cui arrivo la rata scade. */
  trigger_status_id?: string | null;
  /** Solo per trigger_evento = 'sal_numero': il numero progressivo del SAL. */
  trigger_numero?: number | null;
  /** Giorni di anticipo dell'avviso "non hai ancora incassato". */
  giorni_preavviso?: number | null;
  /**
   * Solo nel modulo di nuova commessa, mai salvata: la percentuale che il modello di pagamento
   * dà a questa rata. Se cambia il totale, l'importo la segue; un importo scritto a mano la toglie.
   */
  percent?: number | null;
  /**
   * Fattura della fatturazione interna che incassa questa rata (25/09/2026):
   * pagata l'una, pagata l'altra, lo tiene il database. `fattura` è letta
   * insieme alla rata, per mostrarla.
   */
  documento_fiscale_id?: string | null;
  fattura?: { id: string; numero: string | null; stato: string | null; importo_pagato?: number | string | null } | null;
}

/**
 * Precompila le date previste mancanti a passi di 30 giorni (30/60/90…)
 * nell'ordine delle rate. Tocca SOLO le rate senza data (quelle esistenti,
 * scelte a mano dall'utente, restano intatte). Date in YYYY-MM-DD LOCALE
 * (en-CA), mai toISOString (bug UTC serale).
 */
export function prefillExpectedDates(installments: Installment[]): Installment[] {
  let step = 0;
  return installments.map((inst) => {
    step += 1;
    if (inst.expected_date || inst.is_paid) return inst;
    const d = new Date();
    d.setDate(d.getDate() + 30 * step);
    return { ...inst, expected_date: d.toLocaleDateString('en-CA') };
  });
}

export function createDefaultInstallments(paymentType: PaymentType, numInstallments: number = 2): Installment[] {
  if (paymentType === 'financing') {
    const numDeposits = Math.max(0, numInstallments - 2);
    const installments: Installment[] = [];
    for (let i = 0; i < numDeposits; i++) {
      installments.push({
        position: i,
        // In finanziamento gli acconti sono versati per BONIFICO (a differenza
        // della quota finanziata): etichetta esplicita per non creare confusione.
        label: `${i + 1}° Acconto Bonifico`,
        type: 'deposit',
        amount: 0,
        is_paid: false,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Finanziamento',
      type: 'financing',
      amount: 0,
      is_paid: false,
    });
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: 0,
      is_paid: false,
    });
    return installments;
  }
  const installments: Installment[] = [];
  for (let i = 0; i < numInstallments - 1; i++) {
    installments.push({
      position: i,
      label: numInstallments <= 3 ? `Acconto ${i + 1}` : `Rata ${i + 1}`,
      type: 'deposit',
      amount: 0,
      is_paid: false,
    });
  }
  installments.push({
    position: numInstallments - 1,
    label: 'Saldo',
    type: 'balance',
    amount: 0,
    is_paid: false,
  });
  return installments;
}

export function buildInstallmentsFromLegacy(order: {
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
  deposit_paid_date?: string | null;
  deposit_expected_date?: string | null;
  deposit_2_amount?: number | null;
  deposit_2_paid?: boolean | null;
  deposit_2_paid_date?: string | null;
  deposit_2_expected_date?: string | null;
  balance_amount?: number | null;
  balance_paid?: boolean | null;
  balance_paid_date?: string | null;
  balance_expected_date?: string | null;
  financing_amount?: number | null;
  financing_paid?: boolean | null;
  financing_paid_date?: string | null;
  financing_expected_date?: string | null;
  payment_type?: string | null;
}): Installment[] {
  const installments: Installment[] = [];
  const paymentType = order.payment_type || 'standard';

  if (paymentType === 'standard') {
    if ((order.deposit_amount || 0) > 0) {
      installments.push({
        position: 0,
        label: 'Acconto 1',
        type: 'deposit',
        amount: order.deposit_amount || 0,
        is_paid: order.deposit_paid || false,
        paid_date: order.deposit_paid_date,
        expected_date: order.deposit_expected_date,
      });
    }
    if ((order.deposit_2_amount || 0) > 0) {
      installments.push({
        position: installments.length,
        label: 'Acconto 2',
        type: 'deposit',
        amount: order.deposit_2_amount || 0,
        is_paid: order.deposit_2_paid || false,
        paid_date: order.deposit_2_paid_date,
        expected_date: order.deposit_2_expected_date,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: order.balance_amount || 0,
      is_paid: order.balance_paid || false,
      paid_date: order.balance_paid_date,
      expected_date: order.balance_expected_date,
    });
  } else {
    if ((order.deposit_amount || 0) > 0) {
      installments.push({
        position: 0,
        label: '1° Acconto Bonifico',
        type: 'deposit',
        amount: order.deposit_amount || 0,
        is_paid: order.deposit_paid || false,
        paid_date: order.deposit_paid_date,
        expected_date: order.deposit_expected_date,
      });
    }
    installments.push({
      position: installments.length,
      label: 'Finanziamento',
      type: 'financing',
      amount: order.financing_amount || 0,
      is_paid: order.financing_paid || false,
      paid_date: order.financing_paid_date,
      expected_date: order.financing_expected_date,
    });
    installments.push({
      position: installments.length,
      label: 'Saldo',
      type: 'balance',
      amount: order.balance_amount || 0,
      is_paid: order.balance_paid || false,
      paid_date: order.balance_paid_date,
      expected_date: order.balance_expected_date,
    });
  }

  return installments;
}

/** Map installments array to legacy order columns for backward compatibility */
export function installmentsToLegacyColumns(installments: Installment[]) {
  const deposits = installments.filter(i => i.type === 'deposit').sort((a, b) => a.position - b.position);
  // Il saldo è l'ultima rata «balance»: le precedenti sono SAL intermedi (vedi saldoFinale.ts).
  const balance = installments[indiceSaldoFinale(installments)];
  const financing = installments.find(i => i.type === 'financing');

  return {
    deposit_amount: deposits[0]?.amount || 0,
    deposit_paid: deposits[0]?.is_paid || false,
    deposit_paid_date: deposits[0]?.paid_date || null,
    deposit_expected_date: deposits[0]?.expected_date || null,
    deposit_2_amount: deposits[1]?.amount || 0,
    deposit_2_paid: deposits[1]?.is_paid || false,
    deposit_2_paid_date: deposits[1]?.paid_date || null,
    deposit_2_expected_date: deposits[1]?.expected_date || null,
    balance_amount: balance?.amount || 0,
    balance_paid: balance?.is_paid || false,
    balance_paid_date: balance?.paid_date || null,
    balance_expected_date: balance?.expected_date || null,
    financing_amount: financing?.amount || 0,
    financing_paid: financing?.is_paid || false,
    financing_paid_date: financing?.paid_date || null,
    financing_expected_date: financing?.expected_date || null,
  };
}

// ── Existing types (unchanged) ────────────────────────────────────

export interface OrderWithDetails extends Partial<Pick<Tables<"orders">, "customer_id">> {
  id: string;
  order_code: string | null;
  description: string;
  total_amount: number;
  vat_rate?: number | null;
  deposit_amount: number;
  deposit_paid: boolean | null;
  deposit_2_amount: number | null;
  deposit_2_paid: boolean | null;
  balance_amount: number;
  balance_paid: boolean | null;
  expected_date: string | null;
  work_start_date?: string | null;
  work_end_date?: string | null;
  warehouse_arrival_date: string | null;
  indirizzo_lavori?: string | null;
  created_at: string;
  current_status_id: string | null;
  financing_amount?: number | null;
  financing_paid?: boolean | null;
  financing_paid_date?: string | null;
  financing_expected_date?: string | null;
  financing_cost?: number | null;
  payment_type?: string | null;
  /**
   * Rate vere del piano pagamenti (order_installments), quando la query le ha
   * caricate insieme alla commessa con un nested select. Sono la fonte di
   * verità di Incassato e Da Ricevere: gli importi sono LORDI (IVA inclusa) e
   * sommano al totale ivato. Le commesse più vecchie non le portano con sé: in
   * quel caso Incassato e Da Ricevere si ricavano dalle colonne-riassunto qui
   * sopra (sempre in lordo).
   */
  installments?: InstallmentLike[] | null;
  /**
   * Varianti della commessa, quando la query le ha caricate: contano nel totale come nella
   * scheda (agreedContractValue) e, con la data, nel saldo già pagato.
   */
  variazioni?: VarianteDellaCommessa[] | null;
  // ── Modulo Appaltatori ──────────────────────────────────────
  // Default a 'cliente' lato server (migration); manteniamo nullable
  // per safe-fall sui record letti prima del refresh delle types.
  order_type?: "cliente" | "appaltatore_lavoro" | null;
  customer: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  status: {
    name: string;
    color: string;
  } | null;
  order_items?: Array<{
    id: string;
    status: string | null;
    quantity: number | null;
  }> | null;
  order_employees?: Array<{
    employee?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
    } | null;
  }> | null;
  order_external_teams?: Array<{
    external_team?: {
      id: string;
      name: string | null;
    } | null;
  }> | null;
}

export interface OrderStatus {
  id: string;
  name: string;
  color: string;
  icon?: string;
  position?: number;
  is_default?: boolean;
  is_support_phase?: boolean;
}

export interface OrderCustomer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface OrderItemData {
  delivery_date?: Tables<"order_items">["delivery_date"];
  natura_riga?: "materiale" | "lavorazione" | "descrizione";
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  status: string;
  position: number;
  supplier_id: string | null;
  purchase_price: number | null;
  vat_rate: number | null;
  stock_item_id: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  payment_method: string | null;
  unit_price: number | null;
  discount_percent: number | null;
  standard_cost: number | null;
  article_template_id: string | null;
  product_code: string | null;
  categoria: string | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  deposit_paid_date: string | null;
  balance_amount: number | null;
  balance_paid: boolean | null;
  balance_paid_date: string | null;
  balance_expected_date: string | null;
  deposit_expected_date: string | null;
}

/** La distinta/abaco salvata sulla riga (colonna jsonb `posizioni`), se c'è. */
function distintaDellaRiga(item: OrderItemData): Posizione[] | null {
  const posizioni = (item as unknown as { posizioni?: unknown }).posizioni;
  return Array.isArray(posizioni) ? (posizioni as Posizione[]) : null;
}

export function mapDbItemToOrderItem(item: OrderItemData): OrderItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description || undefined,
    quantity: item.quantity,
    status: item.status as OrderItem['status'],
    position: item.position,
    supplier_id: item.supplier_id || undefined,
    purchase_price: item.purchase_price || undefined,
    vat_rate: item.vat_rate ?? undefined,
    stock_item_id: item.stock_item_id || undefined,
    // Aggancio listino: round-trip in modifica (baseline standard + link + categoria)
    standard_cost: item.standard_cost ?? undefined,
    article_template_id: item.article_template_id ?? undefined,
    product_code: item.product_code ?? undefined,
    categoria: item.categoria ?? undefined,
    // Arrivo previsto e distinta tornano nel modulo: chi salva li rimanda uguali.
    delivery_date: item.delivery_date || undefined,
    posizioni: distintaDellaRiga(item),
    is_paid: item.is_paid || false,
    paid_date: item.paid_date || undefined,
    payment_method: item.payment_method || undefined,
    deposit_amount: item.deposit_amount || 0,
    deposit_paid: item.deposit_paid || false,
    deposit_paid_date: item.deposit_paid_date || undefined,
    balance_amount: item.balance_amount || 0,
    balance_paid: item.balance_paid || false,
    balance_paid_date: item.balance_paid_date || undefined,
    balance_expected_date: item.balance_expected_date || undefined,
    deposit_expected_date: item.deposit_expected_date || undefined,
  };
}

export async function deleteOrderCascading(orderId: string, companyId: string): Promise<void> {
  // Nome mantenuto per i chiamanti esistenti: l'azione ora sposta nel cestino.
  // Controlli azienda, permesso e movimenti effettivi sono atomici lato database.
  // Rate previste e righe restano conservate per il ripristino.
  const { error } = await (supabase as any).rpc("set_order_trashed", {
    p_order_id: orderId,
    p_company_id: companyId,
    p_trashed: true,
  });
  if (error) throw error;
  dimenticaCommesseArchiviate(companyId);
}

/**
 * Il costo della finanziaria da togliere dalla base incassabile: conta solo
 * quando la commessa è a finanziamento, esattamente come nel modulo di
 * creazione, dove il saldo è "totale ivato − le altre rate − costo finanziaria".
 */
/** Le colonne di ordini_variazione che servono a totale e incassi (nested select «variazioni» delle liste). */
export interface VarianteDellaCommessa {
  status: string;
  impatto_economico: number | string | null;
  offline_signed_on?: string | null;
  firmato_il?: string | null;
  approval_recorded_at?: string | null;
  richiesto_il?: string | null;
  created_at?: string | null;
}

/** Contratto più varianti approvate, IVA esclusa: il valore pattuito della scheda commessa. */
export function contrattoPattuito(order: Pick<OrderWithDetails, "total_amount"> & { variazioni?: VarianteDellaCommessa[] | null }): number {
  return order.variazioni ? agreedContractValue(order.total_amount || 0, order.variazioni) : order.total_amount || 0;
}

function financingCostForOrder(order: OrderWithDetails): number {
  return order.payment_type === "financing" ? (Number(order.financing_cost) || 0) : 0;
}

/**
 * Le rate su cui si misurano Incassato e Da Ricevere. Se la query ha caricato
 * le rate vere (order_installments) si usano quelle; in loro assenza il piano
 * viene ricostruito dalle colonne-riassunto, per le commesse più vecchie. In
 * entrambi i casi gli importi sono LORDI (IVA inclusa): lo stabilisce il modulo
 * di creazione, che salva il saldo come "totale ivato − le altre rate". Proprio
 * per questo il saldo FINALE lo ricava per differenza, dentro
 * calculateCollectedGrossFromInstallments, invece di fidarsi dell'importo salvato.
 */
function rateDellaCommessa(order: OrderWithDetails): InstallmentLike[] {
  if (order.installments && order.installments.length > 0) return order.installments;
  return buildInstallmentsFromLegacy(order);
}

/**
 * Incassato della commessa, in IVATO (IVA inclusa) — sulla stessa base di
 * "Tot. Ivato" (getGrossOrderAmount). Somma le rate già incassate del piano
 * pagamenti con la regola usata anche nel dettaglio commessa e
 * nell'esposizione (calculateCollectedGrossFromInstallments): una rata con
 * fattura interna vale l'incassato della fattura, il saldo finale è il residuo
 * del totale ivato, e la quota finanziata conta come incassata (l'ha versata
 * la finanziaria). Un piano con più rate di saldo (SAL intermedi + saldo)
 * viene sommato per intero, senza perdere rate.
 */
export function getAmountCollected(order: OrderWithDetails): number {
  return calculateCollectedGrossFromInstallments({
    installments: rateDellaCommessa(order),
    totalAmount: contrattoPattuito(order),
    vatRate: order.vat_rate ?? 22,
    financingCost: financingCostForOrder(order),
    includeFinancing: true,
    varianti: order.variazioni ? variantiApprovateDatate(order.variazioni) : undefined,
  });
}

/**
 * Da Ricevere della commessa, in IVATO: totale ivato − costo finanziaria −
 * incassato. È la stessa base del dettaglio commessa, così Incassato + Da
 * Ricevere torna al Venduto (Tot. Ivato) quando il piano è saldato per intero.
 */
export function getAmountDue(order: OrderWithDetails): number {
  const incassabile = getGrossOrderAmount(order) - financingCostForOrder(order);
  // Arrotondato ai centesimi: toglie il rumore in virgola mobile del totale
  // ivato (es. 110000.000…1) così la somma su molte commesse resta pulita.
  return Math.max(0, Math.round((incassabile - getAmountCollected(order)) * 100) / 100);
}

export function getPendingPayments(order: OrderWithDetails): string[] {
  const pending: string[] = [];
  if (order.deposit_amount > 0 && !order.deposit_paid) pending.push("Acc. 1");
  if (order.deposit_2_amount && order.deposit_2_amount > 0 && !order.deposit_2_paid) pending.push("Acc. 2");
  if (order.balance_amount > 0 && !order.balance_paid) pending.push("Saldo");
  if (order.financing_amount && order.financing_amount > 0 && !order.financing_paid) pending.push("Finanz.");
  return pending;
}

export function getGrossOrderAmount(order: Pick<OrderWithDetails, "total_amount" | "vat_rate"> & { variazioni?: VarianteDellaCommessa[] | null }): number {
  // Contratto più varianti approvate, IVA inclusa, al centesimo come la scheda commessa.
  return Math.round(contrattoPattuito(order) * (1 + ((order.vat_rate ?? 22) / 100)) * 100) / 100;
}

export function getOrderMargin(totalAmount: number, variableCosts: number): {
  grossMargin: number;
  marginPercent: number;
  level: "good" | "low" | "negative";
} {
  const grossMargin = totalAmount - variableCosts;
  const marginPercent = totalAmount > 0 ? (grossMargin / totalAmount) * 100 : 0;
  return {
    grossMargin,
    marginPercent,
    level: grossMargin < 0 ? "negative" : marginPercent < 20 ? "low" : "good",
  };
}
