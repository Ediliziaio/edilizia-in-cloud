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
  canViewGiornaleLavori: true,
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
  canViewGiornaleLavori: false,
  canViewAutomazioni: false, canViewRenderAi: false,
  canViewSalesOs: false, canViewSmsMarketing: false,
  isAdmin: false, isLoading: false, onlyAssigned: false, visibleAreas: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: mappa la riga DB `staff_permissions` → oggetto Permissions.
// Estratto per essere riusato sia per l'utente loggato sia per "Visualizza come"
// (quando un super_admin vuole vedere esattamente quello che vede un suo utente).
// ─────────────────────────────────────────────────────────────────────────────
function mapDbRowToPermissions(row: Record<string, unknown> | null | undefined): Permissions {
  const r = (row ?? {}) as Record<string, unknown>;
  const g = (key: string): boolean => r[key] === true;

  return {
    canViewDashboard:  g("can_view_dashboard"),
    canViewOrders:     g("can_view_orders"),
    canEditOrders:     g("can_edit_orders"),
    canViewWarehouse:  g("can_view_warehouse"),
    canEditWarehouse:  g("can_edit_warehouse"),
    canViewCalendar:   g("can_view_calendar"),
    canViewCustomers:  g("can_view_customers"),
    canEditCustomers:  g("can_edit_customers"),
    canViewEmployees:  g("can_view_employees"),
    canViewTickets:    g("can_view_tickets"),
    canEditTickets:    g("can_edit_tickets"),
    canViewForecast:   g("can_view_forecast"),
    canViewUsers:      g("can_view_users"),
    canViewSettingsProfile:       g("can_view_settings_profile"),
    canEditSettingsProfile:       g("can_edit_settings_profile"),
    canViewSettingsOrders:        g("can_view_settings_orders"),
    canEditSettingsOrders:        g("can_edit_settings_orders"),
    canViewSettingsCustomization: g("can_view_settings_customization"),
    canEditSettingsCustomization: g("can_edit_settings_customization"),
    canViewSettingsPeople:        g("can_view_settings_people"),
    canEditSettingsPeople:        g("can_edit_settings_people"),
    canViewSettingsSecurity:      g("can_view_settings_security"),
    canViewSettings:
      g("can_view_settings") || g("can_view_settings_profile") || g("can_view_settings_orders") ||
      g("can_view_settings_customization") || g("can_view_settings_people") || g("can_view_settings_security"),
    canViewMarketing:
      g("can_view_marketing") || g("can_view_marketing_dashboard") || g("can_view_marketing_contacts") ||
      g("can_view_marketing_opportunities") || g("can_view_marketing_activities") || g("can_view_marketing_appointments") ||
      g("can_view_marketing_automations") || g("can_view_marketing_ai_agent") || g("can_view_marketing_email") ||
      g("can_view_marketing_whatsapp") || g("can_view_marketing_reports"),
    canEditMarketing:
      g("can_edit_marketing") || g("can_edit_marketing_contacts") || g("can_edit_marketing_opportunities"),
    canViewCruscotto:   g("can_view_cruscotto"),
    canViewBilling:     g("can_view_billing"),
    canViewScadenzario: g("can_view_scadenzario"),
    canViewPrimaNota:   g("can_view_prima_nota"),
    canViewCosts:       g("can_view_costs"),
    canViewPrevisionale: g("can_view_forecast"),
    canViewTesoreria:   g("can_view_tesoreria"),
    canViewPersone:     g("can_view_persone"),
    canViewMarketingDashboard:     g("can_view_marketing_dashboard"),
    canViewMarketingContacts:      g("can_view_marketing_contacts"),
    canEditMarketingContacts:      g("can_edit_marketing_contacts"),
    canViewMarketingOpportunities: g("can_view_marketing_opportunities"),
    canEditMarketingOpportunities: g("can_edit_marketing_opportunities"),
    canViewMarketingActivities:    g("can_view_marketing_activities"),
    canViewMarketingAppointments:  g("can_view_marketing_appointments"),
    canViewMarketingAutomations:   g("can_view_marketing_automations"),
    canViewMarketingAiAgent:       g("can_view_marketing_ai_agent"),
    canViewMarketingEmail:         g("can_view_marketing_email"),
    canViewMarketingWhatsapp:      g("can_view_marketing_whatsapp"),
    canViewMarketingReports:       g("can_view_marketing_reports"),
    canViewInterventi:        g("can_view_interventi"),
    canViewManutenzione:      g("can_view_manutenzione"),
    canViewSicurezzaCantiere: g("can_view_sicurezza_cantiere"),
    canViewSubappaltatori:    g("can_view_subappaltatori"),
    canViewGiornaleLavori:    g("can_view_giornale_lavori"),
    canViewAutomazioni:       g("can_view_automazioni"),
    canViewRenderAi:          g("can_view_render_ai"),
    canViewSalesOs:           g("can_view_sales_os"),
    canViewSmsMarketing:      g("can_view_sms_marketing"),
    isAdmin: false,
    isLoading: false,
    onlyAssigned:  r["only_assigned"] === true,
    visibleAreas:  Array.isArray(r["visible_areas"]) ? (r["visible_areas"] as string[]) : [],
  };
}

export function usePermissions(): Permissions {
  const {
    role, user, isImpersonating, isImpersonationReady,
    impersonatedCompanyId, impersonationToken,
    viewAsRole, viewAsUserId,
    multiCompanyAccesses, selectedMultiCompanyId,
  } = useAuth();
  const queryClient = useQueryClient();

  const isStaffRole = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"].includes(role || "");
  // I `multi_company_user` hanno una single row in `staff_permissions` che fa
  // da baseline: necessario fetchare anche per loro (insieme allo staff classico).
  const needsStaffPermsFetch = isStaffRole || role === "multi_company_user";

  // Risolve l'access_role per la company corrente (per multi_company_user).
  // Usato per discriminare ALL_PERMISSIONS (company_admin) vs staff branch.
  const currentAccessRole = useMemo(() => {
    if (role !== "multi_company_user") return null;
    const a = multiCompanyAccesses.find((x) => x.company_id === selectedMultiCompanyId);
    return a?.access_role ?? null;
  }, [role, multiCompanyAccesses, selectedMultiCompanyId]);

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
    enabled: needsStaffPermsFetch && !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // ─── "Visualizza come" — simula i permessi dell'utente scelto ───────────
  // Solo durante impersonation di un super_admin: se viewAsRole è settato,
  // carichiamo i permessi REALI dell'utente scelto (viewAsUserId) e restituiamo
  // quelli. Così il super_admin vede esattamente quello che vede quell'utente.
  const viewAsActive = role === "super_admin" && isImpersonating && !!viewAsRole;
  const viewAsNeedsDbFetch = viewAsActive &&
    !!viewAsUserId &&
    ["company_staff", "salesperson", "call_center", "employee", "subcontractor"].includes(viewAsRole || "");

  const { data: viewAsPermsRow, isLoading: viewAsLoading } = useQuery({
    queryKey: ["staff-permissions", "view-as", viewAsUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_permissions")
        .select("*")
        .eq("user_id", viewAsUserId!)
        .maybeSingle();
      if (error) {
        logger.error("Error fetching view-as permissions:", error);
        return null;
      }
      return data;
    },
    enabled: viewAsNeedsDbFetch,
    staleTime: 60 * 1000,
  });

  // Item 10: Realtime invalidation — if an admin updates this user's permissions,
  // invalidate the cache so the new permissions take effect without a page reload.
  // Esteso a multi_company_user: anche loro hanno una riga staff_permissions.
  useEffect(() => {
    if (!needsStaffPermsFetch || !user?.id) return;

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
  }, [user?.id, needsStaffPermsFetch, queryClient]);

  // ─── View-as mode: il super_admin sta simulando un utente specifico ────
  // NB: valutato PRIMA dello shortcut super_admin → ALL_PERMISSIONS, altrimenti
  // il menu/pagine continuerebbero a mostrare tutto ignorando la simulazione.
  if (viewAsActive) {
    if (viewAsRole === "company_admin") return ALL_PERMISSIONS;
    if (viewAsNeedsDbFetch) {
      if (viewAsLoading) return { ...NO_PERMISSIONS, isLoading: true };
      // viewAsPermsRow può essere null se l'utente non ha una riga in staff_permissions:
      // in quel caso ricadiamo su NO_PERMISSIONS (fail-safe) ma non blocchiamo l'UI.
      return mapDbRowToPermissions(viewAsPermsRow);
    }
    // Ruolo senza mapping DB (es. employee/subcontractor non ha staff_permissions):
    // ricadiamo su permessi di sola lettura minimi.
    return NO_PERMISSIONS;
  }

  // Super admin and company admin have all permissions
  if (role === "super_admin" || role === "company_admin") {
    return ALL_PERMISSIONS;
  }

  // ─── Multi-company user: il ruolo "effettivo" dipende dall'access_role
  // della company correntemente selezionata.
  //  - access_role = "company_admin"   → ALL_PERMISSIONS (admin sull'azienda)
  //  - access_role = "company_staff" / "salesperson" / "call_center" → leggi
  //    permessi granulari dalla riga staff_permissions
  //  - altrimenti (no access selezionato / dati non ancora pronti) → NO_PERMISSIONS
  if (role === "multi_company_user") {
    if (!currentAccessRole) {
      // Multi-company user collegato ma nessuna company selezionata yet
      // (il fetch in AuthContext popola accesses async). Non blocchiamo l'UI:
      // mostriamo loading per evitare flicker tra NO_PERMISSIONS → ALL.
      if (multiCompanyAccesses.length === 0) {
        return { ...NO_PERMISSIONS, isLoading: true };
      }
      // Accessi caricati ma nessuno selezionato: fail-safe
      return NO_PERMISSIONS;
    }
    if (currentAccessRole === "company_admin") {
      return ALL_PERMISSIONS;
    }
    // Staff-like access roles: usa la riga staff_permissions
    if (["company_staff", "salesperson", "call_center"].includes(currentAccessRole)) {
      if (isLoading) return { ...NO_PERMISSIONS, isLoading: true };
      return mapDbRowToPermissions(permissions);
    }
    // Ruolo accesso sconosciuto → fail-safe
    return NO_PERMISSIONS;
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
