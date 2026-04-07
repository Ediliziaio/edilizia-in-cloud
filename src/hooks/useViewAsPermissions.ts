/**
 * useViewAsPermissions — estende usePermissions() per sovrascrivere i permessi
 * quando il SuperAdmin è in modalità "Visualizza Come".
 *
 * IMPORTANTE: questo hook deve essere usato SOLO per la sidebar e la navigazione,
 * dove la simulazione visiva è necessaria. I permessi reali del SuperAdmin rimangono
 * intatti per tutte le operazioni di scrittura/query verso Supabase.
 */
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions, type Permissions } from "@/hooks/usePermissions";
import type { AppRole } from "@/types/auth";

// ─── Permessi simulati per company_admin ─────────────────
const COMPANY_ADMIN_VIEW: Permissions = {
  canViewDashboard: true,  canViewOrders: true,     canEditOrders: true,
  canViewWarehouse: true,  canEditWarehouse: true,   canViewCalendar: true,
  canViewCustomers: true,  canEditCustomers: true,   canViewEmployees: true,
  canViewTickets: true,    canEditTickets: true,     canViewForecast: true,
  canViewSettings: true,   canViewUsers: true,
  canViewSettingsProfile: true,        canEditSettingsProfile: true,
  canViewSettingsOrders: true,         canEditSettingsOrders: true,
  canViewSettingsCustomization: true,  canEditSettingsCustomization: true,
  canViewSettingsPeople: true,         canEditSettingsPeople: true,
  canViewSettingsSecurity: true,
  canViewMarketing: true,  canEditMarketing: true,
  canViewCruscotto: true,  canViewBilling: true,    canViewScadenzario: true,
  canViewPrimaNota: true,  canViewCosts: true,      canViewPrevisionale: true,
  canViewTesoreria: true,  canViewPersone: true,
  canViewMarketingDashboard: true,     canViewMarketingContacts: true,
  canEditMarketingContacts: true,      canViewMarketingOpportunities: true,
  canEditMarketingOpportunities: true, canViewMarketingActivities: true,
  canViewMarketingAppointments: true,  canViewMarketingAutomations: true,
  canViewMarketingAiAgent: true,       canViewMarketingEmail: true,
  canViewMarketingWhatsapp: true,      canViewMarketingReports: true,
  canViewInterventi: true,   canViewManutenzione: true,
  canViewSicurezzaCantiere: true, canViewSubappaltatori: true,
  canViewGiornaleLavori: true,    canViewMessaggiEsterni: true,
  canViewAutomazioni: true, canViewRenderAi: true,
  canViewSalesOs: true,     canViewSmsMarketing: true,
  isAdmin: true, isLoading: false, onlyAssigned: false,
};

// ─── Permessi simulati per company_staff ─────────────────
// Staff ridotto: no billing, no users, no settings avanzati
const COMPANY_STAFF_VIEW: Permissions = {
  canViewDashboard: true,  canViewOrders: true,     canEditOrders: false,
  canViewWarehouse: true,  canEditWarehouse: false,  canViewCalendar: true,
  canViewCustomers: true,  canEditCustomers: false,  canViewEmployees: false,
  canViewTickets: true,    canEditTickets: false,    canViewForecast: false,
  canViewSettings: true,   canViewUsers: false,
  canViewSettingsProfile: true,        canEditSettingsProfile: false,
  canViewSettingsOrders: false,        canEditSettingsOrders: false,
  canViewSettingsCustomization: false, canEditSettingsCustomization: false,
  canViewSettingsPeople: false,        canEditSettingsPeople: false,
  canViewSettingsSecurity: false,
  canViewMarketing: true,  canEditMarketing: false,
  canViewCruscotto: true,  canViewBilling: false,   canViewScadenzario: true,
  canViewPrimaNota: false, canViewCosts: false,      canViewPrevisionale: false,
  canViewTesoreria: false, canViewPersone: true,
  canViewMarketingDashboard: true,     canViewMarketingContacts: true,
  canEditMarketingContacts: false,     canViewMarketingOpportunities: true,
  canEditMarketingOpportunities: false, canViewMarketingActivities: true,
  canViewMarketingAppointments: true,  canViewMarketingAutomations: false,
  canViewMarketingAiAgent: false,      canViewMarketingEmail: false,
  canViewMarketingWhatsapp: false,     canViewMarketingReports: false,
  canViewInterventi: true,   canViewManutenzione: false,
  canViewSicurezzaCantiere: false, canViewSubappaltatori: false,
  canViewGiornaleLavori: false,    canViewMessaggiEsterni: true,
  canViewAutomazioni: false, canViewRenderAi: false,
  canViewSalesOs: false,     canViewSmsMarketing: false,
  isAdmin: false, isLoading: false, onlyAssigned: false,
};

function getPermissionsForRole(role: AppRole): Permissions {
  switch (role) {
    case "company_admin": return COMPANY_ADMIN_VIEW;
    case "company_staff": return COMPANY_STAFF_VIEW;
    default:              return COMPANY_STAFF_VIEW; // fallback conservativo
  }
}

export function useViewAsPermissions(): Permissions {
  const { viewAsRole } = useAuth();
  const realPermissions = usePermissions();

  // Nessuna simulazione attiva → permessi reali intatti
  if (!viewAsRole) return realPermissions;

  // Permessi simulati per il ruolo scelto
  return getPermissionsForRole(viewAsRole);
}
