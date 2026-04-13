import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";

export interface Permissions {
  canViewDashboard: boolean;
  canViewOrders: boolean;
  canEditOrders: boolean;
  canViewWarehouse: boolean;
  canEditWarehouse: boolean;
  canViewCalendar: boolean;
  canViewCustomers: boolean;
  canEditCustomers: boolean;
  canViewEmployees: boolean;
  canViewTickets: boolean;
  canEditTickets: boolean;
  canViewForecast: boolean;
  canViewSettings: boolean; // aggregate: true if any canViewSettings* is true
  canViewUsers: boolean;
  // Granular settings permissions
  canViewSettingsProfile: boolean;
  canEditSettingsProfile: boolean;
  canViewSettingsOrders: boolean;
  canEditSettingsOrders: boolean;
  canViewSettingsCustomization: boolean;
  canEditSettingsCustomization: boolean;
  canViewSettingsPeople: boolean;
  canEditSettingsPeople: boolean;
  canViewSettingsSecurity: boolean;
  canViewMarketing: boolean;
  canEditMarketing: boolean;
  canViewCruscotto: boolean;
  canViewBilling: boolean;
  canViewScadenzario: boolean;
  canViewPrimaNota: boolean;
  canViewCosts: boolean;
  canViewPrevisionale: boolean;
  canViewTesoreria: boolean;
  canViewPersone: boolean;
  // Granular marketing permissions
  canViewMarketingDashboard: boolean;
  canViewMarketingContacts: boolean;
  canEditMarketingContacts: boolean;
  canViewMarketingOpportunities: boolean;
  canEditMarketingOpportunities: boolean;
  canViewMarketingActivities: boolean;
  canViewMarketingAppointments: boolean;
  canViewMarketingAutomations: boolean;
  canViewMarketingAiAgent: boolean;
  canViewMarketingEmail: boolean;
  canViewMarketingWhatsapp: boolean;
  canViewMarketingReports: boolean;
  canViewInterventi: boolean;
  canViewManutenzione: boolean;
  canViewSicurezzaCantiere: boolean;
  canViewSubappaltatori: boolean;
  canViewGiornaleLavori: boolean;
  canViewMessaggiEsterni: boolean;
  canViewAutomazioni: boolean;
  canViewRenderAi: boolean;
  canViewSalesOs: boolean;
  canViewSmsMarketing: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  onlyAssigned: boolean;
  /** Aree visibili all'utente. Vuoto = tutte le aree. */
  visibleAreas: string[];
}

const ALL_PERMISSIONS: Permissions = {
  canViewDashboard: true, canViewOrders: true, canEditOrders: true,
  canViewWarehouse: true, canEditWarehouse: true, canViewCalendar: true,
  canViewCustomers: true, canEditCustomers: true, canViewEmployees: true,
  canViewTickets: true, canEditTickets: true, canViewForecast: true,
  canViewSettings: true, canViewUsers: true,
  canViewSettingsProfile: true, canEditSettingsProfile: true,
  canViewSettingsOrders: true, canEditSettingsOrders: true,
  canViewSettingsCustomization: true, canEditSettingsCustomization: true,
  canViewSettingsPeople: true, canEditSettingsPeople: true,
  canViewSettingsSecurity: true,
  canViewMarketing: true, canEditMarketing: true,
  canViewCruscotto: true,
  canViewBilling: true, canViewScadenzario: true,
  canViewPrimaNota: true, canViewCosts: true,
  canViewPrevisionale: true, canViewTesoreria: true,
  canViewPersone: true,
  canViewMarketingDashboard: true, canViewMarketingContacts: true,
  canEditMarketingContacts: true, canViewMarketingOpportunities: true,
  canEditMarketingOpportunities: true, canViewMarketingActivities: true,
  canViewMarketingAppointments: true, canViewMarketingAutomations: true,
  canViewMarketingAiAgent: true, canViewMarketingEmail: true,
  canViewMarketingWhatsapp: true, canViewMarketingReports: true,
  canViewInterventi: true, canViewManutenzione: true,
  canViewSicurezzaCantiere: true, canViewSubappaltatori: true,
  canViewGiornaleLavori: true, canViewMessaggiEsterni: true,
  canViewAutomazioni: true, canViewRenderAi: true,
  canViewSalesOs: true, canViewSmsMarketing: true,
  isAdmin: true, isLoading: false, onlyAssigned: false, visibleAreas: [],
};

const NO_PERMISSIONS: Permissions = {
  canViewDashboard: false, canViewOrders: false, canEditOrders: false,
  canViewWarehouse: false, canEditWarehouse: false, canViewCalendar: false,
  canViewCustomers: false, canEditCustomers: false, canViewEmployees: false,
  canViewTickets: false, canEditTickets: false, canViewForecast: false,
  canViewSettings: false, canViewUsers: false,
  canViewSettingsProfile: false, canEditSettingsProfile: false,
  canViewSettingsOrders: false, canEditSettingsOrders: false,
  canViewSettingsCustomization: false, canEditSettingsCustomization: false,
  canViewSettingsPeople: false, canEditSettingsPeople: false,
  canViewSettingsSecurity: false,
  canViewMarketing: false, canEditMarketing: false,
  canViewCruscotto: false,
  canViewBilling: false, canViewScadenzario: false,
  canViewPrimaNota: false, canViewCosts: false,
  canViewPrevisionale: false, canViewTesoreria: false,
  canViewPersone: false,
  canViewMarketingDashboard: false, canViewMarketingContacts: false,
  canEditMarketingContacts: false, canViewMarketingOpportunities: false,
  canEditMarketingOpportunities: false, canViewMarketingActivities: false,
  canViewMarketingAppointments: false, canViewMarketingAutomations: false,
  canViewMarketingAiAgent: false, canViewMarketingEmail: false,
  canViewMarketingWhatsapp: false, canViewMarketingReports: false,
  canViewInterventi: false, canViewManutenzione: false,
  canViewSicurezzaCantiere: false, canViewSubappaltatori: false,
  canViewGiornaleLavori: false, canViewMessaggiEsterni: false,
  canViewAutomazioni: false, canViewRenderAi: false,
  canViewSalesOs: false, canViewSmsMarketing: false,
  isAdmin: false, isLoading: false, onlyAssigned: false, visibleAreas: [],
};

export function usePermissions(): Permissions {
  const { role, user, isImpersonating, isImpersonationReady, impersonatedCompanyId, impersonationToken } = useAuth();
  const queryClient = useQueryClient();

  const isStaffRole = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"].includes(role || "");

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["staff-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_permissions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        logger.error("Error fetching permissions:", error);
        return null;
      }
      return data;
    },
    enabled: isStaffRole && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Item 10: Realtime invalidation — if an admin updates this user's permissions,
  // invalidate the cache so the new permissions take effect without a page reload.
  useEffect(() => {
    if (!isStaffRole || !user?.id) return;

    const channel = supabase
      .channel(`staff-permissions-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "staff_permissions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["staff-permissions", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isStaffRole, queryClient]);

  // Super admin and company admin have all permissions
  if (role === "super_admin" || role === "company_admin") {
    return ALL_PERMISSIONS;
  }

  // Active impersonation session: grant full permissions ONLY after fetchUserData
  // has confirmed the super_admin role (isImpersonationReady).
  // This prevents the startup race where sessionStorage tokens are present but the
  // role has not been verified yet.
  // The actual data access is governed by server-side RLS + the impersonation token.
  if (isImpersonationReady && (isImpersonating || (!!impersonatedCompanyId && !!impersonationToken))) {
    return ALL_PERMISSIONS;
  }

  // Staff: return permissions from database
  if (["company_staff", "salesperson", "call_center", "employee", "subcontractor"].includes(role || "")) {
    if (isLoading) {
      return { ...NO_PERMISSIONS, isLoading: true };
    }

    return {
      canViewDashboard: permissions?.can_view_dashboard ?? false,
      canViewOrders: permissions?.can_view_orders ?? false,
      canEditOrders: permissions?.can_edit_orders ?? false,
      canViewWarehouse: permissions?.can_view_warehouse ?? false,
      canEditWarehouse: permissions?.can_edit_warehouse ?? false,
      canViewCalendar: permissions?.can_view_calendar ?? false,
      canViewCustomers: permissions?.can_view_customers ?? false,
      canEditCustomers: permissions?.can_edit_customers ?? false,
      canViewEmployees: permissions?.can_view_employees ?? false,
      canViewTickets: permissions?.can_view_tickets ?? false,
      canEditTickets: permissions?.can_edit_tickets ?? false,
      canViewForecast: permissions?.can_view_forecast ?? false,
      canViewUsers: permissions?.can_view_users ?? false,
      // Granular settings
      canViewSettingsProfile:       permissions?.can_view_settings_profile       ?? false,
      canEditSettingsProfile:       permissions?.can_edit_settings_profile       ?? false,
      canViewSettingsOrders:        permissions?.can_view_settings_orders        ?? false,
      canEditSettingsOrders:        permissions?.can_edit_settings_orders        ?? false,
      canViewSettingsCustomization: permissions?.can_view_settings_customization ?? false,
      canEditSettingsCustomization: permissions?.can_edit_settings_customization ?? false,
      canViewSettingsPeople:        permissions?.can_view_settings_people        ?? false,
      canEditSettingsPeople:        permissions?.can_edit_settings_people        ?? false,
      canViewSettingsSecurity:      permissions?.can_view_settings_security      ?? false,
      // Aggregate: true if any granular setting is enabled OR the legacy flag is still set
      canViewSettings:
        (permissions?.can_view_settings ?? false) ||
        (permissions?.can_view_settings_profile ?? false) ||
        (permissions?.can_view_settings_orders ?? false) ||
        (permissions?.can_view_settings_customization ?? false) ||
        (permissions?.can_view_settings_people ?? false) ||
        (permissions?.can_view_settings_security ?? false),
      // Aggregate: true se legacy flag OR qualsiasi flag marketing granulare è abilitato
      canViewMarketing:
        (permissions?.can_view_marketing ?? false) ||
        (permissions?.can_view_marketing_dashboard ?? false) ||
        (permissions?.can_view_marketing_contacts ?? false) ||
        (permissions?.can_view_marketing_opportunities ?? false) ||
        (permissions?.can_view_marketing_activities ?? false) ||
        (permissions?.can_view_marketing_appointments ?? false) ||
        (permissions?.can_view_marketing_automations ?? false) ||
        (permissions?.can_view_marketing_ai_agent ?? false) ||
        (permissions?.can_view_marketing_email ?? false) ||
        (permissions?.can_view_marketing_whatsapp ?? false) ||
        (permissions?.can_view_marketing_reports ?? false),
      canEditMarketing:
        (permissions?.can_edit_marketing ?? false) ||
        (permissions?.can_edit_marketing_contacts ?? false) ||
        (permissions?.can_edit_marketing_opportunities ?? false),
      canViewCruscotto: permissions?.can_view_cruscotto ?? false,
      canViewBilling: permissions?.can_view_billing ?? false,
      canViewScadenzario: permissions?.can_view_scadenzario ?? false,
      canViewPrimaNota: permissions?.can_view_prima_nota ?? false,
      canViewCosts: permissions?.can_view_costs ?? false,
      canViewPrevisionale: permissions?.can_view_forecast ?? false,
      canViewTesoreria: permissions?.can_view_tesoreria ?? false,
      canViewPersone: permissions?.can_view_persone ?? false,
      canViewMarketingDashboard: permissions?.can_view_marketing_dashboard ?? false,
      canViewMarketingContacts: permissions?.can_view_marketing_contacts ?? false,
      canEditMarketingContacts: permissions?.can_edit_marketing_contacts ?? false,
      canViewMarketingOpportunities: permissions?.can_view_marketing_opportunities ?? false,
      canEditMarketingOpportunities: permissions?.can_edit_marketing_opportunities ?? false,
      canViewMarketingActivities: permissions?.can_view_marketing_activities ?? false,
      canViewMarketingAppointments: permissions?.can_view_marketing_appointments ?? false,
      canViewMarketingAutomations: permissions?.can_view_marketing_automations ?? false,
      canViewMarketingAiAgent: permissions?.can_view_marketing_ai_agent ?? false,
      canViewMarketingEmail: permissions?.can_view_marketing_email ?? false,
      canViewMarketingWhatsapp: permissions?.can_view_marketing_whatsapp ?? false,
      canViewMarketingReports: permissions?.can_view_marketing_reports ?? false,
      canViewInterventi:        permissions?.can_view_interventi          ?? false,
      canViewManutenzione:      permissions?.can_view_manutenzione        ?? false,
      canViewSicurezzaCantiere: permissions?.can_view_sicurezza_cantiere  ?? false,
      canViewSubappaltatori:    permissions?.can_view_subappaltatori       ?? false,
      canViewGiornaleLavori:    permissions?.can_view_giornale_lavori     ?? false,
      canViewMessaggiEsterni:   permissions?.can_view_messaggi_esterni    ?? false,
      canViewAutomazioni:       permissions?.can_view_automazioni         ?? false,
      canViewRenderAi:          permissions?.can_view_render_ai           ?? false,
      canViewSalesOs:           permissions?.can_view_sales_os            ?? false,
      canViewSmsMarketing:      permissions?.can_view_sms_marketing       ?? false,
      isAdmin: false,
      isLoading: false,
      onlyAssigned: permissions?.only_assigned ?? false,
      visibleAreas: permissions?.visible_areas ?? [],
    };
  }

  // Safety net: user is authenticated but role is temporarily null.
  // This can happen if a TOKEN_REFRESHED fetch previously failed and left role unresolved.
  // Returning isLoading:true prevents filterNavItems from blanking the sidebar
  // until the next successful auth resolution.
  if (user && role == null) {
    return { ...NO_PERMISSIONS, isLoading: true };
  }

  // Defensive: user is authenticated with a role that doesn't match any branch above
  // (e.g. 'customer', 'worker', 'referrer', 'multi_company_user', 'platform_*' or
  //  un nuovo ruolo aggiunto all'enum senza mapping in usePermissions).
  // Log esplicito per facilitare debug + NO_PERMISSIONS per fail-safe.
  if (user && role) {
    logger.warn(
      `[usePermissions] Ruolo '${role}' senza mapping esplicito: fallback NO_PERMISSIONS. ` +
      `Aggiungere branch dedicato se il ruolo deve accedere a funzionalit\u00e0 aziendali.`
    );
    return NO_PERMISSIONS;
  }

  // Default: no permissions (unauthenticated)
  return NO_PERMISSIONS;
}
