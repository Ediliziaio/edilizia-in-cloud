/**
 * Le impostazioni seguono il piano (21/09/2026).
 *
 * Un'azienda col piano Marketing, aprendo le impostazioni, trovava anche
 * banche, stati ordine, listino, fatturazione: moduli che il suo piano non ha.
 * Il menu principale li nascondeva già, le impostazioni no.
 *
 * Qui, per ogni pagina delle impostazioni, cosa del piano serve per usarla:
 * basta UNO dei moduli (subscription_plans.included_modules) o UNA delle
 * funzioni (resolve_company_features) elencate. Le pagine che non compaiono
 * valgono per tutti i piani: profilo, persone, sicurezza, CRM, integrazioni.
 *
 * «Incluso» si decide come nel menu principale (useStatoPiano): l'azienda demo
 * vede tutto; mentre il piano si carica, o se l'azienda non ne ha uno, si
 * mostra tutto; un piano «limitato» lascia i moduli non inclusi in prova; una
 * funzione spenta sparisce.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */
import { sezioneDaPercorso } from "./gruppiImpostazioni";

/** I moduli di subscription_plans.included_modules. */
export type ModuloPiano = "orders" | "warehouse" | "calendar" | "customers" | "employees" | "tickets" | "forecast";

export interface RequisitoPiano {
  /** Basta uno di questi moduli del piano… */
  moduli?: ModuloPiano[];
  /** …o una di queste funzioni (chiavi di resolve_company_features). */
  funzioni?: string[];
}

const PREVENTIVI: RequisitoPiano = { funzioni: ["preventivi_crm"] };
const FATTURE: RequisitoPiano = { funzioni: ["fatturazione", "documenti"] };

/** Segmento dopo /azienda/impostazioni/ → cosa del piano serve. */
export const REQUISITI_IMPOSTAZIONI: Record<string, RequisitoPiano> = {
  // Commesse e cantieri
  "stati-ordine": { moduli: ["orders"] },
  "cartelle-documenti": { moduli: ["orders", "customers"] },
  "calendari-lavori": { moduli: ["orders", "calendar"] },
  sopralluoghi: { funzioni: ["surveys_module"] },
  // Magazzino, acquisti, costi
  "qr-codici": { moduli: ["warehouse"] },
  fornitori: { moduli: ["orders", "warehouse", "forecast"] },
  "categorie-costi": { moduli: ["forecast"] },
  // Scadenzario e fatture: avvisi di scadenza, incassi riconciliati
  "automazioni-finanza": { funzioni: ["fatturazione", "documenti", "tesoreria"] },
  fatturazione: FATTURE,
  "fatturazione-nativa": FATTURE,
  // Preventivi. Il listino serve anche a commesse e magazzino; manodopera e
  // servizi anche alla manutenzione; i finanziamenti anche al simulatore.
  listino: { funzioni: ["preventivi_crm"], moduli: ["orders", "warehouse"] },
  tariffe: { funzioni: ["preventivi_crm", "manutenzione_modulo"], moduli: ["orders"] },
  "listino-manutenzione": { funzioni: ["preventivi_crm", "manutenzione_modulo"], moduli: ["orders"] },
  bundle: PREVENTIVI,
  "bundle-serramentista": PREVENTIVI,
  margini: PREVENTIVI,
  scontistica: PREVENTIVI,
  "template-preventivi": PREVENTIVI,
  "condizioni-firma": PREVENTIVI,
  finanziamenti: { funzioni: ["preventivi_crm", "simulatore"] },
  "firma-elettronica": { funzioni: ["firma_fea"] },
  "catalogo-render": { funzioni: ["render_ai"] },
  "whatsapp-bot": { funzioni: ["whatsapp_bot_ai", "whatsapp"] },
};

/**
 * Le pagine che servono con qualunque piano. Una pagina nuova delle
 * impostazioni va messa qui o in REQUISITI_IMPOSTAZIONI: il test
 * impostazioniDelPiano lo controlla, così nessuna resta fuori per distrazione.
 */
export const IMPOSTAZIONI_PER_TUTTI_I_PIANI = [
  // Account e azienda
  "mio-profilo", "profilo", "sedi", "branding", "abbonamento", "crediti", "notifiche",
  // Persone e sicurezza
  "persone", "utenti", "venditori", "staff", "team",
  "sicurezza-privacy", "sicurezza", "privacy", "security-dashboard", "attivita", "esporta-dati",
  // CRM e marketing: li hanno tutti i piani
  "tag", "campi-personalizzati", "sequenze", "motivi-perdita", "form-builder", "calendari", "lead-forms",
  // Integrazioni e canali (le parti legate al piano si filtrano dentro la pagina)
  "integrazioni", "api", "webhook", "dominio-email", "preferenze-email", "numeri-telefono", "telefonia",
  // AI
  "ai-memoria", "ai-personas", "ai-automazioni", "ai-test-lab",
  // Rimandi ad altre pagine, o pagine con la loro guardia del piano
  "catalogo", "listini-serramenti",
] as const;

/** Parti delle pagine (non pagine intere) che dipendono dal piano. */
export const REQUISITI_SEZIONI = {
  /** Integrazioni → collegamento dei conti correnti (Open Banking). */
  conti_correnti: { funzioni: ["tesoreria", "prima_nota"] },
  /** Integrazioni → incassi con carta (Stripe) su preventivi e fatture. */
  pagamenti_carta: { funzioni: ["preventivi_crm", "fatturazione", "documenti"] },
} satisfies Record<string, RequisitoPiano>;

/** Quello che si sa del piano dell'azienda, ricavato come nel menu principale. */
export interface StatoPiano {
  /** Azienda demo, piano ancora in caricamento o assente: si mostra tutto. */
  tuttoVisibile: boolean;
  /** Piano «limitato»: i moduli non inclusi restano visibili, in prova. */
  pianoLimitato: boolean;
  moduloIncluso: (modulo: ModuloPiano) => boolean;
  livelloFunzione: (funzione: string) => "enabled" | "preview" | "disabled";
}

export function requisitoSoddisfatto(requisito: RequisitoPiano | undefined, stato: StatoPiano): boolean {
  if (!requisito) return true;
  if (stato.tuttoVisibile) return true;
  if (requisito.moduli?.some((m) => stato.pianoLimitato || stato.moduloIncluso(m))) return true;
  if (requisito.funzioni?.some((f) => stato.livelloFunzione(f) !== "disabled")) return true;
  return false;
}

/** La pagina è nel piano? Accetta l'indirizzo («/azienda/impostazioni/listino?tab=x») o il segmento («listino»). */
export function impostazioneNelPiano(percorso: string, stato: StatoPiano): boolean {
  const sezione = percorso.includes("/") ? sezioneDaPercorso(percorso) : percorso;
  if (!sezione) return true;
  return requisitoSoddisfatto(REQUISITI_IMPOSTAZIONI[sezione], stato);
}

const NOMI_MODULI: Record<ModuloPiano, string> = {
  orders: "Commesse",
  warehouse: "Magazzino",
  calendar: "Calendario",
  customers: "Clienti",
  employees: "Personale",
  tickets: "Assistenza",
  forecast: "Costi e previsionale",
};

const NOMI_FUNZIONI: Record<string, string> = {
  preventivi_crm: "Preventivi",
  simulatore: "Simulatore",
  manutenzione_modulo: "Manutenzione",
  firma_fea: "Firma elettronica",
  render_ai: "Render AI",
  surveys_module: "Sopralluoghi",
  fatturazione: "Fatturazione",
  documenti: "Fatture",
  tesoreria: "Tesoreria",
  prima_nota: "Prima nota",
  whatsapp_bot_ai: "Bot WhatsApp",
  whatsapp: "WhatsApp",
};

/** I moduli che aprirebbero la pagina, a parole: «Commesse o Magazzino». */
export function nomiRequisito(percorso: string): string {
  const sezione = percorso.includes("/") ? sezioneDaPercorso(percorso) : percorso;
  const requisito = sezione ? REQUISITI_IMPOSTAZIONI[sezione] : undefined;
  if (!requisito) return "";
  const nomi = [
    ...(requisito.funzioni ?? []).map((f) => NOMI_FUNZIONI[f] ?? f),
    ...(requisito.moduli ?? []).map((m) => NOMI_MODULI[m]),
  ];
  const unici = [...new Set(nomi)];
  return unici.length <= 1 ? (unici[0] ?? "") : `${unici.slice(0, -1).join(", ")} o ${unici[unici.length - 1]}`;
}
