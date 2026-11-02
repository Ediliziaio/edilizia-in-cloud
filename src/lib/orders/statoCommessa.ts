import { faseConclusiva } from "@/lib/cruscottoMetrics";
import type { OrderStatus } from "@/lib/orderUtils";

export interface AvanzamentoLavorazioni { total: number; done: number; inCorso: number; avgPct: number | null }

/**
 * Con tutte le lavorazioni finite propone lo stato che chiude la commessa. Solo una
 * proposta: lo stato lo cambia una persona, perché può far partire un avviso al cliente.
 * Niente proposta da uno stato di assistenza: lì la commessa è già oltre.
 */
export function statoProposto(statuses: OrderStatus[], attuale: string | null, lavori?: AvanzamentoLavorazioni): OrderStatus | null {
  if (!lavori || lavori.total < 1 || lavori.done !== lavori.total) return null;
  const finale = faseConclusiva(statuses.map((s) => ({ ...s, position: s.position ?? 0 })));
  if (!finale || finale.id === attuale) return null;
  if (statuses.find((s) => s.id === attuale)?.is_support_phase) return null;
  return statuses.find((s) => s.id === finale.id) ?? null;
}

/** Cambiare stato avvisa il cliente solo se c'è un cliente collegato e l'azienda non l'ha spento. */
export const avvisoAlCliente = (customerId: string | null | undefined, attivoInAzienda: boolean | null | undefined) =>
  !!customerId && attivoInAzienda !== false;
