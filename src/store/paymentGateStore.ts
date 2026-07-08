import { create } from "zustand";

/**
 * Stato globale del gate "carta obbligatoria". Viene aperto dall'handler
 * globale delle mutation (App.tsx) quando un tool a costo risponde HTTP 402
 * (code "payment_method_required"). Accessibile fuori da React via getState().
 *
 * `kind` distingue i due 402 possibili: "payment" (carta/abbonamento mancante)
 * e "credits" (saldo crediti esaurito, body { error: "insufficient_credits" }).
 * Prima il dialog mostrava "Abbonamento non attivo" anche a chi aveva solo
 * finito i crediti — messaggio fuorviante.
 */
export type PaymentGateKind = "payment" | "credits";

interface PaymentGateState {
  open: boolean;
  kind: PaymentGateKind;
  show: (kind?: PaymentGateKind) => void;
  hide: () => void;
}

export const usePaymentGateStore = create<PaymentGateState>((set) => ({
  open: false,
  kind: "payment",
  show: (kind = "payment") => set({ open: true, kind }),
  hide: () => set({ open: false }),
}));
