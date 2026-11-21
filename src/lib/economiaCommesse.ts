/**
 * L'economia (margine, costi, preventivo) di commesse PRECISE, per id.
 *
 * `v_ordine_marginalita` ricalcola tutte le commesse dell'azienda a ogni
 * lettura, anche con `.in("id", …)`: 3 s per Demo Azienda 2, e il Cruscotto
 * che la leggeva più volte insieme andava oltre gli 8 s del database
 * (14/11/2026). `economia_commesse(p_ids)` fa lo stesso conto, con gli stessi
 * diritti, sulle sole commesse chieste: stesse colonne della vista.
 */
import { supabase } from "@/integrations/supabase/client";

const BLOCCO = 100;

export const COLONNE_MARGINI_COMMESSE = "id, preventivo_totale, consuntivo, margine, margine_perc";

export async function leggiEconomiaCommesse<T = Record<string, unknown>>(
  ids: ReadonlyArray<string>,
  { signal, companyId, colonne }: { signal?: AbortSignal; companyId?: string; colonne?: string } = {},
): Promise<T[]> {
  const unici = [...new Set(ids.filter(Boolean))];
  const righe: T[] = [];
  for (let i = 0; i < unici.length; i += BLOCCO) {
    signal?.throwIfAborted();
    let richiesta = supabase.rpc("economia_commesse", { p_ids: unici.slice(i, i + BLOCCO) });
    // Il tipo generato non descrive le colonne della vista privata restituita dalla RPC.
    if (companyId) richiesta = richiesta.filter("company_id", "eq", companyId);
    if (signal) richiesta = richiesta.abortSignal(signal);
    const { data, error } = await (colonne ? richiesta.select(colonne) : richiesta);
    signal?.throwIfAborted();
    if (error) throw error;
    righe.push(...((data ?? []) as T[]));
  }
  return righe;
}
