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
};

/** Centralized permission section definitions used by PermissionsDialog and CreateUserWizard */
export interface PermissionSectionDef {
  label: string;
  viewKey: keyof StaffPermissions;
  editKey: keyof StaffPermissions | null;
}

export const STANDALONE_SECTIONS: PermissionSectionDef[] = [
  { label: "Cruscotto — KPI e performance aziendali", viewKey: "can_view_cruscotto", editKey: null },
];

export const INTERNAL_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard", viewKey: "can_view_dashboard", editKey: null },
  { label: "Ordini e Commesse", viewKey: "can_view_orders", editKey: "can_edit_orders" },
  { label: "Magazzino", viewKey: "can_view_warehouse", editKey: "can_edit_warehouse" },
  { label: "Calendario", viewKey: "can_view_calendar", editKey: null },
  { label: "Clienti", viewKey: "can_view_customers", editKey: "can_edit_customers" },
  { label: "Dipendenti", viewKey: "can_view_employees", editKey: null },
  { label: "Assistenza / Ticket", viewKey: "can_view_tickets", editKey: "can_edit_tickets" },
  { label: "Previsionale", viewKey: "can_view_forecast", editKey: null },
  { label: "Impostazioni", viewKey: "can_view_settings", editKey: "can_edit_settings" },
];

export const MARKETING_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard Marketing", viewKey: "can_view_marketing_dashboard", editKey: null },
  { label: "Contatti CRM", viewKey: "can_view_marketing_contacts", editKey: "can_edit_marketing_contacts" },
  { label: "Opportunità", viewKey: "can_view_marketing_opportunities", editKey: "can_edit_marketing_opportunities" },
  { label: "Attività", viewKey: "can_view_marketing_activities", editKey: null },
  { label: "Appuntamenti", viewKey: "can_view_marketing_appointments", editKey: null },
  { label: "Automazioni", viewKey: "can_view_marketing_automations", editKey: null },
  { label: "Agente AI", viewKey: "can_view_marketing_ai_agent", editKey: null },
  { label: "Email Marketing", viewKey: "can_view_marketing_email", editKey: null },
  { label: "WhatsApp", viewKey: "can_view_marketing_whatsapp", editKey: null },
  { label: "Reportistica Marketing", viewKey: "can_view_marketing_reports", editKey: null },
];

export const ALL_PERMISSION_SECTIONS: PermissionSectionDef[] = [
  ...STANDALONE_SECTIONS, ...INTERNAL_SECTIONS, ...MARKETING_SECTIONS,
];

/** Role presets applied when selecting a role in the wizard */
export type StaffRoleType = "company_admin" | "company_staff" | "salesperson" | "call_center";

export const ROLE_PRESETS: Record<StaffRoleType, Partial<StaffPermissions>> = {
  company_admin: {}, // Admin has full access, no granular permissions needed
  company_staff: {
    can_view_dashboard: true, can_view_orders: true, can_edit_orders: true,
    can_view_warehouse: true, can_view_calendar: true, can_view_customers: true,
    can_view_employees: true,
  },
  salesperson: {
    can_view_dashboard: true, can_view_orders: true, can_view_customers: true,
    can_edit_customers: true, can_view_calendar: true,
    can_view_marketing_dashboard: true, can_view_marketing_contacts: true,
    can_edit_marketing_contacts: true, can_view_marketing_opportunities: true,
    can_edit_marketing_opportunities: true, can_view_marketing_activities: true,
    can_view_marketing_appointments: true, can_view_marketing_reports: true,
    can_view_marketing: true, can_edit_marketing: true,
  },
  call_center: {
    can_view_dashboard: true, can_view_customers: true, can_edit_customers: true,
    can_view_calendar: true, can_view_marketing_contacts: true,
    can_edit_marketing_contacts: true, can_view_marketing_opportunities: true,
    can_view_marketing_activities: true, can_view_marketing_appointments: true,
    can_view_marketing: true,
  },
};

/** Sync legacy marketing flags from granular ones */
export function syncLegacyMarketingFlags(perms: StaffPermissions): StaffPermissions {
  const hasAnyView = perms.can_view_marketing_dashboard || perms.can_view_marketing_contacts ||
    perms.can_view_marketing_opportunities || perms.can_view_marketing_activities ||
    perms.can_view_marketing_appointments || perms.can_view_marketing_automations ||
    perms.can_view_marketing_ai_agent || perms.can_view_marketing_email ||
    perms.can_view_marketing_whatsapp || perms.can_view_marketing_reports;
  const hasAnyEdit = perms.can_edit_marketing_contacts || perms.can_edit_marketing_opportunities;
  return {
    ...perms,
    can_view_marketing: hasAnyView || perms.can_view_marketing,
    can_edit_marketing: hasAnyEdit || perms.can_edit_marketing,
  };
}
