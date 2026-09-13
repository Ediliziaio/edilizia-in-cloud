import { create } from "zustand";

/**
 * Stato globale del gate "carta obbligatoria / crediti esauriti".
 *
 * Lo apre il fetch del client Supabase (vedi lib/creditoEsaurito.ts) quando
 * uno strumento a costo risponde che manca la carta (402, code
 * "payment_method_required") o che il credito e' finito — in qualunque forma
 * il server lo dica. Accessibile fuori da React via getState().
 *
 * `kind` distingue i due casi: "payment" (carta/abbonamento mancante) e
 * "credits" (saldo crediti esaurito). Prima il dialog mostrava "Abbonamento
 * non attivo" anche a chi aveva solo finito i crediti — messaggio fuorviante.
 */
export type PaymentGateKind = "payment" | "credits";

/** Quale borsellino si e' svuotato: serve a scegliere cosa ricaricare. */
export type PortafoglioEsaurito = "ai" | "email" | "whatsapp" | "render" | "sms";

/** Quel poco che la risposta del server dice sul credito finito. */
export interface DettaglioCreditoEsaurito {
  portafoglio?: PortafoglioEsaurito;
  /** Frase del server, gia' in italiano quando c'e'. */
  messaggio?: string;
  /** Saldo residuo in euro, se la risposta lo riporta. */
  saldoEur?: number;
}

interface PaymentGateState {
  open: boolean;
  kind: PaymentGateKind;
  dettaglio: DettaglioCreditoEsaurito | null;
  /** Quando e' stato aperto l'ultima volta (Date.now()): serve a chi gestisce gli errori per non coprirlo con un toast. */
  apertoAt: number;
  show: (kind?: PaymentGateKind, dettaglio?: DettaglioCreditoEsaurito | null) => void;
  hide: () => void;
}

export const usePaymentGateStore = create<PaymentGateState>((set) => ({
  open: false,
  kind: "payment",
  dettaglio: null,
  apertoAt: 0,
  show: (kind = "payment", dettaglio = null) => set({ open: true, kind, dettaglio, apertoAt: Date.now() }),
  hide: () => set({ open: false }),
}));
