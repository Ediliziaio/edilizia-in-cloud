// src/lib/orders/avviaCommessa.ts
/**
 * Le due cose che una strada che crea commesse fa DOPO averla creata (07/10/2026):
 * dare alla commessa vuota le fasi e le rate di partenza che l'azienda ha scelto
 * (`commessa_avvia`), e, dalla ristrutturazione, una fase per capitolo (con il venduto).
 * Mai bloccano: la commessa esiste già, e un'azienda che non ha scelto niente non vede
 * nessuna differenza.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FaseDaCapitolo } from "@/lib/orders/fasiDaCapitoli";

export interface EsitoAvvio {
  fasi: number;
  rate: number;
}

/** Applica alla commessa appena nata i modelli di partenza dell'azienda; `null` se non si può (non è un errore). */
export async function avviaCommessa(orderId: string): Promise<EsitoAvvio | null> {
  try {
    const { data, error } = await supabase.rpc("commessa_avvia" as never, { p_order_id: orderId } as never);
    if (error) return null;
    const r = data as { fasi?: number; rate?: number } | null;
    return { fasi: Number(r?.fasi) || 0, rate: Number(r?.rate) || 0 };
  } catch {
    return null;
  }
}

type RispostaRpc = Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

/**
 * Una fase per capitolo, col venduto. Il venduto lo scrive solo chi vede gli importi di
 * vendita: se manca il permesso (42501) si riprova senza, e le fasi nascono lo stesso.
 * Restituisce quante fasi sono nate (0 se non si è potuto).
 */
export async function aggiungiFasiDaCapitoli(orderId: string, fasi: ReadonlyArray<FaseDaCapitolo>): Promise<number> {
  if (fasi.length === 0) return 0;
  const chiama = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => RispostaRpc;
  try {
    const conVenduto = await chiama("aggiungi_fasi_commessa", {
      p_order_id: orderId,
      p_fasi: fasi.map((f) => ({ nome: f.nome, venduto: f.venduto })),
    });
    if (!conVenduto.error) return Number(conVenduto.data) || 0;
    if (conVenduto.error.code !== "42501") return 0;
    const senza = await chiama("aggiungi_fasi_commessa", {
      p_order_id: orderId,
      p_fasi: fasi.map((f) => ({ nome: f.nome })),
    });
    return senza.error ? 0 : Number(senza.data) || 0;
  } catch {
    return 0;
  }
}
