import { useEffect, useRef, useState, useCallback } from "react";
import type { OrderItem } from "@/components/orders/OrderItemsList";
import type { PaymentType } from "@/components/orders/FinancialSummary";

export interface OrderDraftData {
  customerId: string;
  orderCode: string;
  description: string;
  internalNotes: string;
  statusId: string;
  salespersonId: string;
  salespersonData: { commission_type: string; commission_value: number } | null;
  // Dates as ISO strings
  expectedDate: string | null;
  warehouseArrivalDate: string | null;
  workStartDate: string | null;
  workEndDate: string | null;
  // Financial
  paymentType: PaymentType;
  totalAmount: string;
  depositAmount: string;
  deposit2Amount: string;
  financingAmount: string;
  vatRate: string;
  // Payment status
  depositPaid: boolean;
  depositPaidDate: string | null;
  depositExpectedDate: string | null;
  deposit2Paid: boolean;
  deposit2PaidDate: string | null;
  deposit2ExpectedDate: string | null;
  balancePaid: boolean;
  balancePaidDate: string | null;
  balanceExpectedDate: string | null;
  // Items
  orderItems: OrderItem[];
  // Meta
  savedAt: string;
}

const DRAFT_KEY_PREFIX = "order-draft-";

function getDraftKey(companyId: string) {
  return `${DRAFT_KEY_PREFIX}${companyId}`;
}

function dateToIso(d: Date | undefined): string | null {
  return d ? d.toISOString() : null;
}

function isoToDate(s: string | null): Date | undefined {
  return s ? new Date(s) : undefined;
}

export function useOrderDraft(companyId: string | undefined) {
  const [draftRestored, setDraftRestored] = useState(false);
  const savingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDraft = useCallback((): OrderDraftData | null => {
    if (!companyId) return null;
    try {
      const raw = localStorage.getItem(getDraftKey(companyId));
      if (!raw) return null;
      return JSON.parse(raw) as OrderDraftData;
    } catch {
      return null;
    }
  }, [companyId]);

  const saveDraft = useCallback((data: Omit<OrderDraftData, "savedAt">) => {
    if (!companyId) return;
    if (savingRef.current) clearTimeout(savingRef.current);
    savingRef.current = setTimeout(() => {
      try {
        const toSave: OrderDraftData = { ...data, savedAt: new Date().toISOString() };
        localStorage.setItem(getDraftKey(companyId), JSON.stringify(toSave));
      } catch {
        // localStorage full or unavailable
      }
    }, 500);
  }, [companyId]);

  const clearDraft = useCallback(() => {
    if (!companyId) return;
    if (savingRef.current) clearTimeout(savingRef.current);
    localStorage.removeItem(getDraftKey(companyId));
    setDraftRestored(false);
  }, [companyId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (savingRef.current) clearTimeout(savingRef.current);
    };
  }, []);

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
