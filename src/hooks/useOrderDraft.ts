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
}

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

  const loadDraft = useCallback((): OrderDraftData | null => {
    if (!companyId) return null;
    try {
      const raw = localStorage.getItem(getDraftKey(companyId, orderId));
      if (!raw) return null;
      return JSON.parse(raw) as OrderDraftData;
    } catch {
      return null;
    }
  }, [companyId, orderId]);

  const saveDraft = useCallback((data: Omit<OrderDraftData, "savedAt">) => {
    if (!companyId) return;
    try {
      const toSave: OrderDraftData = { ...data, savedAt: new Date().toISOString() };
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
