import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";

/** Evita che una vecchia RPC ignori la modalità mentre crea la commessa.
 * Colonna e RPC vengono distribuite insieme nella patch atomica CHECK-71. */
export async function verificaSupportoModalitaFinanziaria(): Promise<void> {
  const { error } = await withClientTimeout(
    supabase.from("orders").select("financing_cost_mode").limit(0),
    "Verifica gestione costo finanziaria", 12000,
  );
  if (error) throw new Error("Non è stato possibile verificare la gestione del costo della finanziaria. La commessa non è stata salvata. Riprova; se il problema persiste, contatta l’assistenza.");
}
