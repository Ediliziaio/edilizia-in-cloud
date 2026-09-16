/**
 * Chi può gestire i calendari di un'azienda da una edge function (che usa la
 * service key, quindi la RLS non protegge): la stessa regola delle policy
 * della migrazione calendari_gestiti_dallo_staff.
 *   - calendari marketing → can_edit_settings_customization
 *   - squadre e calendari lavori → can_edit_settings_orders
 * has_permission_for_company vale già per super_admin, company_admin
 * dell'azienda e admin multi-azienda.
 */
// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args: Record<string, unknown>) => any };

export async function puoGestireCalendari(admin: Admin, userId: string, companyId: string): Promise<boolean> {
  for (const permesso of ["can_edit_settings_customization", "can_edit_settings_orders"]) {
    const { data, error } = await admin.rpc("has_permission_for_company", {
      _user_id: userId,
      _permission: permesso,
      _company_id: companyId,
    });
    if (!error && data === true) return true;
  }
  return false;
}
