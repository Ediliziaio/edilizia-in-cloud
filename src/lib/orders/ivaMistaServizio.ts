import {supabase} from "@/integrations/supabase/client";

/** Solo verifica di compatibilità: non esegue né applica migrazioni. */
export async function verificaSupportoIvaMista(): Promise<void> {
  const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, never>) => Promise<{data: unknown; error: unknown}>;
  const {data,error} = await rpc("contract_vat_split_capabilities", {});
  if (error || !data || typeof data !== "object" || !("version" in data) || data.version !== 1 || !("split_10_22" in data) || data.split_10_22 !== true) throw new Error("La ripartizione IVA è pronta nel modulo, ma il servizio deve essere aggiornato prima di salvare contratti con IVA mista. Nessun contratto è stato creato o modificato.");
}
