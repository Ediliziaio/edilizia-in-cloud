import type { AppRole, Company, MultiCompanyAccess } from "@/types/auth";

export const COMPANY_ACCESS_ROLE_LABELS: Partial<Record<AppRole, string>> = {
  company_admin: "Admin",
  company_staff: "Staff",
  salesperson: "Commerciale",
  call_center: "Call center",
  employee: "Operaio",
  subcontractor: "Subappaltatore",
};

const COMPANY_ACCESS_ROLES = new Set<AppRole>([
  "company_admin",
  "company_staff",
  "salesperson",
  "call_center",
  "employee",
  "subcontractor",
]);

// Ruoli con un'area/portale dedicato che NON devono mai essere risolti come
// ruolo di accesso aziendale, nemmeno se il profilo ha una company_id (che
// altrimenti genererebbe un finto accesso 'company_staff' via
// mergeProfileCompanyAccess, sloggandoli dal loro portale).
const PORTAL_ONLY_ROLES = new Set<AppRole>(["produttore_admin", "customer"]);

/**
 * Un accesso multi-azienda conta solo se attivo e non scaduto: lo stesso
 * criterio di user_can_access_company e delle policy (25/09/2026). Con un
 * accesso sospeso, un invito non accettato o uno scaduto l'azienda non si legge
 * più, e nel selettore comparirebbe una voce senza nome.
 */
export function accessoMultiAziendaValido(
  access: Pick<MultiCompanyAccess, "status" | "expires_at">,
  adesso: Date = new Date(),
): boolean {
  if (access.status != null && access.status !== "active") return false;
  if (!access.expires_at) return true;
  return new Date(access.expires_at).getTime() > adesso.getTime();
}

export function normalizeCompanyAccessRole(role: unknown): AppRole | null {
  return typeof role === "string" && COMPANY_ACCESS_ROLES.has(role as AppRole)
    ? (role as AppRole)
    : null;
}

export function resolveMultiCompanySelection({
  accesses,
  storedCompanyId,
  profileCompanyId,
}: {
  accesses: MultiCompanyAccess[];
  storedCompanyId: string | null | undefined;
  profileCompanyId: string | null | undefined;
}): { selectedId: string | null; selectedCompany: Company | null } {
  if (accesses.length === 0) {
    return { selectedId: null, selectedCompany: null };
  }

  const storedAccess = storedCompanyId
    ? accesses.find((access) => access.company_id === storedCompanyId)
    : undefined;
  const profileAccess = profileCompanyId
    ? accesses.find((access) => access.company_id === profileCompanyId)
    : undefined;
  const selectedAccess = storedAccess ?? profileAccess ?? accesses[0];

  return {
    selectedId: selectedAccess.company_id,
    selectedCompany: selectedAccess.company ?? null,
  };
}

export function mergeProfileCompanyAccess({
  accesses,
  profileCompany,
  userId,
  globalRole,
  createdAt,
}: {
  accesses: MultiCompanyAccess[];
  profileCompany: Company | null | undefined;
  userId: string;
  globalRole: AppRole | null;
  createdAt?: string | null;
}): MultiCompanyAccess[] {
  if (!profileCompany) return accesses;
  if (accesses.some((access) => access.company_id === profileCompany.id)) {
    return accesses;
  }

  return [
    {
      id: `profile-company-${profileCompany.id}`,
      user_id: userId,
      company_id: profileCompany.id,
      access_role: normalizeCompanyAccessRole(globalRole) ?? "company_staff",
      granted_by: null,
      created_at: createdAt ?? new Date(0).toISOString(),
      company: profileCompany,
    },
    ...accesses,
  ];
}

export function resolveSelectedAccessRole({
  globalRole,
  accesses,
  selectedCompanyId,
}: {
  globalRole: AppRole | null;
  accesses: MultiCompanyAccess[];
  selectedCompanyId: string | null | undefined;
}): AppRole | null {
  // Ruoli-portale dedicati (es. produttore_admin): NON passano dal flusso
  // multi-azienda. Anche se hanno un profile.company_id — che genera un finto
  // accesso 'company_staff' via mergeProfileCompanyAccess — il loro ruolo di
  // accesso di rotta resta il ruolo globale, altrimenti ProtectedRoute li
  // sloggerebbe dal loro portale verso l'area azienda.
  if (PORTAL_ONLY_ROLES.has(globalRole as AppRole)) {
    return globalRole;
  }

  const selectedAccess = selectedCompanyId
    ? accesses.find((access) => access.company_id === selectedCompanyId)
    : undefined;

  if (selectedAccess) {
    return normalizeCompanyAccessRole(selectedAccess.access_role);
  }

  if (globalRole === "multi_company_user") {
    return null;
  }

  return globalRole;
}

export function resolveRouteAccessRole({
  globalRole,
  accesses,
  selectedCompanyId,
}: {
  globalRole: AppRole | null;
  accesses: MultiCompanyAccess[];
  selectedCompanyId: string | null | undefined;
}): AppRole | null {
  return resolveSelectedAccessRole({ globalRole, accesses, selectedCompanyId }) ?? globalRole;
}

export function getCompanyAccessRoleLabel(role: string | null | undefined): string {
  const normalized = normalizeCompanyAccessRole(role);
  return normalized ? COMPANY_ACCESS_ROLE_LABELS[normalized] ?? normalized : "Accesso";
}
