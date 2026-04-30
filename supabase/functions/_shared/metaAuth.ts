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

async function getRoleNames(adminClient: any, userId: string): Promise<Set<string>> {
  const { data: roles, error } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new HttpError(403, "roles_not_found", "Ruoli utente non verificabili");
  }

  return new Set((roles || []).map((role: { role: string }) => role.role));
}

export async function assertMetaCompanyAdminAccess(
  adminClient: any,
  userId: string,
  companyId: string,
): Promise<void> {
  const [{ data: profile, error: profileError }, roleNames] = await Promise.all([
    adminClient.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    getRoleNames(adminClient, userId),
  ]);

  if (profileError) {
    throw new HttpError(403, "profile_not_found", "Profilo utente non verificabile");
  }
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
  const [{ data: profile, error: profileError }, roleNames] = await Promise.all([
    adminClient.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    getRoleNames(adminClient, userId),
  ]);

  if (profileError) {
    throw new HttpError(403, "access_not_verifiable", "Permessi utente non verificabili");
  }
  if (roleNames.has("super_admin")) return;

  const isCompanyUser =
    profile?.company_id === companyId &&
    ["company_admin", "company_staff", "salesperson", "call_center"].some((role) =>
      roleNames.has(role),
    );
  if (!isCompanyUser) {
    throw new HttpError(403, "forbidden_company", "Non hai accesso a questa azienda");
  }

  if (roleNames.has("company_admin") || !options.requiredPermission) return;

  const { data: permissions, error: permissionsError } = await adminClient
    .from("staff_permissions")
    .select(options.requiredPermission)
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (permissionsError) {
    throw new HttpError(403, "access_not_verifiable", "Permessi utente non verificabili");
  }
  if (!permissions?.[options.requiredPermission]) {
    throw new HttpError(403, "missing_permission", "Permesso insufficiente per questa azione");
  }
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
