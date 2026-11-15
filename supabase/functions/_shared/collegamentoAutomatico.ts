/**
 * L'interruttore del collegamento automatico dell'azienda, letto dal server.
 * Spento di base, e spento se la lettura fallisce: nel dubbio si propone, non si collega.
 * Regola e interfaccia: docs/automazioni-acquisti.md §3; uso con `conInterruttore`
 * (shared/acquisti/riconciliazione.ts). Chi scrive con `acquisti_collegamento_registra`
 * non serve che lo legga: lo applica il database.
 */
// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

export async function leggiCollegamentoAutomatico(db: Db, companyId: string): Promise<boolean> {
  if (!companyId) return false;
  try {
    const { data, error } = await db.rpc("azienda_collegamento_automatico", { p_company: companyId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}
