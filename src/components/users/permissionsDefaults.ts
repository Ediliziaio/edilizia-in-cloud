import type { StaffPermissions } from "./PermissionsDialog";

export const DEFAULT_PERMISSIONS: StaffPermissions = {
  // Cruscotto
  can_view_cruscotto: false, can_view_controllo_gestione: false,
  // Cantieri & Lavori
  can_view_dashboard: false, can_view_orders: false, can_edit_orders: false,
  can_view_order_amounts: true,
  can_approve_orders: false, can_delete_orders: false,
  can_view_warehouse: false, can_edit_warehouse: false, can_manage_warehouse_items: false,
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
  // 2026-07-12: mancava qui pur essendo colonna DB + toggle nella tab utente →
  // buildStaffPermissionsUpdate lo filtrava e "Approva Sconti" non salvava MAI.
  can_approve_discounts: false,
  can_view_formazione: false, can_manage_portal: false,
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
  // Impostazioni (legacy aggregate – auto-computed on save)
  can_view_settings: false, can_edit_settings: false,
  // Impostazioni granulari
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
  only_assigned: false,
  only_my_warehouse: false,
  visible_areas: [],
};

/** Centralized permission section definitions used by PermissionsDialog, UserRolesPermissionsTab and CreateUserWizard */
export interface PermissionSectionDef {
  label: string;
  viewKey: BooleanPermissionKey;
  editKey: BooleanPermissionKey | null;
  /** Una riga di spiegazione mostrata sotto la label nelle dialog permessi. */
  description?: string;
}

// ─── Visibilità dati economici (modello a 3 livelli) ───────────────────────
// Condiviso tra UserRolesPermissionsTab e CreateUserWizard: un solo posto
// dove vive la semantica Operativo/Commerciale/Pieno.
export type EconomicLevelId = "operativo" | "commerciale" | "pieno";

export const ECONOMIC_LEVELS: {
  id: EconomicLevelId;
  label: string;
  desc: string;
  values: Record<"can_view_order_amounts" | "can_view_costs" | "can_view_margins", boolean>;
}[] = [
  { id: "operativo",   label: "Operativo",   desc: "Conteggi, date, articoli e stati. Nessun importo, costo o margine.", values: { can_view_order_amounts: false, can_view_costs: false, can_view_margins: false } },
  { id: "commerciale", label: "Commerciale", desc: "Vede importi di vendita e incassi, ma NON costi né margini.",        values: { can_view_order_amounts: true,  can_view_costs: false, can_view_margins: false } },
  { id: "pieno",       label: "Pieno",       desc: "Vede importi, costi e margini su commesse, lista e PDF.",             values: { can_view_order_amounts: true,  can_view_costs: true,  can_view_margins: true } },
];

export function detectEconomicLevel(p: StaffPermissions): EconomicLevelId | "custom" {
  for (const lvl of ECONOMIC_LEVELS) {
    const keys = Object.keys(lvl.values) as (keyof typeof lvl.values)[];
    if (keys.every((k) => !!p[k] === lvl.values[k])) return lvl.id;
  }
  return "custom";
}

/** Chiavi permesso a valore boolean (esclude visible_areas: string[]).
 *  Usarla per viewKey/editKey/toggle evita gli errori `boolean & string[]`
 *  quando si scrive permissions[key] = true/false. */
export type BooleanPermissionKey = {
  [K in keyof StaffPermissions]: StaffPermissions[K] extends boolean ? K : never;
}[keyof StaffPermissions];

// ─── 7 macro-aree allineate alla sidebar ───────────────────────────────────

export const CRUSCOTTO_SECTIONS: PermissionSectionDef[] = [
  { label: "Cruscotto Aziendale",    viewKey: "can_view_cruscotto",            editKey: null, description: "Centro di controllo executive unificato" },
  { label: "Controllo di Gestione",  viewKey: "can_view_controllo_gestione",   editKey: null, description: "Direzione & bilancio: conto economico, KPI, tesoreria (CFO)" },
];

export const CANTIERI_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard",              viewKey: "can_view_dashboard",          editKey: null, description: "Visualizza la dashboard principale" },
  { label: "Ordini e Commesse",      viewKey: "can_view_orders",             editKey: "can_edit_orders", description: "Senza «Modifica» le commesse si vedono soltanto. Con «Modifica» si creano e si modificano — e si può registrare il cliente da intestare alla commessa" },
  { label: "Importi di vendita",     viewKey: "can_view_order_amounts",      editKey: null, description: "Vede importi e prezzi di vendita in commesse e preventivi" },
  { label: "Approva Ordini",         viewKey: "can_approve_orders",          editKey: null, description: "Può approvare ordini e commesse" },
  { label: "Elimina Ordini",         viewKey: "can_delete_orders",           editKey: null, description: "Può eliminare ordini e commesse" },
  { label: "Magazzino",              viewKey: "can_view_warehouse",          editKey: "can_edit_warehouse", description: "Gestisci inventario e movimenti" },
  { label: "Gestione Articoli",      viewKey: "can_manage_warehouse_items",  editKey: null, description: "Gestisci articoli e listino magazzino" },
  { label: "Calendario",             viewKey: "can_view_calendar",           editKey: null, description: "Visualizza e gestisci il calendario" },
  { label: "Clienti",                viewKey: "can_view_customers",          editKey: "can_edit_customers", description: "Gestisci anagrafica clienti" },
  { label: "Esporta Clienti",        viewKey: "can_export_clients",          editKey: null, description: "Esporta l'anagrafica clienti in CSV" },
  { label: "Ticket Assistenza",      viewKey: "can_view_tickets",            editKey: "can_edit_tickets", description: "Gestisci ticket di supporto" },
  { label: "Interventi",             viewKey: "can_view_interventi",         editKey: null, description: "Gestisci interventi tecnici pianificati" },
  { label: "Manutenzione",           viewKey: "can_view_manutenzione",       editKey: null, description: "Gestisci piani di manutenzione programmata" },
  { label: "Sicurezza Cantiere",     viewKey: "can_view_sicurezza_cantiere", editKey: null, description: "Accesso al modulo sicurezza e PSC" },
  { label: "Subappaltatori",          viewKey: "can_view_subappaltatori",     editKey: null, description: "Visualizza e gestisci subappaltatori" },
  { label: "Firma Elettronica (FEA)", viewKey: "can_view_firma_elettronica",  editKey: null, description: "Modulo firma elettronica avanzata (cantieri e CRM)" },
];

export const FINANZA_SECTIONS: PermissionSectionDef[] = [
  { label: "Fatturazione",               viewKey: "can_view_billing",           editKey: null, description: "Fatture, note di credito e documenti fiscali" },
  { label: "Scadenzario",                viewKey: "can_view_scadenzario",       editKey: null, description: "Scadenze attive e passive" },
  { label: "Tesoreria",                  viewKey: "can_view_tesoreria",         editKey: null, description: "Conti bancari, saldi e riconciliazione" },
  { label: "Prima Nota e Contabilità",   viewKey: "can_view_prima_nota",        editKey: null, description: "Registrazioni di prima nota" },
  { label: "Costi",                      viewKey: "can_view_costs",             editKey: null, description: "Costi aziendali e per commessa" },
  { label: "Previsionale",               viewKey: "can_view_forecast",          editKey: null, description: "Proiezioni di cassa e previsionale" },
  { label: "Report Finanziari",          viewKey: "can_view_financial_reports", editKey: null, description: "Report e analisi finanziarie" },
  { label: "Visualizza Margini",         viewKey: "can_view_margins",           editKey: null, description: "Margini per commessa, lista e PDF" },
  { label: "Gestione Pagamenti",         viewKey: "can_manage_payments",        editKey: null, description: "Registra incassi e pagamenti" },
  { label: "Gestione Fornitori",         viewKey: "can_manage_suppliers",       editKey: null, description: "Anagrafica e rapporti fornitori" },
];

export const PERSONE_SECTIONS: PermissionSectionDef[] = [
  { label: "Personale, Chat e Messaggistica", viewKey: "can_view_persone",          editKey: null, description: "HR, chat team e messaggi interni" },
  { label: "Gestione Dipendenti",             viewKey: "can_view_employees",         editKey: null, description: "Schede dipendenti e presenze" },
  { label: "Utenti & Team",                   viewKey: "can_view_users",             editKey: null, description: "Elenco utenti e ruoli del team" },
  { label: "Giornale Lavori",                 viewKey: "can_view_giornale_lavori",   editKey: "can_edit_giornale_lavori", description: "Rapportini e giornale lavori di cantiere" },
  { label: "Formazione (fruizione corsi)",    viewKey: "can_view_formazione",        editKey: null, description: "Accede ai corsi assegnati" },
  { label: "Portale corsi (gestione)",        viewKey: "can_manage_portal",          editKey: null, description: "Crea e gestisce corsi e portali formativi" },
];

export const MARKETING_SECTIONS: PermissionSectionDef[] = [
  { label: "Dashboard Marketing",     viewKey: "can_view_marketing_dashboard",      editKey: null, description: "KPI e panoramica marketing" },
  { label: "Contatti CRM",            viewKey: "can_view_marketing_contacts",       editKey: "can_edit_marketing_contacts", description: "Anagrafica contatti e lead" },
  { label: "Opportunità",             viewKey: "can_view_marketing_opportunities",  editKey: "can_edit_marketing_opportunities", description: "Pipeline e trattative di vendita" },
  { label: "Preventivi",              viewKey: "can_view_preventivi",               editKey: "can_edit_preventivi", description: "Preventivi CRM e invio in firma" },
  { label: "Approva Sconti",          viewKey: "can_approve_discounts",             editKey: null, description: "Può approvare/impostare sconti oltre soglia" },
  { label: "Sopralluoghi",            viewKey: "can_view_sopralluoghi",             editKey: null, description: "Sopralluoghi tecnici pre-vendita" },
  { label: "Attività",                viewKey: "can_view_marketing_activities",     editKey: null, description: "Attività e task commerciali" },
  { label: "Appuntamenti",            viewKey: "can_view_marketing_appointments",   editKey: null, description: "Appuntamenti e calendario CRM" },
  { label: "Email Marketing",         viewKey: "can_view_marketing_email",          editKey: null, description: "Campagne e caselle email" },
  { label: "SMS Marketing",           viewKey: "can_view_sms_marketing",            editKey: null, description: "Campagne SMS" },
  { label: "WhatsApp",                viewKey: "can_view_marketing_whatsapp",       editKey: null, description: "Hub WhatsApp e conversazioni" },
  { label: "Sales OS",                viewKey: "can_view_sales_os",                 editKey: null, description: "Cruscotto vendite e obiettivi" },
  { label: "Reportistica Marketing",  viewKey: "can_view_marketing_reports",        editKey: null, description: "Report vendite e marketing" },
  { label: "Reputazione",             viewKey: "can_view_reputazione",              editKey: null, description: "Recensioni e reputazione online" },
];

export const AUTOMAZIONI_SECTIONS: PermissionSectionDef[] = [
  { label: "Automazioni",  viewKey: "can_view_automazioni",          editKey: null, description: "Flussi automatici e trigger" },
  { label: "Agenti AI",    viewKey: "can_view_marketing_ai_agent",   editKey: null, description: "Agenti AI (Silvio e assistenti)" },
  { label: "Render AI",    viewKey: "can_view_render_ai",            editKey: null, description: "Render fotorealistici AI" },
];

export const IMPOSTAZIONI_SECTIONS: PermissionSectionDef[] = [
  { label: "Profilo Aziendale",      viewKey: "can_view_settings_profile",        editKey: "can_edit_settings_profile", description: "Dati aziendali e anagrafica" },
  { label: "Listino & Prezzi (tutto)", viewKey: "can_view_settings_pricing",      editKey: "can_edit_settings_pricing", description: "Master: listino prodotti, tariffe, template offerte E le tre voci sotto" },
  { label: "Regole scontistica",     viewKey: "can_view_settings_scontistica",    editKey: "can_edit_settings_scontistica", description: "Solo fasce sconto e limiti venditori, senza toccare il listino" },
  { label: "Finanziamenti",          viewKey: "can_view_settings_finanziamenti",  editKey: "can_edit_settings_finanziamenti", description: "Solo finanziarie, tassi e rate" },
  { label: "Bundle & Pacchetti",     viewKey: "can_view_settings_bundle",         editKey: "can_edit_settings_bundle", description: "Solo pacchetti chiavi-in-mano" },
  { label: "Branding & Template",    viewKey: "can_view_settings_customization",  editKey: "can_edit_settings_customization", description: "Logo, colori e template documenti" },
  { label: "Configurazione Ordini",  viewKey: "can_view_settings_orders",         editKey: "can_edit_settings_orders", description: "Stati, numerazioni e campi commesse" },
  { label: "Fornitori",              viewKey: "can_view_settings_suppliers",      editKey: "can_edit_settings_suppliers", description: "Configurazione fornitori" },
  { label: "Team & Utenti",          viewKey: "can_view_settings_people",         editKey: "can_edit_settings_people", description: "Gestione utenti e permessi" },
  { label: "Integrazioni & Canali",  viewKey: "can_view_settings_integrations",   editKey: "can_edit_settings_integrations", description: "Banche, email, WhatsApp e integrazioni" },
  { label: "Sicurezza & Privacy",    viewKey: "can_view_settings_security",       editKey: null, description: "Sessioni, log e sicurezza" },
];

// ─── Visibilità sul team (trasversale, NON un modulo) ──────────────────────
// Attività e calendario riguardano tutta l'azienda (ufficio, vendite,
// magazzino, HR): questi toggle vivono nell'area "visibilità" delle dialog
// permessi accanto a only_assigned e ai livelli economici, non sotto Cantieri.
export const TEAM_VISIBILITY_SECTIONS: PermissionSectionDef[] = [
  { label: "Attività del team",   viewKey: "can_view_team_tasks",        editKey: null },
  { label: "Calendario del team", viewKey: "can_view_all_team_calendar", editKey: null },
];

export const ALL_PERMISSION_SECTIONS: PermissionSectionDef[] = [
  ...CRUSCOTTO_SECTIONS,
  ...CANTIERI_SECTIONS,
  ...TEAM_VISIBILITY_SECTIONS,
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
  | "employee" // era 'worker' — usa il ruolo corretto del sistema
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
    can_view_giornale_lavori: true, can_edit_giornale_lavori: true,
    can_view_formazione: true,
    can_view_firma_elettronica: true,
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
    // Livello finanziario "Commerciale": vede importi (default) ma NON margini.
    // (prima qui c'era can_view_margins: true → incoerente col modello 3-livelli)
    can_view_formazione: true,
    can_view_marketing_dashboard: true,
    can_view_marketing_contacts: true, can_edit_marketing_contacts: true,
    can_view_marketing_opportunities: true, can_edit_marketing_opportunities: true,
    can_view_preventivi: true, can_edit_preventivi: true,
    can_view_sopralluoghi: true,
    can_view_marketing_activities: true,
    can_view_marketing_appointments: true,
    can_view_marketing_reports: true,
    can_view_reputazione: true,
    can_view_firma_elettronica: true,
    can_view_sales_os: true,
    can_view_marketing: true, can_edit_marketing: true,
    visible_areas: ["commerciale"],
  },

  call_center: {
    can_view_dashboard: true,
    can_view_calendar: true,
    can_view_customers: true, can_edit_customers: true,
    can_view_users: true,
    can_view_marketing_contacts: true, can_edit_marketing_contacts: true,
    // Il call center non guarda soltanto: qualifica il contatto e sposta
    // l'opportunita' di fase (richiamare, appuntamento fissato, non in target).
    // Senza la modifica il kanban e' di sola lettura e il lavoro si ferma li'.
    can_view_marketing_opportunities: true, can_edit_marketing_opportunities: true,
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
    can_view_giornale_lavori: true, can_edit_giornale_lavori: true,
    can_view_formazione: true,
    // Livello finanziario "Operativo": niente importi/costi/margini.
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
    // Operativo: il subappaltatore vede le sue commesse ma NON gli importi di
    // vendita al cliente (né costi/margini).
    can_view_order_amounts: false,
    only_assigned: true,
    visible_areas: ["cantiere"],
  },
};

/** Sincronizza il flag legacy can_view_settings dai permessi granulari */
export function syncLegacySettingsFlags(perms: StaffPermissions): StaffPermissions {
  const hasAnyView =
    perms.can_view_settings_profile || perms.can_view_settings_orders ||
    perms.can_view_settings_customization || perms.can_view_settings_people ||
    perms.can_view_settings_security || perms.can_view_settings_pricing ||
    perms.can_view_settings_suppliers || perms.can_view_settings_integrations ||
    perms.can_view_settings_scontistica || perms.can_view_settings_finanziamenti ||
    perms.can_view_settings_bundle;
  const hasAnyEdit =
    perms.can_edit_settings_profile || perms.can_edit_settings_orders ||
    perms.can_edit_settings_customization || perms.can_edit_settings_people ||
    perms.can_edit_settings_pricing || perms.can_edit_settings_suppliers ||
    perms.can_edit_settings_integrations || perms.can_edit_settings_scontistica ||
    perms.can_edit_settings_finanziamenti || perms.can_edit_settings_bundle;
  return {
    ...perms,
    can_view_settings: hasAnyView,
    can_edit_settings: hasAnyEdit,
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
    perms.can_view_reputazione || perms.can_view_sales_os;
  const hasAnyEdit = perms.can_edit_marketing_contacts || perms.can_edit_marketing_opportunities;
  return {
    ...perms,
    can_view_marketing: hasAnyView,
    can_edit_marketing: hasAnyEdit,
  };
}

/**
 * Costruisce il payload di UPDATE per `staff_permissions` dallo stato del dialog
 * permessi. UNICA FONTE DI VERITÀ usata sia dal path azienda (SettingsUserDetail)
 * sia dal path super-admin (useCompanyDetail):
 *  - filtra alle SOLE chiavi note (evita di rispedire id/user_id/company_id/
 *    created_at/updated_at, che romperebbero l'UPDATE);
 *  - normalizza i valori mancanti al default (booleani → false, visible_areas → []);
 *  - sincronizza i flag legacy aggregati (settings + marketing) dai granulari.
 */
export function buildStaffPermissionsUpdate(permissions: StaffPermissions): StaffPermissions {
  const allowedKeys = Object.keys(DEFAULT_PERMISSIONS) as (keyof StaffPermissions)[];
  const base: Partial<StaffPermissions> = {};
  for (const key of allowedKeys) {
    (base as Record<keyof StaffPermissions, StaffPermissions[keyof StaffPermissions]>)[key] =
      permissions[key] ?? DEFAULT_PERMISSIONS[key];
  }
  return syncLegacySettingsFlags(syncLegacyMarketingFlags(base as StaffPermissions));
}
