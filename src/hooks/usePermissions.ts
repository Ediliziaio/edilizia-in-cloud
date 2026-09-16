import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/utils/logger";
import { withClientTimeout } from "@/lib/query-timeout";
import { resolveSelectedAccessRole } from "@/lib/auth/multiCompany";
import { useCurrentCommercialistaAccessMode } from "@/hooks/accountant/useAccountantPortalData";

export interface Permissions {
  canViewDashboard: boolean;
  canViewOrders: boolean;
  canEditOrders: boolean;
  /** Vede gli importi di VENDITA in commesse/preventivi (importo, prezzi, acconti). Default true. */
  canViewOrderAmounts: boolean;
  canViewWarehouse: boolean;
  canEditWarehouse: boolean;
  canViewCalendar: boolean;
  canViewCustomers: boolean;
  canEditCustomers: boolean;
  canViewEmployees: boolean;
  /** Può approvare ordini/commesse */
  canApproveOrders: boolean;
  /** Può eliminare ordini/commesse (singola e bulk) */
  canDeleteOrders: boolean;
  /** Può esportare l'anagrafica clienti */
  canExportClients: boolean;
  /** Gestione pagamenti/incassi */
  canManagePayments: boolean;
  /** Gestione fornitori */
  canManageSuppliers: boolean;
  /** Gestione articoli/listino magazzino */
  canManageWarehouseItems: boolean;
  /** Report finanziari */
  canViewFinancialReports: boolean;
  /** Attività (pagina /azienda/attivita): vede le task di tutto il team; false = solo le proprie. */
  canViewTeamTasks: boolean;
  /** Calendario: vede appuntamenti/eventi di tutto il team; false = solo i propri. */
  canViewAllTeamCalendar: boolean;
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
  // Granular settings: Listino & Prezzi / Fornitori / Integrazioni & Canali
  canViewSettingsPricing: boolean;
  canEditSettingsPricing: boolean;
  // Granularità Listino & Prezzi: toggle dedicati; pricing pieno = master.
  canViewSettingsScontistica: boolean;
  canEditSettingsScontistica: boolean;
  canViewSettingsFinanziamenti: boolean;
  canEditSettingsFinanziamenti: boolean;
  canViewSettingsBundle: boolean;
  canEditSettingsBundle: boolean;
  canViewSettingsSuppliers: boolean;
  canEditSettingsSuppliers: boolean;
  canViewSettingsIntegrations: boolean;
  canEditSettingsIntegrations: boolean;
  canViewMarketing: boolean;
  canEditMarketing: boolean;
  canViewCruscotto: boolean;
  canViewBilling: boolean;
  canViewScadenzario: boolean;
  canViewPrimaNota: boolean;
  canViewCosts: boolean;
  /** Visibilità MARGINI (margine €/%, provvigioni). Distinto da canViewCosts:
   *  un commerciale può vedere costi senza margini o viceversa. */
  canViewMargins: boolean;
  canViewPrevisionale: boolean;
  canViewTesoreria: boolean;
  canViewPersone: boolean;
  /** Fruizione area Formazione (/azienda/formazione) */
  canViewFormazione: boolean;
  /** Gestione Portale corsi (/azienda/personale/portale) */
  canManagePortal: boolean;
  /** Creazione/editing corsi nel builder (/azienda/corsi). Distinto da
   *  canManagePortal: si può gestire il Portale (libreria + assegnazioni)
   *  senza poter creare/modificare corsi. Transitorio: finché la colonna DB
   *  `can_create_courses` non è applicata è derivato da canManagePortal
   *  (vedi mapDbRowToPermissions). */
  canCreateCourses: boolean;
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
  /** Modifica/compila il Giornale Lavori (rapportini) */
  canEditGiornaleLavori: boolean;
  /** Sopralluoghi tecnici (prima ereditavano da CRM contatti) */
  canViewSopralluoghi: boolean;
  /** Preventivi (prima ereditavano da CRM opportunità) */
  canViewPreventivi: boolean;
  canEditPreventivi: boolean;
  /** Autorizzato a impostare/approvare sconti oltre soglia (approvazione sconti).
   *  Distinto da canEditPreventivi: uno può creare preventivi ma non forzare gli
   *  sconti — deve usare "Richiedi approvazione". Gli admin d'azienda ce l'hanno. */
  canApproveDiscounts: boolean;
  canViewAutomazioni: boolean;
  canViewRenderAi: boolean;
  canViewSalesOs: boolean;
  canViewSmsMarketing: boolean;
  /** Modulo Firma Elettronica (FEA) — cantieri + CRM */
  canViewFirmaElettronica: boolean;
  /** Modulo Reputazione (gestione recensioni) */
  canViewReputazione: boolean;
  /** Modulo Controllo di Gestione (MP-CG): admin o canViewCruscotto/Billing. */
  canViewControlloGestione: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  loadError?: string | null;
  onlyAssigned: boolean;
  /** Vede tutte e sole le commesse dei magazzini a cui è assegnato (più le proprie). */
  onlyMyWarehouse: boolean;
  /** Aree visibili all'utente. Vuoto = tutte le aree. */
  visibleAreas: string[];
  /** Vede le sue aree ma non crea e non modifica nulla (staff_permissions.sola_lettura).
   *  Serve anche dove non c'è una colonna di modifica: appuntamenti, attività,
   *  sopralluoghi (in DB policy RESTRICTIVE con utente_sola_lettura). */
  solaLettura: boolean;
}

// Esportato per il test contratto permissionsRegistryParity: ogni permesso
// configurabile nelle dialog DEVE essere caricato qui, altrimenti è un
// "toggle morto" (classe di bug: can_view_all_team_calendar, can_approve_discounts).
export const STAFF_PERMISSIONS_SELECT_KEYS = [
  "can_view_dashboard",
  "can_view_orders",
  "can_edit_orders",
  "can_view_order_amounts",
  "can_view_warehouse",
  "can_edit_warehouse",
  "can_view_calendar",
  "can_view_customers",
  "can_edit_customers",
  "can_view_employees",
  "can_view_tickets",
  "can_edit_tickets",
  "can_view_forecast",
  "can_view_users",
  "can_view_settings",
  "can_view_settings_profile",
  "can_edit_settings_profile",
  "can_view_settings_orders",
  "can_edit_settings_orders",
  "can_view_settings_customization",
  "can_edit_settings_customization",
  "can_view_settings_people",
  "can_edit_settings_people",
  "can_view_settings_security",
  "can_view_settings_pricing",
  "can_edit_settings_pricing",
  "can_view_settings_scontistica",
  "can_edit_settings_scontistica",
  "can_view_settings_finanziamenti",
  "can_edit_settings_finanziamenti",
  "can_view_settings_bundle",
  "can_edit_settings_bundle",
  "can_view_settings_suppliers",
  "can_edit_settings_suppliers",
  "can_view_settings_integrations",
  "can_edit_settings_integrations",
  "can_view_marketing",
  "can_edit_marketing",
  "can_view_marketing_dashboard",
  "can_view_marketing_contacts",
  "can_edit_marketing_contacts",
  "can_view_marketing_opportunities",
  "can_edit_marketing_opportunities",
  "can_view_marketing_activities",
  "can_view_marketing_appointments",
  "can_view_marketing_automations",
  "can_view_marketing_ai_agent",
  "can_view_marketing_email",
  "can_view_marketing_whatsapp",
  "can_view_marketing_reports",
  "can_view_cruscotto",
  "can_view_billing",
  "can_view_scadenzario",
  "can_view_prima_nota",
  "can_view_costs",
  "can_view_margins",
  "can_view_tesoreria",
  "can_view_persone",
  "can_view_formazione",
  "can_manage_portal",
  "can_view_controllo_gestione",
  "can_view_interventi",
  "can_view_manutenzione",
  "can_view_sicurezza_cantiere",
  "can_view_subappaltatori",
  "can_view_giornale_lavori",
  "can_edit_giornale_lavori",
  "can_view_sopralluoghi",
  "can_view_preventivi",
  "can_edit_preventivi",
  "can_approve_discounts",
  "can_view_automazioni",
  "can_view_render_ai",
  "can_view_sales_os",
  "can_view_sms_marketing",
  "can_view_firma_elettronica",
  "can_view_reputazione",
  "can_view_team_tasks",
  "can_view_all_team_calendar",
  // 2026-07-12: erano configurabili nelle dialog ma MAI caricati a runtime
  // (toggle morti). NB: can_view_messaggi_esterni resta fuori — feature rimossa.
  "can_approve_orders",
  "can_delete_orders",
  "can_export_clients",
  "can_manage_payments",
  "can_manage_suppliers",
  "can_manage_warehouse_items",
  "can_view_financial_reports",
  "only_assigned",
  "only_my_warehouse",
  "sola_lettura",
  "visible_areas",
];
const STAFF_PERMISSIONS_SELECT = STAFF_PERMISSIONS_SELECT_KEYS.join(",");

const ALL_PERMISSIONS: Permissions = {
  canViewDashboard: true, canViewOrders: true, canEditOrders: true,
  canViewOrderAmounts: true,
  canViewWarehouse: true, canEditWarehouse: true, canViewCalendar: true,
  canViewCustomers: true, canEditCustomers: true, canViewEmployees: true,
  canViewTickets: true, canEditTickets: true, canViewForecast: true,
  canViewSettings: true, canViewUsers: true,
  canViewSettingsProfile: true, canEditSettingsProfile: true,
  canViewSettingsOrders: true, canEditSettingsOrders: true,
  canViewSettingsCustomization: true, canEditSettingsCustomization: true,
  canViewSettingsPeople: true, canEditSettingsPeople: true,
  canViewSettingsSecurity: true,
  canViewSettingsPricing: true, canEditSettingsPricing: true,
  canViewSettingsScontistica: true, canEditSettingsScontistica: true,
  canViewSettingsFinanziamenti: true, canEditSettingsFinanziamenti: true,
  canViewSettingsBundle: true, canEditSettingsBundle: true,
  canViewSettingsSuppliers: true, canEditSettingsSuppliers: true,
  canViewSettingsIntegrations: true, canEditSettingsIntegrations: true,
  canViewMarketing: true, canEditMarketing: true,
  canViewCruscotto: true,
  canViewBilling: true, canViewScadenzario: true,
  canViewPrimaNota: true, canViewCosts: true, canViewMargins: true,
  canViewPrevisionale: true, canViewTesoreria: true,
  canViewPersone: true,
  canViewFormazione: true, canManagePortal: true, canCreateCourses: true,
  canViewMarketingDashboard: true, canViewMarketingContacts: true,
  canEditMarketingContacts: true, canViewMarketingOpportunities: true,
  canEditMarketingOpportunities: true, canViewMarketingActivities: true,
  canViewMarketingAppointments: true, canViewMarketingAutomations: true,
  canViewMarketingAiAgent: true, canViewMarketingEmail: true,
  canViewMarketingWhatsapp: true, canViewMarketingReports: true,
  canViewInterventi: true, canViewManutenzione: true,
  canViewSicurezzaCantiere: true, canViewSubappaltatori: true,
  canViewGiornaleLavori: true,
  canEditGiornaleLavori: true,
  canViewSopralluoghi: true,
  canViewPreventivi: true, canEditPreventivi: true,
  canApproveDiscounts: true,
  canViewAutomazioni: true, canViewRenderAi: true,
  canViewSalesOs: true, canViewSmsMarketing: true,
  canViewFirmaElettronica: true, canViewReputazione: true,
  canViewControlloGestione: true,
  canViewTeamTasks: true, canViewAllTeamCalendar: true,
  canApproveOrders: true, canDeleteOrders: true, canExportClients: true,
  canManagePayments: true, canManageSuppliers: true, canManageWarehouseItems: true,
  canViewFinancialReports: true,
  isAdmin: true, isLoading: false, loadError: null, onlyAssigned: false, onlyMyWarehouse: false, visibleAreas: [],
  solaLettura: false,
};

const NO_PERMISSIONS: Permissions = {
  canViewDashboard: false, canViewOrders: false, canEditOrders: false,
  canViewOrderAmounts: false,
  canViewWarehouse: false, canEditWarehouse: false, canViewCalendar: false,
  canViewCustomers: false, canEditCustomers: false, canViewEmployees: false,
  canViewTickets: false, canEditTickets: false, canViewForecast: false,
  canViewSettings: false, canViewUsers: false,
  canViewSettingsProfile: false, canEditSettingsProfile: false,
  canViewSettingsOrders: false, canEditSettingsOrders: false,
  canViewSettingsCustomization: false, canEditSettingsCustomization: false,
  canViewSettingsPeople: false, canEditSettingsPeople: false,
  canViewSettingsSecurity: false,
  canViewSettingsPricing: false, canEditSettingsPricing: false,
  canViewSettingsScontistica: false, canEditSettingsScontistica: false,
  canViewSettingsFinanziamenti: false, canEditSettingsFinanziamenti: false,
  canViewSettingsBundle: false, canEditSettingsBundle: false,
  canViewSettingsSuppliers: false, canEditSettingsSuppliers: false,
  canViewSettingsIntegrations: false, canEditSettingsIntegrations: false,
  canViewMarketing: false, canEditMarketing: false,
  canViewCruscotto: false,
  canViewBilling: false, canViewScadenzario: false,
  canViewPrimaNota: false, canViewCosts: false, canViewMargins: false,
  canViewPrevisionale: false, canViewTesoreria: false,
  canViewPersone: false,
  canViewFormazione: false, canManagePortal: false, canCreateCourses: false,
  canViewMarketingDashboard: false, canViewMarketingContacts: false,
  canEditMarketingContacts: false, canViewMarketingOpportunities: false,
  canEditMarketingOpportunities: false, canViewMarketingActivities: false,
  canViewMarketingAppointments: false, canViewMarketingAutomations: false,
  canViewMarketingAiAgent: false, canViewMarketingEmail: false,
  canViewMarketingWhatsapp: false, canViewMarketingReports: false,
  canViewInterventi: false, canViewManutenzione: false,
  canViewSicurezzaCantiere: false, canViewSubappaltatori: false,
  canViewGiornaleLavori: false,
  canEditGiornaleLavori: false,
  canViewSopralluoghi: false,
  canViewPreventivi: false, canEditPreventivi: false,
  canApproveDiscounts: false,
  canViewAutomazioni: false, canViewRenderAi: false,
  canViewSalesOs: false, canViewSmsMarketing: false,
  canViewFirmaElettronica: false, canViewReputazione: false,
  canViewControlloGestione: false,
  canViewTeamTasks: false, canViewAllTeamCalendar: false,
  canApproveOrders: false, canDeleteOrders: false, canExportClients: false,
  canManagePayments: false, canManageSuppliers: false, canManageWarehouseItems: false,
  canViewFinancialReports: false,
  isAdmin: false, isLoading: false, loadError: null, onlyAssigned: false, onlyMyWarehouse: false, visibleAreas: [],
  solaLettura: false,
};

// Permessi del commercialista quando opera su un'azienda cliente delegata
// (currentAccessRole === 'accountant'). Coerente con
// COMMERCIALISTA_ALLOWED_URLS in CompanyLayout: vede cantieri, magazzino,
// controllo gestione, finanza, persone — non marketing/vendita/automazioni.
// Edit per default = false (sola lettura). Per access_mode='operational'
// in futuro si potranno abilitare i canEdit*.
const COMMERCIALISTA_PERMISSIONS: Permissions = {
  canViewDashboard: true,
  canViewCruscotto: true,
  canViewControlloGestione: true,
  // Cantieri & Lavori
  canViewOrders: true, canEditOrders: false,
  canViewOrderAmounts: true,
  canViewWarehouse: true, canEditWarehouse: false,
  canViewCalendar: true,
  canViewCustomers: true, canEditCustomers: false,
  canViewSubappaltatori: true,
  canViewSicurezzaCantiere: true,
  canViewGiornaleLavori: true,
  canEditGiornaleLavori: false,
  canViewSopralluoghi: false,
  canViewPreventivi: false, canEditPreventivi: false,
  canApproveDiscounts: false,
  canViewInterventi: true,
  canViewManutenzione: true,
  canViewTickets: true, canEditTickets: false,
  // Finanza
  canViewBilling: true,
  canViewScadenzario: true,
  canViewPrimaNota: true,
  canViewCosts: true,
  canViewMargins: true,
  canViewPrevisionale: true,
  canViewTesoreria: true,
  canViewForecast: true,
  // Persone (lettura HR)
  canViewPersone: true,
  canViewEmployees: true,
  // Formazione/Portale: il commercialista esterno non ne ha bisogno
  canViewFormazione: false,
  canManagePortal: false,
  canCreateCourses: false,
  // Settings: ESPLICITAMENTE NO — il commercialista non deve modificare
  // o vedere la configurazione dell'azienda cliente (anagrafica, fornitori,
  // listini, branding, abbonamento, utenti, sicurezza)
  canViewSettingsProfile: false,
  canViewSettings: false,
  // ESPLICITAMENTE NO marketing / automazioni / vendita
  canViewMarketing: false, canEditMarketing: false,
  canViewMarketingDashboard: false, canViewMarketingContacts: false,
  canEditMarketingContacts: false, canViewMarketingOpportunities: false,
  canEditMarketingOpportunities: false, canViewMarketingActivities: false,
  canViewMarketingAppointments: false, canViewMarketingAutomations: false,
  canViewMarketingAiAgent: false, canViewMarketingEmail: false,
  canViewMarketingWhatsapp: false, canViewMarketingReports: false,
  canViewSmsMarketing: false,
  canViewSalesOs: false,
  // Firma elettronica / reputazione: non pertinenti al commercialista esterno
  canViewFirmaElettronica: false,
  canViewReputazione: false,
  // Supervisione in sola lettura: vede il calendario del team ma non gestisce attività
  canViewTeamTasks: false,
  canViewAllTeamCalendar: true,
  // Sola lettura: nessuna azione dispositiva; i report finanziari sì (è il commercialista)
  canApproveOrders: false, canDeleteOrders: false, canExportClients: false,
  canManagePayments: false, canManageSuppliers: false, canManageWarehouseItems: false,
  canViewFinancialReports: true,
  canViewAutomazioni: false,
  canViewRenderAi: false,
  // Settings amministrativi → no
  canViewUsers: false,
  canEditSettingsProfile: false,
  canViewSettingsOrders: false, canEditSettingsOrders: false,
  canViewSettingsCustomization: false, canEditSettingsCustomization: false,
  canViewSettingsPeople: false, canEditSettingsPeople: false,
  canViewSettingsSecurity: false,
  // Commercialista esterno: nessun accesso alla configurazione azienda
  canViewSettingsPricing: false, canEditSettingsPricing: false,
  canViewSettingsScontistica: false, canEditSettingsScontistica: false,
  canViewSettingsFinanziamenti: false, canEditSettingsFinanziamenti: false,
  canViewSettingsBundle: false, canEditSettingsBundle: false,
  canViewSettingsSuppliers: false, canEditSettingsSuppliers: false,
  canViewSettingsIntegrations: false, canEditSettingsIntegrations: false,
  isAdmin: false, isLoading: false, loadError: null, onlyAssigned: false, onlyMyWarehouse: false, visibleAreas: [],
  solaLettura: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: mappa la riga DB `staff_permissions` → oggetto Permissions.
// Estratto per essere riusato sia per l'utente loggato sia per "Visualizza come"
// (quando un super_admin vuole vedere esattamente quello che vede un suo utente).
// ─────────────────────────────────────────────────────────────────────────────
function mapDbRowToPermissions(row: Record<string, unknown> | null | undefined): Permissions {
  const r = (row ?? {}) as Record<string, unknown>;
  const g = (key: string): boolean => r[key] === true;
  const solaLettura = r["sola_lettura"] === true;

  const mapped: Permissions = {
    canViewDashboard:  g("can_view_dashboard"),
    canViewOrders:     g("can_view_orders"),
    canEditOrders:     g("can_edit_orders"),
    // Default VISIBILE: importi mostrati salvo esplicito false (retrocompat).
    canViewOrderAmounts: r["can_view_order_amounts"] !== false,
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
    canViewSettingsPricing:       g("can_view_settings_pricing"),
    canEditSettingsPricing:       g("can_edit_settings_pricing"),
    // Granularità Listino & Prezzi (13/7/2026): il toggle dedicato apre la
    // singola pagina; "Listino & Prezzi" pieno resta il master che apre tutto.
    canViewSettingsScontistica:   g("can_view_settings_scontistica") || g("can_view_settings_pricing"),
    canEditSettingsScontistica:   g("can_edit_settings_scontistica") || g("can_edit_settings_pricing"),
    canViewSettingsFinanziamenti: g("can_view_settings_finanziamenti") || g("can_view_settings_pricing"),
    canEditSettingsFinanziamenti: g("can_edit_settings_finanziamenti") || g("can_edit_settings_pricing"),
    canViewSettingsBundle:        g("can_view_settings_bundle") || g("can_view_settings_pricing"),
    canEditSettingsBundle:        g("can_edit_settings_bundle") || g("can_edit_settings_pricing"),
    canViewSettingsSuppliers:     g("can_view_settings_suppliers"),
    canEditSettingsSuppliers:     g("can_edit_settings_suppliers"),
    canViewSettingsIntegrations:  g("can_view_settings_integrations"),
    canEditSettingsIntegrations:  g("can_edit_settings_integrations"),
    canViewSettings:
      g("can_view_settings") || g("can_view_settings_profile") || g("can_view_settings_orders") ||
      g("can_view_settings_customization") || g("can_view_settings_people") || g("can_view_settings_security") ||
      g("can_view_settings_pricing") || g("can_view_settings_suppliers") || g("can_view_settings_integrations") ||
      g("can_view_settings_scontistica") || g("can_view_settings_finanziamenti") || g("can_view_settings_bundle"),
    canViewMarketing:
      g("can_view_marketing") || g("can_view_marketing_dashboard") || g("can_view_marketing_contacts") ||
      g("can_view_marketing_opportunities") || g("can_view_marketing_activities") || g("can_view_marketing_appointments") ||
      g("can_view_marketing_automations") || g("can_view_marketing_ai_agent") || g("can_view_marketing_email") ||
      g("can_view_sms_marketing") || g("can_view_marketing_whatsapp") || g("can_view_marketing_reports") ||
      g("can_view_reputazione") || g("can_view_sales_os"),
    canEditMarketing:
      g("can_edit_marketing") || g("can_edit_marketing_contacts") || g("can_edit_marketing_opportunities"),
    canViewCruscotto:   g("can_view_cruscotto"),
    canViewBilling:     g("can_view_billing"),
    canViewScadenzario: g("can_view_scadenzario"),
    canViewPrimaNota:   g("can_view_prima_nota"),
    canViewCosts:       g("can_view_costs"),
    canViewMargins:     g("can_view_margins"),
    canViewPrevisionale: g("can_view_forecast"),
    canViewTesoreria:   g("can_view_tesoreria"),
    canViewPersone:     g("can_view_persone"),
    canViewFormazione:  g("can_view_formazione"),
    canManagePortal:    g("can_manage_portal"),
    // Transitorio: finché la colonna DB `can_create_courses` non è applicata
    // (migration 20271225000000, da applicare in pubblicazione) la creazione
    // corsi resta legata a chi gestisce il Portale. Post-migration diventerà
    // `g("can_create_courses")` puro, per separare gestione da creazione.
    canCreateCourses:   g("can_create_courses") || g("can_manage_portal"),
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
    canEditGiornaleLavori:    g("can_edit_giornale_lavori"),
    canViewSopralluoghi:      g("can_view_sopralluoghi"),
    canViewPreventivi:        g("can_view_preventivi"),
    canEditPreventivi:        g("can_edit_preventivi"),
    canApproveDiscounts:      g("can_approve_discounts"),
    canViewAutomazioni:       g("can_view_automazioni"),
    canViewRenderAi:          g("can_view_render_ai"),
    canViewSalesOs:           g("can_view_sales_os"),
    canViewSmsMarketing:      g("can_view_sms_marketing"),
    canViewFirmaElettronica:  g("can_view_firma_elettronica"),
    canViewReputazione:       g("can_view_reputazione"),
    canViewTeamTasks:         g("can_view_team_tasks"),
    canViewAllTeamCalendar:   g("can_view_all_team_calendar"),
    canApproveOrders:         g("can_approve_orders"),
    canDeleteOrders:          g("can_delete_orders"),
    canExportClients:         g("can_export_clients"),
    canManagePayments:        g("can_manage_payments"),
    canManageSuppliers:       g("can_manage_suppliers"),
    canManageWarehouseItems:  g("can_manage_warehouse_items"),
    canViewFinancialReports:  g("can_view_financial_reports"),
    // Modulo CG: deriva da permessi finanziari esistenti (cruscotto / billing)
    // più feature flag controllo_gestione_v1 lato UI (utility separata).
    canViewControlloGestione: g("can_view_cruscotto") || g("can_view_billing") || g("can_view_costs") || g("can_view_controllo_gestione"),
    isAdmin: false,
    isLoading: false,
    onlyAssigned:  r["only_assigned"] === true,
    onlyMyWarehouse: r["only_my_warehouse"] === true,
    visibleAreas:  Array.isArray(r["visible_areas"]) ? (r["visible_areas"] as string[]) : [],
    solaLettura,
  };

  // Il trigger in DB spegne già le colonne; qui anche i permessi derivati
  // (es. Scontistica da Listino, corsi da Portale) e le righe lette prima
  // della migrazione, così nessun bottone di scrittura resta acceso.
  if (solaLettura) {
    for (const key of Object.keys(mapped) as (keyof Permissions)[]) {
      if (/^can(Edit|Manage|Approve|Delete|Create)[A-Z]/.test(key)) {
        (mapped as unknown as Record<string, boolean>)[key] = false;
      }
    }
  }
  return mapped;
}

export function usePermissions(): Permissions {
  const {
    role, user, isImpersonating, isImpersonationReady,
    impersonatedCompanyId, impersonationToken,
    viewAsRole, viewAsUserId,
    multiCompanyAccesses, selectedMultiCompanyId,
    effectiveCompany,
  } = useAuth();
  const queryClient = useQueryClient();
  const effectiveCompanyId = effectiveCompany?.id ?? selectedMultiCompanyId ?? impersonatedCompanyId ?? null;

  // Per commercialista in commercialistaMode: leggi access_mode dalla URL +
  // fetch a accountant_company_access. Determina se sbloccare canEdit*.
  // Lettura DOM-safe via window.location (no router hook in questo file).
  const commercialistaCompanyIdFromUrl =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("commercialistaCompany") ?? null
      : null;
  const { data: commercialistaAccessMode } = useCurrentCommercialistaAccessMode(
    role === "accountant" ? commercialistaCompanyIdFromUrl : null,
  );

  const staffLikeRoles = ["company_staff", "salesperson", "call_center", "employee", "subcontractor"];

  // Risolve il ruolo effettivo per la company corrente. Se l'utente ha una riga
  // multi_company_access, quella vince sul ruolo globale: evita che un admin in
  // Azienda A diventi automaticamente admin anche in Azienda B.
  const currentAccessRole = useMemo(() => {
    return resolveSelectedAccessRole({
      globalRole: role,
      accesses: multiCompanyAccesses,
      selectedCompanyId: selectedMultiCompanyId,
    });
  }, [role, multiCompanyAccesses, selectedMultiCompanyId]);
  const needsStaffPermsFetch = staffLikeRoles.includes(currentAccessRole || "");

  const {
    data: permissions,
    isLoading,
    isError: permissionsIsError,
    error: permissionsError,
  } = useQuery({
    queryKey: ["staff-permissions", user?.id, effectiveCompanyId],
    queryFn: async ({ signal }) => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("staff_permissions")
          .select(STAFF_PERMISSIONS_SELECT)
          .eq("user_id", user!.id)
          .eq("company_id", effectiveCompanyId!)
          .abortSignal(signal)
          .maybeSingle(),
        "Verifica permessi aziendali",
      );

      if (error) {
        logger.error("Error fetching permissions:", error);
        return null;
      }
      return data;
    },
    enabled: needsStaffPermsFetch && !!user?.id && !!effectiveCompanyId,
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

  const {
    data: viewAsPermsRow,
    isLoading: viewAsLoading,
    isError: viewAsIsError,
    error: viewAsError,
  } = useQuery({
    queryKey: ["staff-permissions", "view-as", viewAsUserId, effectiveCompanyId],
    queryFn: async ({ signal }) => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("staff_permissions")
          .select(STAFF_PERMISSIONS_SELECT)
          .eq("user_id", viewAsUserId!)
          .eq("company_id", effectiveCompanyId!)
          .abortSignal(signal)
          .maybeSingle(),
        "Verifica permessi visualizza come",
      );
      if (error) {
        logger.error("Error fetching view-as permissions:", error);
        return null;
      }
      return data;
    },
    enabled: viewAsNeedsDbFetch && !!effectiveCompanyId,
    staleTime: 60 * 1000,
  });

  // Item 10: Realtime invalidation — if an admin updates this user's permissions,
  // invalidate the cache so the new permissions take effect without a page reload.
  // Esteso a multi_company_user: anche loro hanno una riga staff_permissions.
  useEffect(() => {
    if (!needsStaffPermsFetch || !user?.id) return;

    // Topic canale UNIVOCO per istanza dell'effect. Con un nome fisso
    // (`staff-permissions-<uid>`) il riuso del topic — quando l'effect ri-gira
    // durante il caricamento company (effectiveCompanyId null→valore) — faceva
    // sì che supabase.channel() restituisse un canale GIÀ subscribed: il
    // successivo .on() lanciava "cannot add postgres_changes after subscribe()"
    // e l'eccezione buttava giù l'INTERA area azienda (ErrorBoundary) per gli
    // utenti company_staff. Nome univoco → canale sempre nuovo, .on() valido.
    const channelUid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${user.id}-${Math.round(Math.random() * 1e9)}`;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["staff-permissions", user.id, effectiveCompanyId] });
    };

    // La realtime invalidation è best-effort: un suo errore NON deve mai
    // crashare l'area azienda. Wrap difensivo in try/catch.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const filter = `user_id=eq.${user.id}`;
      channel = supabase
        .channel(`staff-permissions-${channelUid}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "staff_permissions", filter }, invalidate)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "staff_permissions", filter }, invalidate)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "staff_permissions", filter }, invalidate)
        .subscribe();
    } catch (e) {
      logger.error("staff-permissions realtime subscribe failed (non-bloccante):", e);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* canale già rimosso — silenzioso */
        }
      }
    };
  }, [user?.id, effectiveCompanyId, needsStaffPermsFetch, queryClient]);

  const permissionsLoadError = permissionsIsError
    ? (permissionsError instanceof Error ? permissionsError.message : "Errore nella verifica permessi")
    : null;
  const viewAsLoadError = viewAsIsError
    ? (viewAsError instanceof Error ? viewAsError.message : "Errore nella verifica permessi simulati")
    : null;

  // ─── View-as mode: il super_admin sta simulando un utente specifico ────
  // NB: valutato PRIMA dello shortcut super_admin → ALL_PERMISSIONS, altrimenti
  // il menu/pagine continuerebbero a mostrare tutto ignorando la simulazione.
  if (viewAsActive) {
    if (viewAsRole === "company_admin") return ALL_PERMISSIONS;
    if (viewAsNeedsDbFetch) {
      if (viewAsLoading) return { ...NO_PERMISSIONS, isLoading: true };
      if (viewAsLoadError) return { ...NO_PERMISSIONS, loadError: viewAsLoadError };
      // viewAsPermsRow può essere null se l'utente non ha una riga in staff_permissions:
      // in quel caso ricadiamo su NO_PERMISSIONS (fail-safe) ma non blocchiamo l'UI.
      return mapDbRowToPermissions(viewAsPermsRow);
    }
    // Ruolo senza mapping DB (es. employee/subcontractor non ha staff_permissions):
    // ricadiamo su permessi di sola lettura minimi.
    return NO_PERMISSIONS;
  }

  // Super admin and selected-company admin have all permissions.
  if (role === "super_admin" || currentAccessRole === "company_admin") {
    return ALL_PERMISSIONS;
  }

  // Commercialista: opera su un'azienda cliente delegata via
  // accountant_company_access → set di permessi limitati ma sufficienti
  // per le aree concesse (cantieri, finanza, controllo gestione, persone).
  // Se access_mode='operational' sblocchiamo anche canEdit* — il
  // commercialista può creare/modificare/cancellare. Per default (read_only
  // e approval_required) tutto resta a sola lettura: le azioni write
  // saranno gestite dalla UI con dialog di approvazione (PRIO-2).
  if (role === "accountant" || currentAccessRole === "accountant") {
    const mode = commercialistaAccessMode ?? "read_only";
    if (mode === "operational") {
      return {
        ...COMMERCIALISTA_PERMISSIONS,
        canEditOrders: true,
        canEditWarehouse: true,
        canEditCustomers: true,
        canEditTickets: true,
      };
    }
    return COMMERCIALISTA_PERMISSIONS;
  }

  // Utente multi-azienda senza company selezionata: fail-safe durante il fetch,
  // poi NO_PERMISSIONS se la configurazione non contiene un accesso valido.
  if (role === "multi_company_user" && !currentAccessRole) {
    if (multiCompanyAccesses.length === 0) {
      return { ...NO_PERMISSIONS, isLoading: true };
    }
    return NO_PERMISSIONS;
  }

  // Active impersonation session: grant full permissions ONLY after fetchUserData
  // has confirmed the super_admin role (isImpersonationReady).
  // This prevents the startup race where sessionStorage tokens are present but the
  // role has not been verified yet.
  // The actual data access is governed by server-side RLS + the impersonation token.
  const hasActiveImpersonationSession = !!impersonatedCompanyId && !!impersonationToken;
  if (
    (isImpersonationReady || (hasActiveImpersonationSession && !!effectiveCompany)) &&
    (isImpersonating || hasActiveImpersonationSession)
  ) {
    return ALL_PERMISSIONS;
  }

  // Staff-like roles: return permissions from database. This branch covers both
  // normal staff users and company_admin users downgraded to staff in the
  // selected multi-company access.
  if (staffLikeRoles.includes(currentAccessRole || "")) {
    if (!effectiveCompanyId) return { ...NO_PERMISSIONS, isLoading: true };
    if (isLoading) {
      return { ...NO_PERMISSIONS, isLoading: true };
    }
    if (permissionsLoadError) {
      return { ...NO_PERMISSIONS, loadError: permissionsLoadError };
    }

    return mapDbRowToPermissions(permissions);
  }

  // Safety net: user authenticated but role unresolved. Do not return
  // isLoading forever: this was the concrete path to infinite spinners on
  // staff-only pages when auth/profile fetch failed for a real client.
  if (user && role == null) {
    return {
      ...NO_PERMISSIONS,
      loadError: "Ruolo utente non risolto. Ricarica la sessione o accedi di nuovo.",
    };
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
