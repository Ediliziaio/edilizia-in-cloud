/**
 * cgRpc — wrapper tipato per le RPC custom del Controllo di Gestione.
 *
 * Le RPC `cg_*` sono definite in migration ma NON sono nel `types.ts`
 * generato da Supabase (typed-rpc-gen è opt-in). Senza wrapper, ogni
 * chiamata richiede `(supabase.rpc as any)("cg_xxx", ...)` — 36+ occorrenze
 * sparse nei 12 hook del modulo.
 *
 * Questo helper centralizza l'unico cast `as any` necessario e tipa
 * input/output. Vantaggi:
 *  - Una sola riga `as any` (qui), invece di 36 nei chiamanti
 *  - Type safety sui parametri (nome RPC + args)
 *  - Refactor sicuro: rinomina una RPC → errore TS subito
 *  - Allow-list esplicita: solo le RPC dichiarate in `CG_RPC_NAMES` sono
 *    chiamabili, evita typo silenziosi
 *
 * Quando S2-01 (regen types.ts via supabase gen) sarà completo, questo
 * file diventa thin layer e si può rimuovere il cast.
 */
import { supabase } from "@/integrations/supabase/client";

/** Allow-list delle RPC `cg_*` chiamate dai 12 hook del modulo. */
export const CG_RPC_NAMES = [
  "cg_get_aging_safe",
  "cg_get_bep_safe",
  "cg_get_budget_consuntivo_forecast_safe",
  "cg_get_cash_flow_prospettico_safe",
  "cg_get_ce_mensile",
  "cg_get_ce_mensile_dettaglio",
  "cg_get_ce_safe",
  "cg_get_dettaglio_voce_mese_safe",
  "cg_get_health_check_safe",
  "cg_get_imposte_dettaglio_safe",
  "cg_get_indici_avanzati_safe",
  "cg_get_marginalita_commesse_safe",
  "cg_get_pfn_safe",
  "cg_get_rating_safe",
  "cg_get_riconciliazione_safe",
  "cg_get_sp_safe",
  "cg_simula_piano_safe",
  "cg_simulazione_what_if",
] as const;

export type CgRpcName = (typeof CG_RPC_NAMES)[number];

/**
 * Invoca una RPC `cg_*` con type-safety sul nome.
 *
 * @param name  Nome RPC (deve essere in CG_RPC_NAMES)
 * @param args  Argomenti della RPC (Record<string, unknown>)
 * @returns     Promise di { data: T | null, error: PostgrestError | null }
 *
 * @example
 *   const { data, error } = await cgRpc<CeRow[]>("cg_get_ce_safe", {
 *     p_anno: 2026, p_mese_da: 1, p_mese_a: 12,
 *   });
 */
export async function cgRpc<TData = unknown>(
  name: CgRpcName,
  args: Record<string, unknown> = {},
): Promise<{ data: TData | null; error: { message: string } | null }> {
  // L'unico `as any` del modulo CG client-side: Supabase types.ts non
  // ha i tipi delle custom RPC fino al prossimo gen types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args);
  return { data: data as TData | null, error };
}
