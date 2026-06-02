// supabase/functions/_shared/platformAutomation.ts
//
// Separazione AREA SUPERADMIN ⇄ AREA AZIENDA per il motore di automazioni.
//
// Le automazioni del builder ADMIN vivono nella tabella `automation_flows`
// con `company_id = PLATFORM_ADMIN_COMPANY_ID` (la "platform admin company",
// impostata lato UI da PlatformCompanyProvider). Le automazioni AZIENDA usano
// il `company_id` reale del tenant. Questo modulo è la fonte unica di verità,
// lato edge, per distinguere i due mondi e impedire che:
//   • un'azione di PIATTAFORMA venga eseguita in un contesto azienda;
//   • un'azione esclusiva AZIENDA venga eseguita nel contesto piattaforma;
//   • un trigger PLATFORM_* arruoli flussi di un'azienda (e viceversa).
//
// Mirror lato frontend: src/lib/flow-node-catalog.ts (categoria 'piattaforma')
//                       src/lib/adminConstants.ts  (PLATFORM_ADMIN_COMPANY_ID)

/** Deve combaciare con src/lib/adminConstants.ts:PLATFORM_ADMIN_COMPANY_ID */
export const PLATFORM_ADMIN_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Nomi canonici degli eventi di piattaforma scritti in
 * `automation_trigger_events.trigger_event`. Combaciano con `dbEvent` nel
 * catalogo frontend (categoria 'piattaforma').
 */
export const PLATFORM_EVENTS = {
  COMPANY_CREATED: "PLATFORM_COMPANY_CREATED",
  PLAN_CHANGED: "PLATFORM_PLAN_CHANGED",
  SUBSCRIPTION_CANCELLED: "PLATFORM_SUBSCRIPTION_CANCELLED",
  TRIAL_EXPIRING: "PLATFORM_TRIAL_EXPIRING",
  AI_CREDITS_LOW: "PLATFORM_AI_CREDITS_LOW",
  TICKET_OPENED: "PLATFORM_TICKET_OPENED",
  COMPANY_PAUSED: "PLATFORM_COMPANY_PAUSED",
  DEAL_WON: "PLATFORM_DEAL_WON",
  PAYMENT_RECEIVED: "PLATFORM_PAYMENT_RECEIVED",
  INVOICE_OVERDUE: "PLATFORM_INVOICE_OVERDUE",
} as const;

/**
 * Mappa id-catalogo (italiano, salvato dal builder in `config_json.item_id`)
 * → nome canonico dell'evento. L'executor la fonde nel suo TRIGGER_EVENT_MAP.
 *
 * `cliente_contrattualizzato` riusa l'evento 'opportunity_won' già emesso dal
 * DB trigger sulle opportunità: per la platform-admin company quell'evento
 * arriva con company_id = PLATFORM_ADMIN_COMPANY_ID, quindi arruola solo i
 * flussi admin (nessun nuovo emettitore necessario).
 */
export const PLATFORM_TRIGGER_EVENT_MAP: Record<string, string> = {
  azienda_creata: PLATFORM_EVENTS.COMPANY_CREATED,
  piano_cambiato: PLATFORM_EVENTS.PLAN_CHANGED,
  abbonamento_cancellato: PLATFORM_EVENTS.SUBSCRIPTION_CANCELLED,
  trial_in_scadenza: PLATFORM_EVENTS.TRIAL_EXPIRING,
  crediti_ai_bassi: PLATFORM_EVENTS.AI_CREDITS_LOW,
  ticket_piattaforma_aperto: PLATFORM_EVENTS.TICKET_OPENED,
  azienda_in_pausa: PLATFORM_EVENTS.COMPANY_PAUSED,
  cliente_contrattualizzato: "opportunity_won",
  pagamento_piattaforma_ricevuto: PLATFORM_EVENTS.PAYMENT_RECEIVED,
  fattura_piattaforma_scaduta: PLATFORM_EVENTS.INVOICE_OVERDUE,
};

/**
 * Id-catalogo (italiani) delle 8 AZIONI di piattaforma. Eseguibili SOLO quando
 * il flusso appartiene alla platform-admin company.
 */
export const PLATFORM_ACTION_IDS: ReadonlySet<string> = new Set([
  "invia_email_admin_azienda",
  "crea_cs_task",
  "cambia_piano_azienda",
  "aggiungi_nota_azienda",
  "invia_notifica_team_admin",
  "crea_account_azienda",
  "invia_fattura",
  "attiva_onboarding",
]);

/**
 * Le 3 azioni di piattaforma più sensibili: oltre al contesto, richiedono che
 * l'autore del flusso sia un super_admin in allowlist (vedi _shared/auth.ts).
 */
export const PLATFORM_PRIVILEGED_ACTION_IDS: ReadonlySet<string> = new Set([
  "cambia_piano_azienda",
  "crea_account_azienda",
  "invia_fattura",
]);

/**
 * Azioni esclusive dell'AREA AZIENDA (categorie non mostrate al builder admin:
 * ordini, preventivi, cantieri, assistenza, fatturazione). Rifiutate se il
 * contesto è la platform-admin company.
 */
export const COMPANY_ONLY_ACTION_IDS: ReadonlySet<string> = new Set([
  "crea_bozza_ordine",
  "crea_bozza_preventivo",
  "crea_cantiere",
  "crea_ticket",
  "crea_fattura",
]);

export function isPlatformCompany(companyId: string | null | undefined): boolean {
  return companyId === PLATFORM_ADMIN_COMPANY_ID;
}

export function isPlatformEvent(eventName: string | null | undefined): boolean {
  return typeof eventName === "string" && eventName.startsWith("PLATFORM_");
}

export interface EmitPlatformEventOptions {
  /** Id del soggetto (di norma l'azienda coinvolta), salvato in entity_id. */
  entityId: string;
  /** entity_type del soggetto. Default 'company'. */
  entityType?: string;
  /** Payload a chiavi "namespacing" (es. { "azienda.id": ..., "azienda.name": ... }). */
  payload?: Record<string, unknown>;
}

/**
 * Inserisce un evento di piattaforma in `automation_trigger_events` con
 * company_id = PLATFORM_ADMIN_COMPANY_ID, così che SOLO i flussi del builder
 * admin lo intercettino. Best-effort: non lancia mai (non deve rompere
 * l'operazione host che lo emette).
 */
export async function emitPlatformEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  eventName: string,
  opts: EmitPlatformEventOptions,
): Promise<boolean> {
  try {
    if (!opts?.entityId) {
      console.warn(`[emitPlatformEvent] skip ${eventName}: entityId mancante`);
      return false;
    }
    const { error } = await supabase.from("automation_trigger_events").insert({
      company_id: PLATFORM_ADMIN_COMPANY_ID,
      trigger_event: eventName,
      entity_id: String(opts.entityId),
      entity_type: opts.entityType ?? "company",
      payload: opts.payload ?? {},
    });
    if (error) {
      console.error(`[emitPlatformEvent] ${eventName} insert error:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[emitPlatformEvent] ${eventName} unexpected error:`, (err as Error)?.message);
    return false;
  }
}
