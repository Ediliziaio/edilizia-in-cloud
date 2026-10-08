// Call center di piattaforma: chi fa le chiamate per il CRM di EiC (contatti, opportunità, calendario)
// dall'area super admin e non vede altro.
//
// Come funziona:
//  - ruolo `platform_callcenter` (accede a /admin) con il solo permesso `crm_operatore`;
//  - il profilo è legato all'azienda Piattaforma, e i permessi sul CRM stanno in `staff_permissions` per quella
//    azienda: sono quelli che le regole di accesso ai dati (RLS) leggono, come per ogni staff;
//  - niente campagne, automazioni, statistiche, incassi né posta: restano spenti.
//
// Dependency-free: lo importano anche i test.

export const PIATTAFORMA_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

/** I permessi sul CRM della piattaforma, a parte i default (tutto spento). */
export const CALLCENTER_PIATTAFORMA_PERMESSI: Record<string, boolean> = {
  can_view_marketing: true,
  can_view_marketing_contacts: true,
  can_edit_marketing_contacts: true,
  can_view_marketing_opportunities: true,
  can_edit_marketing_opportunities: true,
  can_view_marketing_activities: true,
  can_view_marketing_appointments: true,
  can_view_calendar: true,
};

/** Cosa NON deve mai avere: se compare qui sopra, il test fallisce. */
export const PERMESSI_VIETATI_AL_CALLCENTER = [
  "can_view_marketing_email",
  "can_view_marketing_whatsapp",
  "can_view_sms_marketing",
  "can_view_marketing_automations",
  "can_view_marketing_ai_agent",
  "can_view_marketing_reports",
  "can_view_marketing_dashboard",
  "can_view_billing",
  "can_view_settings",
  "can_edit_settings",
  "can_view_settings_customization",
  "can_edit_settings_customization",
  "can_view_users",
  "can_view_customers",
  "can_export_clients",
];

/** Il permesso `crm_operatore` di super_admin_permissions per il ruolo. */
export const PRESET_CALLCENTER_ADMIN = {
  can_manage_companies: false,
  can_manage_plans: false,
  can_manage_tickets: false,
  can_manage_referrals: false,
  can_manage_admins: false,
  can_view_platform_stats: false,
  can_manage_marketing: false,
  crm_operatore: true,
};
