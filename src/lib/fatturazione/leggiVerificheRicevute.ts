import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";

/** Tutte le scelte manuali: oltre mille righe la risposta REST va paginata. */
export async function leggiVerificheRicevute(
  companyId: string,
): Promise<Record<string, string>> {
  const verifiche: Record<string, string> = {};
  for (let da = 0; ; da += 1000) {
    const { data, error } = await db
      .from("fatture_ricevute")
      .select("id,verifica_manuale")
      .eq("company_id", companyId)
      .not("verifica_manuale", "is", null)
      .order("id")
      .range(da, da + 999);
    if (error) throw error;
    const righe = (data ?? []) as Array<{
      id: string;
      verifica_manuale: string;
    }>;
    for (const r of righe) verifiche[r.id] = r.verifica_manuale;
    if (righe.length < 1000) return verifiche;
  }
}
