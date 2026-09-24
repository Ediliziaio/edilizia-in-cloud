/**
 * Il brief del mattino di Silvio: chi lo riceve e con quali dati.
 *
 * Fino al 24/09/2026 silvio-morning-brief interrogava i dati di OGNI utente
 * come se fosse l'amministratore (primaryRole fisso a "company_admin"): cassa,
 * crediti scaduti e sintesi di direzione finivano nel brief di venditori,
 * operatori del call center e impiegati, che lo leggono nel pannello di
 * Silvio. Negli 11 giorni prima della correzione: 66 brief a 10 persone senza
 * alcun permesso sulla finanza.
 *
 * Da qui in poi il brief dà a ciascuno solo ciò che Silvio gli darebbe in
 * chat, con le stesse regole:
 *  - il ruolo è quello della chat (ruoloPrincipaleSilvio: «impiegato +
 *    venditore» è un venditore);
 *  - uno strumento entra se il ruolo è tra i suoi allowedRoles nel registry;
 *  - a chi non è amministratore serve anche il permesso dell'area
 *    (DOMAIN_STAFF_PERMISSION), ACCESO. In chat basta che non sia spento; il
 *    brief però arriva senza che nessuno lo chieda, e nel dubbio tace: senza
 *    riga permessi non si mostra niente.
 * Le «azioni pronte» (proposte create dagli avvisi dell'azienda) restano agli
 * amministratori: gli avvisi sono di tutta l'azienda, con importi e clienti
 * di tutti.
 *
 * Il motore (executeToolWithRouting) rifà i suoi controlli quando esegue.
 * Questo file decide cosa CHIEDERE, così chi non ha niente da vedere non costa
 * né una query né una chiamata al modello.
 */
import { DEFAULT_TOOL_ALLOWED_ROLES, DOMAIN_STAFF_PERMISSION, SILVIO_TOOLS } from "./silvioTools.ts";
import { ruoloPrincipaleSilvio } from "./ruoloSilvio.ts";

/** Uno strumento del brief e quanto del suo risultato entra nel prompt. */
export interface StrumentoDelBrief {
  nome: string;
  argomenti: Record<string, unknown>;
  etichetta: string;
  maxCaratteri: number;
}

export const STRUMENTI_DEL_BRIEF: readonly StrumentoDelBrief[] = [
  { nome: "get_executive_snapshot", argomenti: {}, etichetta: "Executive snapshot", maxCaratteri: 2000 },
  { nome: "get_overdue_payments", argomenti: { only_grave: true, limit: 10 }, etichetta: "Crediti scaduti gravi", maxCaratteri: 1500 },
  { nome: "get_cashflow_status", argomenti: {}, etichetta: "Cashflow", maxCaratteri: 1500 },
  { nome: "lista_lavori_pose_periodo", argomenti: { days: 2 }, etichetta: "Lavori prossime 48h", maxCaratteri: 1500 },
];

const RUOLI_AMMINISTRATORE = ["super_admin", "company_admin"];

/** La riga staff_permissions dell'utente per quell'azienda, se c'è. */
export type PermessiUtente = Record<string, unknown> | null | undefined;

export interface PianoDelBrief {
  /** Il ruolo con cui Silvio tratta l'utente; null se non ha ruoli. */
  ruolo: string | null;
  strumenti: StrumentoDelBrief[];
  /** Se preparare le «azioni pronte» dagli avvisi dell'azienda. */
  azioniPronte: boolean;
}

/** Può questo ruolo, con questi permessi, avere nel brief lo strumento? */
export function strumentoConcesso(nome: string, ruolo: string, permessi: PermessiUtente): boolean {
  const tool = SILVIO_TOOLS[nome];
  if (!tool) return false;
  const ammessi = tool.allowedRoles && tool.allowedRoles.length > 0 ? tool.allowedRoles : DEFAULT_TOOL_ALLOWED_ROLES;
  if (!ammessi.includes(ruolo) && !ammessi.includes("*")) return false;
  if (RUOLI_AMMINISTRATORE.includes(ruolo)) return true;
  const chiave = tool.domain ? DOMAIN_STAFF_PERMISSION[tool.domain] : undefined;
  return !!chiave && permessi?.[chiave] === true;
}

export function pianoDelBrief(ruoli: readonly string[], permessi: PermessiUtente): PianoDelBrief {
  if (ruoli.length === 0) return { ruolo: null, strumenti: [], azioniPronte: false };
  const ruolo = ruoloPrincipaleSilvio(ruoli);
  return {
    ruolo,
    strumenti: STRUMENTI_DEL_BRIEF.filter((s) => strumentoConcesso(s.nome, ruolo, permessi)),
    azioniPronte: RUOLI_AMMINISTRATORE.includes(ruolo),
  };
}

/** C'è qualcosa da chiedere? Se no l'utente si salta prima di ogni query. */
export function briefDaFare(piano: PianoDelBrief): boolean {
  return piano.ruolo !== null && (piano.strumenti.length > 0 || piano.azioniPronte);
}

/** Quanto serve di un esito di executeToolWithRouting. */
export interface EsitoStrumento {
  success: boolean;
  data?: unknown;
}

export type EseguiStrumento = (nome: string, argomenti: Record<string, unknown>) => Promise<EsitoStrumento>;

export interface DatiDelBrief {
  /** Un blocco di testo per strumento riuscito, pronto per il prompt. */
  parti: string[];
  /** Gli strumenti i cui dati sono entrati nel prompt. */
  usati: string[];
  /** Almeno un risultato dice qualcosa (non è vuoto). */
  conContenuto: boolean;
}

/**
 * Esegue SOLO gli strumenti del piano e tiene solo gli esiti riusciti. Prima
 * un rifiuto o un errore entrava nel prompt come JSON ({success:false,…}) e il
 * modello partiva lo stesso.
 */
export async function raccogliDatiDelBrief(piano: PianoDelBrief, esegui: EseguiStrumento): Promise<DatiDelBrief> {
  const esiti = await Promise.allSettled(piano.strumenti.map((s) => esegui(s.nome, s.argomenti)));
  const dati: DatiDelBrief = { parti: [], usati: [], conContenuto: false };
  esiti.forEach((esito, i) => {
    if (esito.status !== "fulfilled" || !esito.value?.success) return;
    const s = piano.strumenti[i];
    dati.parti.push(`${s.etichetta}: ${JSON.stringify(esito.value.data ?? null).slice(0, s.maxCaratteri)}`);
    dati.usati.push(s.nome);
    if (!risultatoVuoto(esito.value.data)) dati.conContenuto = true;
  });
  return dati;
}

/** Niente da dire: nessun dato, lista vuota, oggetto vuoto o con count a zero. */
export function risultatoVuoto(dato: unknown): boolean {
  if (dato === null || dato === undefined) return true;
  if (Array.isArray(dato)) return dato.length === 0;
  if (typeof dato === "object") {
    const o = dato as Record<string, unknown>;
    return Object.keys(o).length === 0 || o.count === 0;
  }
  return false;
}
