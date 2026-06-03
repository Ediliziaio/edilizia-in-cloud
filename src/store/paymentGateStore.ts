import { create } from "zustand";

/**
 * Stato globale del gate "carta obbligatoria". Viene aperto dall'handler
 * globale delle mutation (App.tsx) quando un tool a costo risponde HTTP 402
 * (code "payment_method_required"). Accessibile fuori da React via getState().
 */
interface PaymentGateState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const usePaymentGateStore = create<PaymentGateState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
