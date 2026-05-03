import type { Permissions } from "@/hooks/usePermissions";

const EXECUTIVE_DASHBOARD_PATH = "/azienda/cruscotto/aziendale";
const MANAGEMENT_DASHBOARD_PATH = "/azienda";
const MARKETING_DASHBOARD_PATH = "/azienda/marketing";
const DASHBOARD_HUB_PATH = "/azienda/cruscotto/gestisci";

type DashboardRoutingPermissions = Pick<
  Permissions,
  | "canViewCruscotto"
  | "canViewDashboard"
  | "canViewMarketing"
  | "canViewMarketingDashboard"
  | "canViewMarketingContacts"
  | "canViewMarketingOpportunities"
  | "canViewMarketingAppointments"
  | "canViewSalesOs"
  | "canViewOrders"
  | "canViewWarehouse"
  | "canViewCalendar"
  | "canViewCustomers"
  | "canViewCosts"
  | "canViewPrevisionale"
  | "canViewTesoreria"
  | "canViewEmployees"
  | "canViewTickets"
  | "canViewGiornaleLavori"
  | "canViewSubappaltatori"
  | "isAdmin"
  | "visibleAreas"
>;

function textMatches(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function getSmartCruscottoPath(
  permissions: DashboardRoutingPermissions,
  role?: string | null,
) {
  const normalizedRole = (role ?? "").toLowerCase();
  const normalizedAreas = permissions.visibleAreas.join(" ").toLowerCase();
  const profileText = `${normalizedRole} ${normalizedAreas}`;

  const hasMarketingAccess =
    permissions.canViewMarketingDashboard ||
    permissions.canViewMarketing ||
    permissions.canViewMarketingContacts ||
    permissions.canViewMarketingOpportunities ||
    permissions.canViewMarketingAppointments ||
    permissions.canViewSalesOs;

  const hasOperationsAccess =
    permissions.canViewDashboard ||
    permissions.canViewOrders ||
    permissions.canViewWarehouse ||
    permissions.canViewCalendar ||
    permissions.canViewCustomers ||
    permissions.canViewCosts ||
    permissions.canViewPrevisionale ||
    permissions.canViewTesoreria ||
    permissions.canViewEmployees ||
    permissions.canViewTickets ||
    permissions.canViewGiornaleLavori ||
    permissions.canViewSubappaltatori;

  const looksMarketing = textMatches(profileText, [
    "marketing",
    "sales",
    "vendite",
    "commerciale",
    "commercial",
    "crm",
    "call_center",
    "call center",
  ]);

  const looksManagement = textMatches(profileText, [
    "ufficio",
    "office",
    "gestione",
    "operations",
    "operativo",
    "cantieri",
    "lavori",
    "finanza",
    "amministrazione",
    "magazzino",
  ]);

  if (permissions.isAdmin && permissions.canViewCruscotto) {
    return EXECUTIVE_DASHBOARD_PATH;
  }

  if (looksMarketing && hasMarketingAccess) {
    return MARKETING_DASHBOARD_PATH;
  }

  if ((looksManagement || hasOperationsAccess) && permissions.canViewDashboard) {
    return MANAGEMENT_DASHBOARD_PATH;
  }

  if (hasMarketingAccess) {
    return MARKETING_DASHBOARD_PATH;
  }

  if (permissions.canViewCruscotto) {
    return EXECUTIVE_DASHBOARD_PATH;
  }

  if (permissions.canViewDashboard) {
    return MANAGEMENT_DASHBOARD_PATH;
  }

  return DASHBOARD_HUB_PATH;
}

