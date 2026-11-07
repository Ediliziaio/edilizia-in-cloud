/**
 * Chi può cambiare le condizioni su UN documento (07/11/2026), controllato anche nel server.
 *
 * Nell'app lo decide `puoRiscrivereLeCondizioni` (src/lib/preventivi/condizioniDelPreventivo.ts): titolare e
 * amministratori sempre, gli altri col permesso «Riscrivere le condizioni su un documento» o con Listino & Prezzi.
 * Qui la stessa regola, letta dal database: chi chiama la funzione direttamente non passa dall'interfaccia.
 */
// deno-lint-ignore no-explicit-any
export async function puoRiscrivereCondizioniNelServer(db: any, companyId: string, userId: string): Promise<boolean> {
  try {
    const { data: ruoli } = await db.rpc("silvio_context_actor_roles", { p_company_id: companyId, p_user_id: userId });
    if (Array.isArray(ruoli) && ruoli.some((r) => r === "super_admin" || r === "company_admin")) return true;
    const { data: permessi } = await db.from("staff_permissions")
      .select("can_riscrivere_condizioni, can_edit_settings_pricing")
      .eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    return permessi?.can_riscrivere_condizioni === true || permessi?.can_edit_settings_pricing === true;
  } catch {
    // Nel dubbio no: chi non può resta sulle condizioni dell'azienda, che sono comunque giuste.
    return false;
  }
}
