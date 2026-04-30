/* eslint-disable @typescript-eslint/no-explicit-any */

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getErrorStatus(error: unknown): number {
  return error instanceof HttpError ? error.status : 500;
}

export async function assertMetaCompanyAdminAccess(
  adminClient: any,
  userId: string,
  companyId: string,
): Promise<void> {
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
    await Promise.all([
      adminClient.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
      adminClient.from("user_roles").select("role").eq("user_id", userId),
    ]);

  if (profileError) {
    throw new HttpError(403, "profile_not_found", "Profilo utente non verificabile");
  }
  if (rolesError) {
    throw new HttpError(403, "roles_not_found", "Ruoli utente non verificabili");
  }

  const roleNames = new Set((roles || []).map((role: { role: string }) => role.role));
  if (roleNames.has("super_admin")) return;

  if (!roleNames.has("company_admin") || profile?.company_id !== companyId) {
    throw new HttpError(
      403,
      "forbidden_company",
      "Non hai i permessi per gestire questa integrazione Meta",
    );
  }
}

type CompanyAccessOptions = {
  requiredPermission?: string;
};

export async function assertCompanyMemberAccess(
  adminClient: any,
  userId: string,
  companyId: string,
  options: CompanyAccessOptions = {},
): Promise<void> {
  const [
    { data: profile, error: profileError },
    { data: roles, error: rolesError },
    { data: permissions, error: permissionsError },
  ] = await Promise.all([
    adminClient.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    adminClient.from("user_roles").select("role").eq("user_id", userId),
    adminClient
      .from("staff_permissions")
      .select(options.requiredPermission || "user_id")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  if (profileError || rolesError || permissionsError) {
    throw new HttpError(403, "access_not_verifiable", "Permessi utente non verificabili");
  }

  const roleNames = new Set((roles || []).map((role: { role: string }) => role.role));
  if (roleNames.has("super_admin")) return;

  const isCompanyUser =
    profile?.company_id === companyId &&
    ["company_admin", "company_staff", "salesperson", "call_center"].some((role) => roleNames.has(role));
  if (!isCompanyUser) {
    throw new HttpError(403, "forbidden_company", "Non hai accesso a questa azienda");
  }

  if (roleNames.has("company_admin") || !options.requiredPermission) return;

  if (!permissions?.[options.requiredPermission]) {
    throw new HttpError(403, "missing_permission", "Permesso insufficiente per questa azione");
  }
}

export async function assertOwnedMetaIntegration(
  adminClient: any,
  integrationId: string,
  companyId: string,
): Promise<Record<string, unknown>> {
  const { data: integration, error } = await adminClient
    .from("integrations")
    .select("id, company_id, provider, status")
    .eq("id", integrationId)
    .eq("company_id", companyId)
    .eq("provider", "meta")
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "integration_lookup_failed", error.message);
  }
  if (!integration) {
    throw new HttpError(404, "integration_not_found", "Integrazione Meta non trovata");
  }

  return integration;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
