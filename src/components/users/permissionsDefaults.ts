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
