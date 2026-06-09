import type { AppRole } from "@/types/auth";

export const COMPANY_APP_HOME = "/azienda/attivita";

const PLATFORM_HOME = "/admin";

const ROLE_HOME_PATHS: Record<AppRole, string> = {
  super_admin: PLATFORM_HOME,
  company_admin: COMPANY_APP_HOME,
  company_staff: COMPANY_APP_HOME,
  call_center: COMPANY_APP_HOME,
  multi_company_user: COMPANY_APP_HOME,
  produttore_admin: "/produttore",
  customer: "/cliente",
  employee: "/campo",
  subcontractor: "/campo",
  salesperson: "/venditore",
  referrer: "/partner",
  accountant: "/commercialista",
  platform_manager: PLATFORM_HOME,
  platform_sales: PLATFORM_HOME,
  platform_support: PLATFORM_HOME,
  platform_marketing: PLATFORM_HOME,
  platform_implementation: PLATFORM_HOME,
};

export function getRoleHomePath(role: AppRole | null | undefined): string {
  return role ? ROLE_HOME_PATHS[role] ?? "/login" : "/login";
}
