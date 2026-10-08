import { verifiedActionActorRoles } from "./silvioActionPermission.ts";

// A service client must not turn a WhatsApp role label into unrestricted access.
// Row-scoped staff still use the app until its assignment rules are supported here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireQuoteModelAccess(db: any, companyId: string, userId: string): Promise<void> {
  const { data, error } = await db.rpc("silvio_context_actor_roles", { p_company_id: companyId, p_user_id: userId });
  const roles = verifiedActionActorRoles(data, error, ["super_admin", "company_admin", "company_staff", "salesperson"]);
  if (roles.some(role => ["super_admin", "company_admin", "salesperson"].includes(role))) return;
  const { data: permissions, error: permissionError } = await db.from("staff_permissions")
    .select("can_view_preventivi, only_assigned, only_my_warehouse")
    .eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (permissionError || permissions?.can_view_preventivi !== true ||
      permissions.only_assigned !== false || permissions.only_my_warehouse !== false) {
    throw new Error("Permessi insufficienti o accesso limitato: verifica il preventivo nell’app.");
  }
}
