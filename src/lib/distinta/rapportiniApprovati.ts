import { supabase } from "@/integrations/supabase/client";
import type { RapportinoConMateriali } from "./consumiMateriali";

// campo_rapportini si legge col client senza tipi, come gli altri lettori dei costi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const PAGINA = 1000;

/** I materiali dei rapportini approvati della commessa. PostgREST restituisce al massimo mille righe: si legge a pagine. */
export async function leggiRapportiniApprovati(companyId: string, orderId: string): Promise<RapportinoConMateriali[]> {
  const rapportini: RapportinoConMateriali[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await db
      .from("campo_rapportini")
      .select("id, stato, materiali_usati")
      .eq("company_id", companyId)
      .eq("order_id", orderId)
      .eq("stato", "approvato")
      .order("id")
      .range(da, da + PAGINA - 1);
    if (error) throw error;
    rapportini.push(...((data ?? []) as RapportinoConMateriali[]));
    if (!data || data.length < PAGINA) break;
  }
  return rapportini;
}

