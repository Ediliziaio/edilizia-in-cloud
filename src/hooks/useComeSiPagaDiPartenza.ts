// src/hooks/useComeSiPagaDiPartenza.ts
import { useModelliPagamento } from "@/hooks/useModelliPagamento";
import type { ModelloPagamento } from "@/lib/orders/modelliPagamento";

/**
 * Il modello di pagamento con cui parte il modulo di nuova commessa: quello che l'azienda ha scelto
 * per le commesse nuove (la stella nelle Impostazioni), o nessuno. `pronto` dice che la lettura è
 * finita (anche se non ha trovato niente): il modulo si apre solo allora, perché lo stato iniziale
 * delle rate si decide una volta sola, alla prima apertura.
 */
export function useComeSiPagaDiPartenza(): { pronto: boolean; modello: ModelloPagamento | null } {
  const { offerti, predefinito, isLoading } = useModelliPagamento();
  const modello = predefinito ? offerti.find((m) => m.id === predefinito) ?? null : null;
  return { pronto: !isLoading, modello };
}
