// Default COMPLETI di staff_permissions per le edge di creazione utenti.
// Problema risolto: le create-* filtravano i permessi con una whitelist di ~16
// chiavi, scartando in silenzio tutto il granulare (preventivi, CRM, firma,
// team, ecc.). L'insert deve essere già completo: il follow-up update del
// client resta solo come rete di sicurezza, non come unico veicolo.
//
// I VALORI rispecchiano i default delle colonne in DB (tutto false tranne
// can_view_formazione e can_view_order_amounts): chi NON passa `permissions`
// ottiene esattamente la riga che otteneva prima con l'insert minimale.
// Il file è dependency-free così la suite vitest lo importa e verifica la
// parità di chiavi con DEFAULT_PERMISSIONS lato client (drift = test rosso).
// NB: must_change_password NON è un permesso e resta fuori (default DB: true).

export const STAFF_PERMISSION_DEFAULTS: Record<string, boolean | string[]> = {
  // Cruscotto
  can_view_cruscotto: false, can_view_controllo_gestione: false,
  // Cantieri & Lavori
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_view_order_amounts: true,
  can_approve_orders: false, can_delete_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_manage_warehouse_items: false,
  can_view_mezzi: false, can_edit_mezzi: false,
  can_view_calendar: false, can_view_all_team_calendar: false,
  can_view_team_tasks: false,
  can_view_customers: false, can_edit_customers: false, can_export_clients: false,
  can_view_tickets: false, can_edit_tickets: false,
  can_view_interventi: false, can_view_manutenzione: false,
  can_view_sicurezza_cantiere: false, can_view_subappaltatori: false,
  can_view_firma_elettronica: false,
  // Finanza
  can_view_billing: false, can_view_scadenzario: false, can_view_tesoreria: false,
  can_view_prima_nota: false,
  can_view_costs: false, can_view_forecast: false,
  can_view_financial_reports: false, can_view_margins: false,
  can_manage_payments: false, can_manage_suppliers: false,
  // Persone
  can_view_persone: false, can_view_employees: false, can_view_users: false,
  can_view_giornale_lavori: false, can_view_messaggi_esterni: false,
  can_edit_giornale_lavori: false,
  can_view_sopralluoghi: false, can_view_preventivi: false, can_edit_preventivi: false,
  can_view_formazione: true, can_manage_portal: false,
  // Marketing & Vendita
  can_view_marketing: false, can_edit_marketing: false,
  can_view_marketing_dashboard: false, can_view_marketing_contacts: false,
  can_edit_marketing_contacts: false, can_view_marketing_opportunities: false,
  can_edit_marketing_opportunities: false, can_view_marketing_activities: false,
  can_view_marketing_appointments: false,
  can_view_marketing_email: false, can_view_marketing_whatsapp: false,
  can_view_marketing_reports: false,
  can_view_reputazione: false,
  // Automazioni & AI
  can_view_marketing_automations: false, can_view_marketing_ai_agent: false,
  can_view_automazioni: false, can_view_render_ai: false,
  can_view_sales_os: false, can_view_sms_marketing: false,
  // Impostazioni (aggregate legacy + granulari)
  can_view_settings: false, can_edit_settings: false,
  can_view_settings_profile: false, can_edit_settings_profile: false,
  can_view_settings_orders: false, can_edit_settings_orders: false,
  can_view_settings_customization: false, can_edit_settings_customization: false,
  can_view_settings_people: false, can_edit_settings_people: false,
  can_view_settings_security: false,
  can_view_settings_pricing: false, can_edit_settings_pricing: false,
  can_view_settings_scontistica: false, can_edit_settings_scontistica: false,
  can_view_settings_finanziamenti: false, can_edit_settings_finanziamenti: false,
  can_view_settings_bundle: false, can_edit_settings_bundle: false,
  can_view_settings_suppliers: false, can_edit_settings_suppliers: false,
  can_view_settings_integrations: false, can_edit_settings_integrations: false,
  // Speciali
  can_approve_discounts: false,
  only_assigned: false,
  only_my_warehouse: false,
  // Vede ma non scrive. Le can_edit_* operative le ricalcola comunque il
  // trigger permessi_modifica_segue_visibilita dalla visibilità.
  sola_lettura: false,
  visible_areas: [],
  // Pipeline che l'utente vede (vuoto = tutte). La regola la applica il
  // database con policy RESTRICTIVE; qui serve perché l'utente nasca già con
  // la scelta fatta nella creazione (prima la chiave veniva scartata).
  pipeline_visibili: [],
};

/**
 * Preset per ruolo: gli stessi di ROLE_PRESETS nel client
 * (src/components/users/permissionsDefaults.ts). Il test
 * staffPermissionsEdgeParity li confronta: un preset cambiato da una parte
 * sola lo fa diventare rosso. Prima i preset vivevano solo nel client, e chi
 * riceveva un accesso da una funzione del server nasceva con tutto spento.
 * Le can_edit_* operative le deriva il trigger permessi_modifica_segue_visibilita.
 */
export const STAFF_ROLE_PRESETS: Record<string, Record<string, boolean | string[]>> = {
  company_admin: {},
  company_staff: {
    can_view_dashboard: true,
    can_view_orders: true,
    can_view_warehouse: true, can_manage_warehouse_items: true,
    can_view_mezzi: true,
    can_view_calendar: true, can_view_all_team_calendar: true,
    can_view_customers: true,
    can_view_tickets: true,
    can_view_interventi: true,
    can_view_manutenzione: true,
    can_view_employees: true, can_view_persone: true, can_view_users: true,
    can_view_giornale_lavori: true,
    can_view_formazione: true,
    can_view_firma_elettronica: true,
    can_view_billing: true, can_view_prima_nota: true,
    can_view_costs: true,
    can_manage_payments: true, can_manage_suppliers: true,
  },
  // Il venditore, di serie, vede solo Marketing & Vendita (25/09/2026).
  salesperson: {
    can_view_formazione: true,
    can_view_marketing_dashboard: true,
    can_view_marketing_contacts: true,
    can_view_marketing_opportunities: true,
    can_view_preventivi: true,
    can_view_sopralluoghi: true,
    can_view_marketing_activities: true,
    can_view_marketing_appointments: true,
    can_view_marketing_reports: true,
    can_view_reputazione: true,
    can_view_sales_os: true,
    can_view_marketing: true,
    visible_areas: ["commerciale"],
  },
  call_center: {
    can_view_dashboard: true,
    can_view_calendar: true,
    can_view_customers: true,
    can_view_users: true,
    can_view_marketing_contacts: true,
    can_view_marketing_opportunities: true,
    can_view_preventivi: true,
    can_view_sopralluoghi: true,
    can_view_marketing_activities: true,
    can_view_marketing_appointments: true,
    can_view_marketing: true,
    can_view_formazione: true,
    visible_areas: ["commerciale"],
  },
  employee: {
    can_view_calendar: true,
    can_view_giornale_lavori: true,
    can_view_formazione: true,
    can_view_order_amounts: false,
    only_assigned: true,
    visible_areas: ["cantiere"],
  },
  subcontractor: {
    can_view_orders: true,
    can_view_calendar: true,
    can_view_customers: true,
    can_view_subappaltatori: true,
    can_view_formazione: true,
    can_view_firma_elettronica: true,
    can_view_order_amounts: false,
    only_assigned: true,
    visible_areas: ["cantiere"],
  },
};

// pipeline_visibili è uuid[] in DB: una stringa che non è un id farebbe
// fallire l'INSERT dell'utente intero.
const ID_PIPELINE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record pronto per l'INSERT/UPSERT su staff_permissions: default completi +
 * merge delle sole chiavi note dal payload (id/user_id/company_id/timestamp e
 * chiavi ignote vengono ignorati; i booleani accettano solo boolean veri,
 * visible_areas solo array di stringhe, pipeline_visibili solo id di pipeline).
 */
export function buildStaffPermissionsRecord(
  userId: string,
  companyId: string,
  permissions?: Record<string, unknown> | null,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    user_id: userId,
    company_id: companyId,
    ...STAFF_PERMISSION_DEFAULTS,
  };
  if (permissions && typeof permissions === "object") {
    for (const [key, value] of Object.entries(permissions)) {
      if (!(key in STAFF_PERMISSION_DEFAULTS)) continue;
      if (key === "visible_areas") {
        if (Array.isArray(value)) record[key] = value.filter((v) => typeof v === "string");
      } else if (key === "pipeline_visibili") {
        if (Array.isArray(value)) record[key] = value.filter((v) => typeof v === "string" && ID_PIPELINE.test(v));
      } else if (typeof value === "boolean") {
        record[key] = value;
      }
    }
  }
  return record;
}
