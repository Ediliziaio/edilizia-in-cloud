/**
 * Il registro delle variabili della commessa (31/10/2026, fase 0, lotto 0.1).
 * Vedi docs/piano-silvio-commessa-ai.md, sezioni 2 e 5.
 *
 * Ogni variabile che Silvio può compilare sta qui una volta sola: l'area, dove vive
 * (colonne di `orders` o una tabella collegata), da quali fonti la prende, il livello
 * di autonomia predefinito e il controllo «è compilata?». Dallo stesso elenco escono
 * il punteggio di completezza (completezza.ts), il popup e gli avvisi.
 *
 * Ogni colonna di `orders` è o in una variabile o in COLONNE_IGNORATE col motivo:
 * lo controlla src/test/logic/silvioCommessaRegistro.test.ts sui tipi generati, così
 * una colonna nuova non resta invisibile a Silvio.
 *
 * Senza dipendenze, compatibile con Deno.
 */
import type { Area, Livello, TipoFonte } from "./piano.ts";

/**
 * Come si capisce se una variabile è compilata, su una commessa vera.
 * - `colonne`: almeno una delle colonne di `orders` ha un valore («presente»: non
 *   nullo e non una stringa vuota; «positivo»: un numero maggiore di zero).
 * - `righe`: c'è almeno una riga, in una qualunque delle tabelle, con `order_id`
 *   uguale alla commessa (e, se c'è `conColonna`, con quella colonna valorizzata).
 */
export type Controllo =
  | { tipo: "colonne"; colonne: string[]; regola: "presente" | "positivo" }
  | { tipo: "righe"; tabelle: string[]; conColonna?: string };

export interface Variabile {
  area: Area;
  /** Chiave stabile, `<area>.<nome>`: la usano piano, conflitti, correzioni. */
  chiave: string;
  /** Come la legge il titolare nel popup. */
  etichetta: string;
  /** Colonne di `orders` che la variabile copre (vuoto se vive in un'altra tabella). */
  colonne: string[];
  /** Tabelle collegate (con `order_id`) dove vive, se non è una colonna di `orders`. */
  tabelle?: string[];
  /** Da dove Silvio la prende, dalla fonte preferita. */
  fonti: TipoFonte[];
  /** 🟢 da_solo · 🟡 propone · 🔴 mai_da_solo · ❓ chiede (solo se manca). */
  livello: Livello;
  controllo: Controllo;
  /**
   * Quanto conta nel punteggio di completezza. 0 = non entra: è sempre compilata
   * dal database, è derivata, o vale solo per alcune commesse (bonus, ditte, mezzi).
   */
  peso: number;
}

const presente = (...colonne: string[]): Controllo => ({ tipo: "colonne", colonne, regola: "presente" });
const righe = (...tabelle: string[]): Controllo => ({ tipo: "righe", tabelle });

export const REGISTRO: readonly Variabile[] = [
  // ── 1. Identità ─────────────────────────────────────────────────────────────
  { area: "identita", chiave: "identita.order_code", etichetta: "Numero commessa", colonne: ["order_code"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("order_code"), peso: 1 },
  { area: "identita", chiave: "identita.order_type", etichetta: "Tipo di commessa", colonne: ["order_type"],
    fonti: ["preventivo", "modello"], livello: "da_solo", controllo: presente("order_type"), peso: 0 },
  { area: "identita", chiave: "identita.tipo_lavoro", etichetta: "Tipo di lavoro", colonne: ["tipo_lavoro"],
    fonti: ["preventivo", "computo", "documento", "testo"], livello: "da_solo", controllo: presente("tipo_lavoro"), peso: 1 },
  { area: "identita", chiave: "identita.description", etichetta: "Titolo", colonne: ["description"],
    fonti: ["preventivo", "contratto", "documento", "testo"], livello: "da_solo", controllo: presente("description"), peso: 1 },
  { area: "identita", chiave: "identita.work_description", etichetta: "Descrizione dei lavori", colonne: ["work_description"],
    fonti: ["contratto", "preventivo", "computo", "documento", "testo"], livello: "da_solo", controllo: presente("work_description"), peso: 1 },
  { area: "identita", chiave: "identita.sede_id", etichetta: "Sede", colonne: ["sede_id"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("sede_id"), peso: 1 },
  { area: "identita", chiave: "identita.stato", etichetta: "Stato iniziale", colonne: ["status", "current_status_id"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("status", "current_status_id"), peso: 0 },
  { area: "identita", chiave: "identita.origine", etichetta: "Preventivo o progetto d'origine",
    colonne: ["quote_id", "quote_number", "fv_progetto_id", "rst_progetto_id"],
    // Peso 0: 58 commesse nuove su 60 nascono senza preventivo, ed è legittimo.
    fonti: ["preventivo"], livello: "da_solo", controllo: presente("quote_id", "quote_number", "fv_progetto_id", "rst_progetto_id"), peso: 0 },
  { area: "identita", chiave: "identita.internal_notes", etichetta: "Note interne", colonne: ["internal_notes"],
    fonti: ["persona", "documento", "testo"], livello: "da_solo", controllo: presente("internal_notes"), peso: 0 },

  // ── 2. Cliente ──────────────────────────────────────────────────────────────
  { area: "cliente", chiave: "cliente.customer_id", etichetta: "Cliente", colonne: ["customer_id"],
    fonti: ["preventivo", "contratto", "documento", "testo"], livello: "chiede", controllo: presente("customer_id"), peso: 2 },
  { area: "cliente", chiave: "cliente.nome", etichetta: "Nome del cliente", colonne: ["client_name", "client_company"],
    fonti: ["preventivo", "contratto", "documento", "testo"], livello: "da_solo", controllo: presente("client_name", "client_company"), peso: 1 },
  { area: "cliente", chiave: "cliente.contatto", etichetta: "Telefono o email del cliente", colonne: ["client_phone", "client_email"],
    fonti: ["preventivo", "contratto", "documento"], livello: "da_solo", controllo: presente("client_phone", "client_email"), peso: 1 },
  { area: "cliente", chiave: "cliente.client_address", etichetta: "Indirizzo del cliente", colonne: ["client_address"],
    fonti: ["preventivo", "contratto", "documento"], livello: "da_solo", controllo: presente("client_address"), peso: 1 },
  { area: "cliente", chiave: "cliente.opportunity_id", etichetta: "Opportunità CRM", colonne: ["opportunity_id"],
    fonti: ["preventivo"], livello: "da_solo", controllo: presente("opportunity_id"), peso: 0 },

  // ── 3. Cantiere ─────────────────────────────────────────────────────────────
  { area: "cantiere", chiave: "cantiere.indirizzo", etichetta: "Indirizzo del cantiere", colonne: ["indirizzo_lavori", "work_address"],
    fonti: ["preventivo", "contratto", "sopralluogo", "documento", "testo"], livello: "chiede",
    controllo: presente("indirizzo_lavori", "work_address"), peso: 2 },
  { area: "cantiere", chiave: "cantiere.coordinate", etichetta: "Posizione sulla mappa", colonne: ["work_lat", "work_lng", "work_geocoded_at"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("work_lat"), peso: 1 },
  { area: "cantiere", chiave: "cantiere.distanza_sede", etichetta: "Distanza dalla sede",
    colonne: ["distanza_sede_km", "distanza_sede_minuti", "distanza_sede_il"],
    // Peso 0: si calcola dalla posizione, non è un dato in più.
    fonti: ["modello"], livello: "da_solo", controllo: presente("distanza_sede_km"), peso: 0 },
  { area: "cantiere", chiave: "cantiere.materials_location", etichetta: "Dove si scaricano i materiali", colonne: ["materials_location"],
    fonti: ["sopralluogo", "documento", "testo"], livello: "propone", controllo: presente("materials_location"), peso: 0 },

  // ── 4. Economia ─────────────────────────────────────────────────────────────
  { area: "economia", chiave: "economia.total_amount", etichetta: "Importo", colonne: ["total_amount"],
    fonti: ["contratto", "preventivo", "computo", "documento", "testo"], livello: "chiede",
    controllo: { tipo: "colonne", colonne: ["total_amount"], regola: "positivo" }, peso: 3 },
  { area: "economia", chiave: "economia.vat_rate", etichetta: "IVA", colonne: ["vat_rate"],
    fonti: ["contratto", "preventivo", "modello"], livello: "da_solo", controllo: presente("vat_rate"), peso: 1 },
  { area: "economia", chiave: "economia.has_building_bonus", etichetta: "Bonus edilizio", colonne: ["has_building_bonus"],
    fonti: ["preventivo", "contratto"], livello: "da_solo", controllo: presente("has_building_bonus"), peso: 0 },
  { area: "economia", chiave: "economia.order_items", etichetta: "Righe della commessa", colonne: [], tabelle: ["order_items"],
    fonti: ["preventivo", "computo", "contratto", "documento"], livello: "da_solo", controllo: righe("order_items"), peso: 1 },
  { area: "economia", chiave: "economia.order_bonus_lines", etichetta: "Righe del bonus", colonne: [], tabelle: ["order_bonus_lines"],
    fonti: ["preventivo"], livello: "da_solo", controllo: righe("order_bonus_lines"), peso: 0 },

  // ── 5. Pagamenti ────────────────────────────────────────────────────────────
  // Le colonne fisse (acconto, secondo acconto, saldo, finanziamento) sono lo schema
  // vecchio: valgono solo per chi le usa, peso 0. Il piano dei pagamenti sono le rate.
  { area: "pagamenti", chiave: "pagamenti.payment_type", etichetta: "Modalità di pagamento", colonne: ["payment_type"],
    fonti: ["contratto", "preventivo", "modello"], livello: "da_solo", controllo: presente("payment_type"), peso: 1 },
  { area: "pagamenti", chiave: "pagamenti.rate", etichetta: "Rate", colonne: [], tabelle: ["order_installments"],
    fonti: ["contratto", "preventivo", "modello"], livello: "da_solo", controllo: righe("order_installments"), peso: 3 },
  { area: "pagamenti", chiave: "pagamenti.acconto", etichetta: "Acconto", colonne: ["deposit_amount", "deposit_expected_date"],
    fonti: ["contratto", "preventivo"], livello: "da_solo", controllo: { tipo: "colonne", colonne: ["deposit_amount"], regola: "positivo" }, peso: 0 },
  { area: "pagamenti", chiave: "pagamenti.secondo_acconto", etichetta: "Secondo acconto", colonne: ["deposit_2_amount", "deposit_2_expected_date"],
    fonti: ["contratto", "preventivo"], livello: "da_solo", controllo: { tipo: "colonne", colonne: ["deposit_2_amount"], regola: "positivo" }, peso: 0 },
  { area: "pagamenti", chiave: "pagamenti.saldo", etichetta: "Saldo", colonne: ["balance_amount", "balance_expected_date"],
    fonti: ["contratto", "preventivo"], livello: "da_solo", controllo: { tipo: "colonne", colonne: ["balance_amount"], regola: "positivo" }, peso: 0 },
  { area: "pagamenti", chiave: "pagamenti.finanziamento", etichetta: "Finanziamento",
    colonne: ["financing_amount", "financing_cost", "financing_expected_date"],
    fonti: ["contratto", "preventivo"], livello: "propone", controllo: { tipo: "colonne", colonne: ["financing_amount"], regola: "positivo" }, peso: 0 },

  // ── 6. Fasi e tempi ─────────────────────────────────────────────────────────
  { area: "fasi", chiave: "fasi.order_work_phases", etichetta: "Fasi", colonne: [], tabelle: ["order_work_phases"],
    fonti: ["preventivo", "computo", "contratto", "modello", "testo", "stima"], livello: "da_solo", controllo: righe("order_work_phases"), peso: 3 },
  { area: "fasi", chiave: "fasi.date_fasi", etichetta: "Date delle fasi", colonne: [], tabelle: ["order_work_phases"],
    fonti: ["preventivo", "computo", "contratto", "modello", "stima"], livello: "propone",
    controllo: { tipo: "righe", tabelle: ["order_work_phases"], conColonna: "start_date" }, peso: 2 },
  { area: "fasi", chiave: "fasi.work_start_date", etichetta: "Inizio lavori", colonne: ["work_start_date"],
    fonti: ["contratto", "preventivo", "testo"], livello: "chiede", controllo: presente("work_start_date"), peso: 2 },
  { area: "fasi", chiave: "fasi.work_end_date", etichetta: "Fine lavori", colonne: ["work_end_date"],
    fonti: ["contratto", "preventivo", "modello", "stima"], livello: "propone", controllo: presente("work_end_date"), peso: 1 },
  { area: "fasi", chiave: "fasi.expected_date", etichetta: "Consegna prevista", colonne: ["expected_date"],
    fonti: ["contratto", "preventivo", "modello", "stima"], livello: "propone", controllo: presente("expected_date"), peso: 1 },

  // ── 7. Persone ──────────────────────────────────────────────────────────────
  { area: "persone", chiave: "persone.assigned_to", etichetta: "Responsabile", colonne: ["assigned_to"],
    fonti: ["preventivo", "modello"], livello: "da_solo", controllo: presente("assigned_to"), peso: 2 },
  { area: "persone", chiave: "persone.capomastro", etichetta: "Capomastro", colonne: ["capomastro_user_id"],
    fonti: ["modello", "stima"], livello: "propone", controllo: presente("capomastro_user_id"), peso: 1 },
  { area: "persone", chiave: "persone.squadra", etichetta: "Squadra", colonne: [],
    tabelle: ["order_employees", "order_phase_assignments", "squadre_commesse"],
    fonti: ["modello", "stima"], livello: "propone", controllo: righe("order_employees", "order_phase_assignments", "squadre_commesse"), peso: 2 },
  { area: "persone", chiave: "persone.venditori", etichetta: "Venditori", colonne: [], tabelle: ["order_salespeople"],
    fonti: ["preventivo"], livello: "da_solo", controllo: righe("order_salespeople"), peso: 0 },

  // ── 8. Ditte e subappalti (solo per le commesse che ne hanno) ───────────────
  { area: "ditte", chiave: "ditte.assegnate", etichetta: "Ditte", colonne: [], tabelle: ["order_external_teams", "subappaltatori_assegnazioni"],
    fonti: ["offerta", "modello"], livello: "propone", controllo: righe("order_external_teams", "subappaltatori_assegnazioni"), peso: 0 },
  { area: "ditte", chiave: "ditte.contratti", etichetta: "Contratti delle ditte", colonne: [], tabelle: ["contratti_subappalto"],
    fonti: ["offerta", "modello"], livello: "mai_da_solo", controllo: righe("contratti_subappalto"), peso: 0 },
  { area: "ditte", chiave: "ditte.ritenute", etichetta: "Ritenute di garanzia", colonne: [], tabelle: ["ritenute_garanzia"],
    fonti: ["contratto", "offerta"], livello: "da_solo", controllo: righe("ritenute_garanzia"), peso: 0 },

  // ── 9. Costi previsti e margine ─────────────────────────────────────────────
  { area: "costi", chiave: "costi.previsti", etichetta: "Costi previsti", colonne: [], tabelle: ["company_costs"],
    fonti: ["computo", "offerta", "modello"], livello: "da_solo", controllo: righe("company_costs"), peso: 1 },
  { area: "costi", chiave: "costi.margine", etichetta: "Margine", colonne: [], tabelle: ["ordine_margine_stato"],
    fonti: ["modello"], livello: "da_solo", controllo: righe("ordine_margine_stato"), peso: 0 },

  // ── 10. Mezzi ───────────────────────────────────────────────────────────────
  { area: "mezzi", chiave: "mezzi.allocazioni", etichetta: "Mezzi", colonne: [], tabelle: ["mezzi_allocazioni", "mezzi_piani_cantiere"],
    fonti: ["modello", "stima"], livello: "propone", controllo: righe("mezzi_allocazioni", "mezzi_piani_cantiere"), peso: 0 },

  // ── 11. Materiali e acquisti ────────────────────────────────────────────────
  { area: "materiali", chiave: "materiali.fabbisogno", etichetta: "Fabbisogno materiali", colonne: [], tabelle: ["material_predictions"],
    fonti: ["computo", "preventivo", "stima"], livello: "da_solo", controllo: righe("material_predictions"), peso: 0 },
  { area: "materiali", chiave: "materiali.acquisti", etichetta: "Richieste d'offerta e ordini", colonne: [], tabelle: ["supplier_rfqs", "purchase_orders"],
    fonti: ["computo", "offerta"], livello: "propone", controllo: righe("supplier_rfqs", "purchase_orders"), peso: 0 },
  { area: "materiali", chiave: "materiali.magazzino", etichetta: "Magazzino di destinazione", colonne: ["destination_warehouse_id", "warehouse_arrival_date"],
    fonti: ["modello"], livello: "propone", controllo: presente("destination_warehouse_id"), peso: 0 },

  // ── 12. Sicurezza e documenti ───────────────────────────────────────────────
  { area: "sicurezza", chiave: "sicurezza.adempimenti", etichetta: "Adempimenti di sicurezza", colonne: [], tabelle: ["adempimenti_sicurezza"],
    fonti: ["modello"], livello: "da_solo", controllo: righe("adempimenti_sicurezza"), peso: 1 },
  { area: "sicurezza", chiave: "sicurezza.pos_duvri", etichetta: "POS e DUVRI", colonne: [], tabelle: ["pos_documents", "duvri_documents"],
    fonti: ["modello"], livello: "mai_da_solo", controllo: righe("pos_documents", "duvri_documents"), peso: 0 },
  { area: "sicurezza", chiave: "sicurezza.fascicolo", etichetta: "Fascicolo dell'opera", colonne: [], tabelle: ["sicurezza_fascicolo"],
    fonti: ["modello"], livello: "mai_da_solo", controllo: righe("sicurezza_fascicolo"), peso: 0 },

  // ── 13. SAL, scadenze, fatture ──────────────────────────────────────────────
  { area: "sal_scadenze", chiave: "sal_scadenze.scadenze", etichetta: "Scadenze previsionali", colonne: [], tabelle: ["scadenze"],
    fonti: ["contratto", "preventivo", "modello"], livello: "da_solo", controllo: righe("scadenze"), peso: 1 },
  { area: "sal_scadenze", chiave: "sal_scadenze.sal", etichetta: "SAL", colonne: [], tabelle: ["sal"],
    fonti: ["contratto"], livello: "mai_da_solo", controllo: righe("sal"), peso: 0 },

  // ── 14. Comunicazione e automatismi ─────────────────────────────────────────
  { area: "comunicazione", chiave: "comunicazione.weekly_report_enabled", etichetta: "Resoconto settimanale", colonne: ["weekly_report_enabled"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("weekly_report_enabled"), peso: 0 },
  { area: "comunicazione", chiave: "comunicazione.giornale_auto_enabled", etichetta: "Giornale dei lavori automatico", colonne: ["giornale_auto_enabled"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("giornale_auto_enabled"), peso: 0 },
  { area: "comunicazione", chiave: "comunicazione.direttore_lavori", etichetta: "Avvisi al direttore dei lavori",
    colonne: ["dl_notification_email", "dl_notification_phone"],
    fonti: ["contratto", "documento"], livello: "propone", controllo: presente("dl_notification_email", "dl_notification_phone"), peso: 0 },
  { area: "comunicazione", chiave: "comunicazione.next_action", etichetta: "Prossima azione", colonne: ["next_action", "next_action_date"],
    fonti: ["modello"], livello: "da_solo", controllo: presente("next_action"), peso: 1 },
  { area: "comunicazione", chiave: "comunicazione.operational_checklist", etichetta: "Checklist operativa", colonne: ["operational_checklist"],
    // Peso 0: il database la crea già (un JSON di partenza), presente vuol dire poco.
    fonti: ["modello"], livello: "da_solo", controllo: presente("operational_checklist"), peso: 0 },
  { area: "comunicazione", chiave: "comunicazione.canale_interno", etichetta: "Canale interno di cantiere", colonne: [], tabelle: ["internal_chat_channels"],
    fonti: ["modello"], livello: "da_solo", controllo: righe("internal_chat_channels"), peso: 1 },
  { area: "comunicazione", chiave: "comunicazione.tasks", etichetta: "Attività d'ufficio", colonne: [], tabelle: ["tasks"],
    fonti: ["modello"], livello: "da_solo", controllo: righe("tasks"), peso: 1 },
  { area: "comunicazione", chiave: "comunicazione.calendario", etichetta: "Eventi in calendario", colonne: [], tabelle: ["google_calendar_order_events"],
    fonti: ["modello"], livello: "da_solo", controllo: righe("google_calendar_order_events"), peso: 0 },
];

const CONSUNTIVO = "consuntivo: si scrive quando il fatto avviene (pagamento, avanzamento), non quando nasce la commessa";
const TECNICA = "tecnica: la scrive il database o l'app, non è un dato della commessa";

/** Le colonne di `orders` che Silvio non compila, ognuna col motivo. */
export const COLONNE_IGNORATE: Readonly<Record<string, string>> = {
  id: TECNICA,
  company_id: TECNICA,
  created_at: TECNICA,
  created_by: TECNICA,
  updated_at: TECNICA,
  version: TECNICA,
  deleted_at: "cestino: la cancellazione è un'azione dell'utente, mai di Silvio",
  deleted_by: "cestino: la cancellazione è un'azione dell'utente, mai di Silvio",
  percentuale_avanzamento: CONSUNTIVO,
  fulfillment_status: "derivata: la calcola l'app dalle consegne delle righe",
  deposit_paid: CONSUNTIVO,
  deposit_paid_date: CONSUNTIVO,
  deposit_2_paid: CONSUNTIVO,
  deposit_2_paid_date: CONSUNTIVO,
  balance_paid: CONSUNTIVO,
  balance_paid_date: CONSUNTIVO,
  financing_paid: CONSUNTIVO,
  financing_paid_date: CONSUNTIVO,
};

const PER_CHIAVE = new Map(REGISTRO.map((v) => [v.chiave, v]));

/** La variabile con quella chiave, o undefined se non è nel registro. */
export function variabile(chiave: string): Variabile | undefined {
  return PER_CHIAVE.get(chiave);
}

/** Le variabili di un'area, nell'ordine del registro. */
export function variabiliDellArea(area: Area): Variabile[] {
  return REGISTRO.filter((v) => v.area === area);
}
