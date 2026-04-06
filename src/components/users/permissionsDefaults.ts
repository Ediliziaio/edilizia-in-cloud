import type { StaffPermissions } from "./PermissionsDialog";

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  // Cruscotto
  can_view_cruscotto: false,
  // Cantieri & Lavori
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_approve_orders: false, can_delete_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_manage_warehouse_items: false,
  can_view_calendar: false, can_view_all_team_calendar: false,
  can_view_customers: false, can_edit_customers: false, can_export_clients: false,
  can_view_tickets: false, can_edit_tickets: false,
  can_view_interventi: false, can_view_manutenzione: false,
  can_view_sicurezza_cantiere: false, can_view_subappaltatori: false,
  // Finanza
  can_view_billing: false, can_view_scadenzario: false, can_view_tesoreria: false,
  can_view_prima_nota: false,
  can_view_costs: false, can_view_forecast: false,
  can_view_financial_reports: false, can_view_margins: false,
  can_manage_payments: false, can_manage_suppliers: false,
  // Persone
  can_view_persone: false, can_view_employees: false, can_view_users: false,
  can_view_giornale_lavori: false, can_view_messaggi_esterni: false,
  // Marketing & Vendita
  can_view_marketing: false, can_edit_marketing: false,
  can_view_marketing_dashboard: false, can_view_marketing_contacts: false,
  can_edit_marketing_contacts: false, can_view_marketing_opportunities: false,
  can_edit_marketing_opportunities: false, can_view_marketing_activities: false,
  can_view_marketing_appointments: false,
  can_view_marketing_email: false, can_view_marketing_whatsapp: false,
  can_view_marketing_reports: false,
  // Automazioni & AI
  can_view_marketing_automations: false, can_view_marketing_ai_agent: false,
  can_view_automazioni: false, can_view_render_ai: false,
  can_view_sales_os: false, can_view_sms_marketing: false,
  // Impostazioni (legacy aggregate – auto-computed on save)
  can_view_settings: false, can_edit_settings: false,
  // Impostazioni granulari
  can_view_settings_profile: false, can_edit_settings_profile: false,
  can_view_settings_orders: false, can_edit_settings_orders: false,
  can_view_settings_customization: false, can_edit_settings_customization: false,
  can_view_settings_people: false, can_edit_settings_people: false,
  can_view_settings_security: false,
  // Speciali
  only_assigned: false,
};

/** Centralized permission section definitions used by PermissionsDialog, UserRolesPermissionsTab and CreateUserWizard */
export interface PermissionSectionDef {
  label: string;
  viewKey: keyof StaffPermissions;
  editKey: keyof StaffPermissions | null;
}

// ─── 7 macro-aree allineate alla sidebar ───────────────────────────────────

export const CRUSCOTTO_SECTIONS: PermissionSectionDef[] = [
  { label: "Cruscotto Aziendale", viewKey: "can_view_cruscotto", editKey: null },
];

export const CANTIERI_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard",              viewKey: "can_view_dashboard",          editKey: null },
  { label: "Ordini e Commesse",      viewKey: "can_view_orders",             editKey: "can_edit_orders" },
  { label: "Approva Ordini",         viewKey: "can_approve_orders",          editKey: null },
  { label: "Elimina Ordini",         viewKey: "can_delete_orders",           editKey: null },
  { label: "Magazzino",              viewKey: "can_view_warehouse",          editKey: "can_edit_warehouse" },
  { label: "Gestione Articoli",      viewKey: "can_manage_warehouse_items",  editKey: null },
  { label: "Calendario",             viewKey: "can_view_calendar",           editKey: null },
  { label: "Calendario del team",    viewKey: "can_view_all_team_calendar",  editKey: null },
  { label: "Clienti",                viewKey: "can_view_customers",          editKey: "can_edit_customers" },
  { label: "Esporta Clienti",        viewKey: "can_export_clients",          editKey: null },
  { label: "Ticket Assistenza",      viewKey: "can_view_tickets",            editKey: "can_edit_tickets" },
  { label: "Interventi",             viewKey: "can_view_interventi",         editKey: null },
  { label: "Manutenzione",           viewKey: "can_view_manutenzione",       editKey: null },
  { label: "Sicurezza Cantiere",     viewKey: "can_view_sicurezza_cantiere", editKey: null },
  { label: "Subappaltatori",         viewKey: "can_view_subappaltatori",     editKey: null },
];

export const FINANZA_SECTIONS: PermissionSectionDef[] = [
  { label: "Fatturazione",               viewKey: "can_view_billing",           editKey: null },
  { label: "Scadenzario",                viewKey: "can_view_scadenzario",       editKey: null },
  { label: "Tesoreria",                  viewKey: "can_view_tesoreria",         editKey: null },
  { label: "Prima Nota e Contabilità",   viewKey: "can_view_prima_nota",        editKey: null },
  { label: "Costi",                      viewKey: "can_view_costs",             editKey: null },
  { label: "Previsionale",               viewKey: "can_view_forecast",          editKey: null },
  { label: "Report Finanziari",          viewKey: "can_view_financial_reports", editKey: null },
  { label: "Visualizza Margini",         viewKey: "can_view_margins",           editKey: null },
  { label: "Gestione Pagamenti",         viewKey: "can_manage_payments",        editKey: null },
  { label: "Gestione Fornitori",         viewKey: "can_manage_suppliers",       editKey: null },
];

export const PERSONE_SECTIONS: PermissionSectionDef[] = [
  { label: "Personale, Chat e Messaggistica", viewKey: "can_view_persone",          editKey: null },
  { label: "Gestione Dipendenti",             viewKey: "can_view_employees",         editKey: null },
  { label: "Utenti & Team",                   viewKey: "can_view_users",             editKey: null },
  { label: "Giornale Lavori",                 viewKey: "can_view_giornale_lavori",   editKey: null },
  { label: "Messaggi Esterni",                viewKey: "can_view_messaggi_esterni",  editKey: null },
];

export const MARKETING_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard Marketing",     viewKey: "can_view_marketing_dashboard",      editKey: null },
  { label: "Contatti CRM",            viewKey: "can_view_marketing_contacts",       editKey: "can_edit_marketing_contacts" },
  { label: "Opportunità",             viewKey: "can_view_marketing_opportunities",  editKey: "can_edit_marketing_opportunities" },
  { label: "Preventivi CRM",          viewKey: "can_view_marketing_opportunities",  editKey: null },
  { label: "Attività",                viewKey: "can_view_marketing_activities",     editKey: null },
  { label: "Appuntamenti",            viewKey: "can_view_marketing_appointments",   editKey: null },
  { label: "Email Marketing",         viewKey: "can_view_marketing_email",          editKey: null },
  { label: "SMS Marketing",           viewKey: "can_view_sms_marketing",            editKey: null },
  { label: "WhatsApp",                viewKey: "can_view_marketing_whatsapp",       editKey: null },
  { label: "Sales OS",                viewKey: "can_view_sales_os",                 editKey: null },
  { label: "Reportistica Marketing",  viewKey: "can_view_marketing_reports",        editKey: null },
];

export const AUTOMAZIONI_SECTIONS: PermissionSectionDef[] = [
  { label: "Automazioni",  viewKey: "can_view_automazioni",          editKey: null },
  { label: "Agenti AI",    viewKey: "can_view_marketing_ai_agent",   editKey: null },
  { label: "Render AI",    viewKey: "can_view_render_ai",            editKey: null },
];

export const IMPOSTAZIONI_SECTIONS: PermissionSectionDef[] = [
  { label: "Profilo Aziendale",    viewKey: "can_view_settings_profile",       editKey: "can_edit_settings_profile" },
  { label: "Gestione Ordini",      viewKey: "can_view_settings_orders",         editKey: "can_edit_settings_orders" },
  { label: "Personalizzazione",    viewKey: "can_view_settings_customization",  editKey: "can_edit_settings_customization" },
  { label: "Team & Persone",       viewKey: "can_view_settings_people",         editKey: "can_edit_settings_people" },
  { label: "Sicurezza & Privacy",  viewKey: "can_view_settings_security",       editKey: null },
];

export const ALL_PERMISSION_SECTIONS: PermissionSectionDef[] = [
  ...CRUSCOTTO_SECTIONS,
  ...CANTIERI_SECTIONS,
  ...FINANZA_SECTIONS,
  ...PERSONE_SECTIONS,
  ...MARKETING_SECTIONS,
  ...AUTOMAZIONI_SECTIONS,
  ...IMPOSTAZIONI_SECTIONS,
];

/** @deprecated Use the macro-area arrays instead */
export const STANDALONE_SECTIONS = CRUSCOTTO_SECTIONS;
/** @deprecated Use CANTIERI_SECTIONS + FINANZA_SECTIONS instead */
export const INTERNAL_SECTIONS = CANTIERI_SECTIONS;

// ─── Ruoli ─────────────────────────────────────────────────────────────────

export type StaffRoleType =
  | "company_admin"
  | "company_staff"
  | "salesperson"
  | "call_center"
  | "worker"
  | "subcontractor";

export const ROLE_PRESETS: Record<StaffRoleType, Partial<StaffPermissions>> = {
  company_admin: {},

  company_staff: {
    can_view_dashboard: true,
    can_view_orders: true, can_edit_orders: true,
    can_view_warehouse: true, can_manage_warehouse_items: true,
    can_view_calendar: true, can_view_all_team_calendar: true,
    can_view_customers: true,
    can_view_tickets: true,
    can_view_interventi: true,
    can_view_manutenzione: true,
    can_view_employees: true, can_view_persone: true, can_view_users: true,
    can_view_giornale_lavori: true,
    can_view_billing: true, can_view_prima_nota: true,
    can_view_costs: true,
    can_manage_payments: true, can_manage_suppliers: true,
  },

  salesperson: {
    can_view_dashboard: true,
    can_view_orders: true,
    can_view_calendar: true,
    can_view_customers: true, can_edit_customers: true,
    can_view_users: true,
    can_view_margins: true,
    can_view_marketing_dashboard: true,
    can_view_marketing_contacts: true, can_edit_marketing_contacts: true,
    can_view_marketing_opportunities: true, can_edit_marketing_opportunities: true,
    can_view_marketing_activities: true,
    can_view_marketing_appointments: true,
    can_view_marketing_reports: true,
    can_view_sales_os: true,
    can_view_marketing: true, can_edit_marketing: true,
  },

  call_center: {
    can_view_dashboard: true,
    can_view_calendar: true,
    can_view_customers: true, can_edit_customers: true,
    can_view_users: true,
    can_view_marketing_contacts: true, can_edit_marketing_contacts: true,
    can_view_marketing_opportunities: true,
    can_view_marketing_activities: true,
    can_view_marketing_appointments: true,
    can_view_marketing: true,
  },

  worker: {
    can_view_calendar: true,
    can_view_giornale_lavori: true,
    only_assigned: true,
  },

  subcontractor: {
    can_view_orders: true,
    can_view_calendar: true,
    can_view_customers: true,
    can_view_subappaltatori: true,
    only_assigned: true,
  },
};

/** Sincronizza il flag legacy can_view_settings dai permessi granulari */
export function syncLegacySettingsFlags(perms: StaffPermissions): StaffPermissions {
  const hasAnyView =
    perms.can_view_settings_profile || perms.can_view_settings_orders ||
    perms.can_view_settings_customization || perms.can_view_settings_people ||
    perms.can_view_settings_security;
  const hasAnyEdit =
    perms.can_edit_settings_profile || perms.can_edit_settings_orders ||
    perms.can_edit_settings_customization || perms.can_edit_settings_people;
  return {
    ...perms,
    can_view_settings: hasAnyView || perms.can_view_settings,
    can_edit_settings: hasAnyEdit || perms.can_edit_settings,
  };
}

/** Sincronizza i flag legacy marketing dai permessi granulari */
export function syncLegacyMarketingFlags(perms: StaffPermissions): StaffPermissions {
  const hasAnyView =
    perms.can_view_marketing_dashboard || perms.can_view_marketing_contacts ||
    perms.can_view_marketing_opportunities || perms.can_view_marketing_activities ||
    perms.can_view_marketing_appointments || perms.can_view_marketing_automations ||
    perms.can_view_marketing_ai_agent || perms.can_view_marketing_email ||
    perms.can_view_sms_marketing ||
    perms.can_view_marketing_whatsapp || perms.can_view_marketing_reports ||
    perms.can_view_sales_os;
  const hasAnyEdit = perms.can_edit_marketing_contacts || perms.can_edit_marketing_opportunities;
  return {
    ...perms,
    can_view_marketing: hasAnyView || perms.can_view_marketing,
    can_edit_marketing: hasAnyEdit || perms.can_edit_marketing,
  };
}
