import { useState, useCallback } from "react";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { PaymentType } from "@/components/orders/FinancialSummary";
import type { Installment } from "@/lib/orderUtils";
import type { BonusLine } from "@/lib/orders/bonusFiscali";

export interface OrderDraftData {
  customerId: string;
  orderCode: string;
  description: string;
  internalNotes: string;
  statusId: string;
  salespersonId: string;
  salespersonData: { commission_type: string; commission_value: number; compensation_mode?: string | null } | null;
  assignedTo: string;
  destinationWarehouseId: string | null;
  // v8.6.42 — sede operativa per analytics disaggregati
  sedeId?: string | null;
  // Dates as ISO strings
  expectedDate: string | null;
  warehouseArrivalDate: string | null;
  workStartDate: string | null;
  workEndDate: string | null;
  // Financial
  paymentType: PaymentType;
  totalAmount: string;
  vatRate: string;
  financingCost: string;
  // Installments (new dynamic system)
  installments: Installment[];
  // Items
  orderItems: OrderItem[];
  // Building bonus
  hasBuildingBonus: boolean;
  // Ripartizione su più agevolazioni (opt-in azienda)
  bonusLines?: BonusLine[];
  // Meta
  savedAt: string;
  /**
   * Formato della bozza. Le bozze senza versione sono quelle create dal
   * difetto corretto il 2026-09-03 (bastava APRIRE la pagina di modifica per
   * generarne una, che poi copriva il database per sempre): vanno buttate,
   * non recuperate, perché non contengono lavoro dell'utente.
   */
  version?: number;
}

export const DRAFT_VERSION = 2;

const DRAFT_KEY_PREFIX = "order-draft-";

function getDraftKey(companyId: string, orderId?: string) {
  return orderId
    ? `${DRAFT_KEY_PREFIX}${companyId}-${orderId}`
    : `${DRAFT_KEY_PREFIX}${companyId}`;
}

function dateToIso(d: Date | undefined): string | null {
  return d ? d.toISOString() : null;
}

function isoToDate(s: string | null | undefined): Date | undefined {
  return s ? new Date(s) : undefined;
}

export function useOrderDraft(companyId: string | undefined, orderId?: string) {
  const [draftRestored, setDraftRestored] = useState(false);

  /**
   * La bozza vale solo se contiene lavoro NON salvato: cioè se è più recente
   * dell'ultima modifica del record.
   *
   * Prima bastava aprire la pagina di modifica per creare una bozza (l'autosave
   * scattava sul primo render a dati caricati), e da lì in poi quella bozza
   * copriva il database per sempre: chi riapriva la commessa vedeva la
   * fotografia vecchia, e salvando ci riscriveva sopra dati già superati —
   * comprese le etichette delle rate, che tornavano generiche.
   *
   * `recordUpdatedAt` è l'`updated_at` del record: se il database è più nuovo
   * della bozza, la bozza è spazzatura e viene buttata.
   */
  const loadDraft = useCallback((recordUpdatedAt?: string | null): OrderDraftData | null => {
    if (!companyId) return null;
    try {
      const chiave = getDraftKey(companyId, orderId);
      const raw = localStorage.getItem(chiave);
      if (!raw) return null;
      const draft = JSON.parse(raw) as OrderDraftData;

      if ((draft.version ?? 1) < DRAFT_VERSION) {
        localStorage.removeItem(chiave);
        return null;
      }

      if (recordUpdatedAt && draft.savedAt) {
        const salvataBozza = new Date(draft.savedAt).getTime();
        const salvatoRecord = new Date(recordUpdatedAt).getTime();
        // Un secondo di tolleranza: subito dopo un salvataggio le due date
        // coincidono a meno di millisecondi, e non è una bozza da recuperare.
        if (Number.isFinite(salvataBozza) && Number.isFinite(salvatoRecord) && salvataBozza <= salvatoRecord + 1000) {
          localStorage.removeItem(chiave);
          return null;
        }
      }
      return draft;
    } catch {
      return null;
    }
  }, [companyId, orderId]);

  const saveDraft = useCallback((data: Omit<OrderDraftData, "savedAt">) => {
    if (!companyId) return;
    try {
      const toSave: OrderDraftData = { ...data, savedAt: new Date().toISOString(), version: DRAFT_VERSION };
      localStorage.setItem(getDraftKey(companyId, orderId), JSON.stringify(toSave));
    } catch {
      // localStorage full or unavailable
    }
  }, [companyId, orderId]);

  const clearDraft = useCallback(() => {
    if (!companyId) return;
    try { localStorage.removeItem(getDraftKey(companyId, orderId)); } catch { /* Safari Private Browsing */ }
    setDraftRestored(false);
  }, [companyId, orderId]);

  return {
    loadDraft,
    saveDraft,
    clearDraft,
    draftRestored,
    setDraftRestored,
    dateToIso,
    isoToDate,
  };
}
