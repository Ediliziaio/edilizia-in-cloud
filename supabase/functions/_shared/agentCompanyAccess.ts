import { requireCompanyAccess, requireRole } from "./auth.ts";
import { PLATFORM_ADMIN_COMPANY_ID } from "./platformAutomation.ts";

/** The selected tenant is a request, not an authorization grant. */
export async function agentCompanyAccess(db: any, userId: string, requested: unknown, headers: Record<string, string>) {
  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] = await Promise.all([
    db.from("profiles").select("company_id,is_blocked").eq("id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };
  if (profileError || roleError || !profile) throw new Response(JSON.stringify({ error: "Impossibile verificare l'accesso all'azienda" }), { status: 403, headers: jsonHeaders });
  if (profile?.is_blocked) throw new Response(JSON.stringify({ error: "Utente bloccato" }), { status: 403, headers: jsonHeaders });
  const superAdmin = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
  if (superAdmin) await requireRole(db, userId, ["super_admin"], headers);
  const companyId = requested ?? (superAdmin ? PLATFORM_ADMIN_COMPANY_ID : profile?.company_id);
  if (typeof companyId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    throw new Response(JSON.stringify({ error: "Azienda non valida o non associata" }), { status: 403, headers: jsonHeaders });
  }
  return requireCompanyAccess(db, userId, companyId, headers);
}
