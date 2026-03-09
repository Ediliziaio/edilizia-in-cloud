import type { StaffPermissions } from "./PermissionsDialog";

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_view_calendar: false,
  can_view_customers: false, can_edit_customers: false, can_view_employees: false,
  can_view_tickets: false, can_edit_tickets: false, can_view_forecast: false,
  can_view_settings: false, can_edit_settings: false,
  can_view_marketing: false, can_edit_marketing: false,
  can_view_marketing_dashboard: false, can_view_marketing_contacts: false,
  can_edit_marketing_contacts: false, can_view_marketing_opportunities: false,
  can_edit_marketing_opportunities: false, can_view_marketing_activities: false,
  can_view_marketing_appointments: false, can_view_marketing_automations: false,
  can_view_marketing_ai_agent: false, can_view_marketing_email: false,
  can_view_marketing_whatsapp: false, can_view_marketing_reports: false,
  can_view_cruscotto: false, only_assigned: false,
  // New granular permissions
  can_export_clients: false, can_delete_orders: false, can_manage_payments: false,
  can_approve_orders: false, can_view_all_team_calendar: false, can_view_margins: false,
  can_manage_suppliers: false, can_view_financial_reports: false, can_manage_warehouse_items: false,
};

/** Centralized permission section definitions used by PermissionsDialog and UserRolesPermissionsTab */
export interface PermissionSectionDef {
  label: string;
  viewKey: keyof StaffPermissions;
  editKey: keyof StaffPermissions | null;
}

export const STANDALONE_SECTIONS: PermissionSectionDef[] = [
  { label: "Cruscotto Aziendale", viewKey: "can_view_cruscotto", editKey: null },
];

export const INTERNAL_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard", viewKey: "can_view_dashboard", editKey: null },
  { label: "Ordini", viewKey: "can_view_orders", editKey: "can_edit_orders" },
  { label: "Magazzino", viewKey: "can_view_warehouse", editKey: "can_edit_warehouse" },
  { label: "Calendario", viewKey: "can_view_calendar", editKey: null },
  { label: "Clienti", viewKey: "can_view_customers", editKey: "can_edit_customers" },
  { label: "Dipendenti", viewKey: "can_view_employees", editKey: null },
  { label: "Assistenza", viewKey: "can_view_tickets", editKey: "can_edit_tickets" },
  { label: "Previsionale", viewKey: "can_view_forecast", editKey: null },
  { label: "Impostazioni", viewKey: "can_view_settings", editKey: "can_edit_settings" },
];

export const GRANULAR_SECTIONS: PermissionSectionDef[] = [
  { label: "Esporta Clienti", viewKey: "can_export_clients", editKey: null },
  { label: "Elimina Ordini", viewKey: "can_delete_orders", editKey: null },
  { label: "Gestisci Pagamenti", viewKey: "can_manage_payments", editKey: null },
  { label: "Approva Ordini", viewKey: "can_approve_orders", editKey: null },
  { label: "Calendario Team Completo", viewKey: "can_view_all_team_calendar", editKey: null },
  { label: "Visualizza Margini", viewKey: "can_view_margins", editKey: null },
  { label: "Gestisci Fornitori", viewKey: "can_manage_suppliers", editKey: null },
  { label: "Report Finanziari", viewKey: "can_view_financial_reports", editKey: null },
  { label: "Gestisci Articoli Magazzino", viewKey: "can_manage_warehouse_items", editKey: null },
];

export const MARKETING_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard Marketing", viewKey: "can_view_marketing_dashboard", editKey: null },
  { label: "Contatti", viewKey: "can_view_marketing_contacts", editKey: "can_edit_marketing_contacts" },
  { label: "Opportunità", viewKey: "can_view_marketing_opportunities", editKey: "can_edit_marketing_opportunities" },
  { label: "Attività", viewKey: "can_view_marketing_activities", editKey: null },
  { label: "Appuntamenti", viewKey: "can_view_marketing_appointments", editKey: null },
  { label: "Automazioni", viewKey: "can_view_marketing_automations", editKey: null },
  { label: "Agente AI", viewKey: "can_view_marketing_ai_agent", editKey: null },
  { label: "Email Marketing", viewKey: "can_view_marketing_email", editKey: null },
  { label: "WhatsApp", viewKey: "can_view_marketing_whatsapp", editKey: null },
  { label: "Reportistica", viewKey: "can_view_marketing_reports", editKey: null },
];

export const ALL_PERMISSION_SECTIONS: PermissionSectionDef[] = [
  ...STANDALONE_SECTIONS, ...INTERNAL_SECTIONS, ...MARKETING_SECTIONS,
];
