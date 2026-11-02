/**
 * Prima di partire (1/11/2026, fase 5, lotto 5.2): l'avviso meteo per le fasi all'aperto e gli
 * adempimenti che vanno fatti prima di aprire il cantiere. Vedi docs/piano-silvio-commessa-ai.md.
 *
 * Il meteo è una regola stagionale, non una previsione: nessun servizio meteo viene chiamato.
 * Una fase all'aperto (tetto, facciata, scavi, esterni) che cade in un mese a rischio riceve un
 * avviso col perché («sotto i 5 °C malte e guaine non fanno presa»), da mettere in conto nei tempi.
 *
 * Gli adempimenti diventano scadenze della commessa (`adempimenti_sicurezza`), con la data
 * entro cui farli. Silvio non sa se il tecnico li ha già fatti: sono promemoria da spuntare.
 * - CILA o SCIA: per i lavori che toccano parti dell'edificio (ristrutturazioni, bagni rifatti,
 *   tetti, facciate e cappotti, scavi e ampliamenti); non per serramenti, fotovoltaico,
 *   impianti, pavimenti e climatizzazione, che di regola sono edilizia libera.
 * - Notifica preliminare all'ASL e all'Ispettorato (art. 99 del D.Lgs. 81/2008): quando in
 *   cantiere lavora più di un'impresa (l'azienda e almeno una ditta), o quando i lavori superano
 *   i 200 uomini-giorno.
 * - Cartello di cantiere: con un titolo edilizio, va esposto dal primo giorno.
 * - Suolo pubblico: ponteggi, cassoni e mezzi sulla strada vogliono l'autorizzazione del Comune.
 *
 * Funzioni pure, senza dipendenze, compatibili con Deno.
 */
import { CALENDARIO_NAZIONALE, lavorativiTra, lavorativo, spostaLavorativi, type CalendarioCantiere } from "./calendario.ts";
import { dataCorta } from "./date.ts";

// ── Meteo ───────────────────────────────────────────────────────────────────

interface RegolaMeteo {
  tipo: "copertura" | "facciata" | "scavi" | "esterni";
  parole: RegExp;
  /** Mese (1–12) → il perché. */
  mesi: Readonly<Record<number, string>>;
}

const FREDDO = "sotto i 5 °C malte, collanti e guaine non fanno presa, e il gelo di notte rovina il lavoro del giorno";
const PIOGGIA = "è un mese piovoso: mettere in conto giorni fermi";

/**
 * Quello che sta al coperto anche se ha una parola da esterno (revisione 2/11, G19): la doccia
 * si impermeabilizza dentro, i mobili si coprono dentro, il massetto si getta dentro.
 */
const AL_COPERTO = /\b(docc|bagn|mobil|arred|massett|intern[oiae]\b|cantin|sottotett)/i;

const REGOLE_METEO: readonly RegolaMeteo[] = [
  { tipo: "copertura", parole: /\b(tett|copertur|coppi|tegol|guain|lattoner|gronda|falde?|lucernar|fotovoltaic|pannell[io] solar)/i,
    mesi: { 11: FREDDO, 12: FREDDO, 1: FREDDO, 2: FREDDO, 3: PIOGGIA, 10: PIOGGIA,
      7: "col caldo il lavoro in quota va fatto nelle ore fresche, e le guaine al sole si rovinano",
      8: "col caldo il lavoro in quota va fatto nelle ore fresche, e le guaine al sole si rovinano" } },
  { tipo: "facciata", parole: /\b(facciat|cappotto|intonac[oi] estern|tinteggiatura estern|ponteggi|rasatur[ae] estern|balcon|terrazz|impermeabilizz)/i,
    mesi: { 11: FREDDO, 12: FREDDO, 1: FREDDO, 2: FREDDO, 3: PIOGGIA, 10: PIOGGIA } },
  { tipo: "scavi", parole: /\b(scav|fondazion|sbanc|movimento terra|drenagg|plint|platea|getto)/i,
    mesi: { 11: "il terreno bagnato frana e il fondo dello scavo si rovina", 12: FREDDO, 1: FREDDO, 2: FREDDO,
      3: "il terreno bagnato frana e il fondo dello scavo si rovina" } },
  { tipo: "esterni", parole: /\b(giardin|recinzion|pavimentazion[ei] estern|asfalt|piscin|vialett|cortil|esterni)/i,
    mesi: { 11: PIOGGIA, 12: FREDDO, 1: FREDDO, 2: FREDDO } },
];

const NOMI_MESI = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

export interface AvvisoMeteo {
  fase: string;
  tipo: RegolaMeteo["tipo"];
  /** I mesi a rischio in cui cade la fase, in parole. */
  mesi: string[];
  motivo: string;
}

/** La fase si fa all'aperto? Il tipo di lavoro, o null. */
export function faseAllAperto(nome: string): RegolaMeteo["tipo"] | null {
  if (AL_COPERTO.test(nome)) return null;
  return REGOLE_METEO.find((r) => r.parole.test(nome))?.tipo ?? null;
}

/** I mesi (1–12) toccati da un periodo, al massimo un anno. */
function mesiDelPeriodo(dal: string, al: string): number[] {
  const out: number[] = [];
  let a = Number(dal.slice(0, 4));
  let m = Number(dal.slice(5, 7));
  const fineA = Number(al.slice(0, 4));
  const fineM = Number(al.slice(5, 7));
  for (let i = 0; i < 12 && (a < fineA || (a === fineA && m <= fineM)); i++) {
    out.push(m);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

/** Gli avvisi meteo delle fasi con le date: solo quelle all'aperto, nei mesi a rischio. */
export function avvisiMeteo(fasi: readonly { nome: string; dal: string | null; al: string | null }[]): AvvisoMeteo[] {
  const out: AvvisoMeteo[] = [];
  for (const f of fasi) {
    if (!f.dal || AL_COPERTO.test(f.nome)) continue;
    const regola = REGOLE_METEO.find((r) => r.parole.test(f.nome));
    if (!regola) continue;
    const mesi = mesiDelPeriodo(f.dal, f.al && f.al >= f.dal ? f.al : f.dal).filter((m) => regola.mesi[m]);
    if (!mesi.length) continue;
    const motivi = [...new Set(mesi.map((m) => regola.mesi[m]))];
    out.push({ fase: f.nome, tipo: regola.tipo, mesi: mesi.map((m) => NOMI_MESI[m]), motivo: motivi.join("; ") });
  }
  return out;
}

/** «Rifacimento tetto (novembre): sotto i 5 °C …». */
export function avvisoMeteoInParole(a: AvvisoMeteo): string {
  return `${a.fase} (${a.mesi.join(", ")}): ${a.motivo}.`;
}

// ── Adempimenti ─────────────────────────────────────────────────────────────

export type TipoAdempimento = "cila_scia" | "notifica_preliminare" | "cartello_cantiere" | "suolo_pubblico";

/** Un adempimento in `sicurezza.adempimenti` → `adempimenti_sicurezza` della commessa. */
export interface AdempimentoDelPiano {
  tipo: TipoAdempimento;
  titolo: string;
  /** Il perché e cosa fare, per le note della scadenza. */
  testo: string;
  scadenza: string | null;
  /** La scadenza è già passata (revisione 2/11, G17): la persona lo deve leggere. */
  avviso?: string | null;
}

/** I lavori che di regola vogliono un titolo edilizio (CILA o SCIA). */
const CON_TITOLO = /\b(ristruttur|demoli|tramezz|bagn|tett|copertur|facciat|cappotto|scav|ampliament|fondazion|solai|muratur|frazionament|soppalc|consolidament|sismic)/i;
/** I lavori che occupano la strada: ponteggio, cassone, gru. */
const SULLA_STRADA = /\b(ponteggi|facciat|cappotto|tett|copertur|demoli|scav|gru|cassone|container|autogru|piattaform)/i;

/** Quanti uomini-giorno oltre cui la notifica preliminare serve anche con un'impresa sola. */
export const SOGLIA_UOMINI_GIORNO = 200;
/** Persone per fase quando la squadra non c'è ancora: la squadra tipica di un cantiere piccolo. */
const PERSONE_PREDEFINITE = 2;

export interface DatiPartenza {
  /** Testi che dicono il lavoro: tipo di lavoro, titolo, descrizione. */
  lavoro: string;
  fasi: readonly { nome: string; dal: string | null; al: string | null; giorni?: number | null; persone?: number | null }[];
  /** Inizio dei lavori (AAAA-MM-GG), o null. */
  inizio: string | null;
  /** Quante ditte esterne lavorano in cantiere oltre all'azienda. */
  ditte: number;
  /** AAAA-MM-GG a Roma: per dire quali scadenze sono già passate. */
  oggi?: string | null;
}

/** Uomini-giorno stimati: giorni lavorativi della fase × persone (2 se la squadra non c'è). */
export function uominiGiorno(d: DatiPartenza, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): number {
  return d.fasi.reduce((t, f) => {
    const giorni = f.giorni && f.giorni > 0 ? f.giorni
      : f.dal && f.al && f.al >= f.dal ? contaLavorativi(f.dal, f.al, cal) : 0;
    return t + giorni * (f.persone && f.persone > 0 ? f.persone : PERSONE_PREDEFINITE);
  }, 0);
}

function contaLavorativi(dal: string, al: string, cal: CalendarioCantiere): number {
  return (lavorativo(dal, cal) ? 1 : 0) + Math.max(0, lavorativiTra(dal, al, cal));
}

/**
 * Gli adempimenti prima di partire, con la scadenza in giorni lavorativi prima dell'inizio
 * (null se l'inizio non c'è ancora: la data arriva con le date).
 */
export function adempimentiPrimaDiPartire(d: DatiPartenza, cal: CalendarioCantiere = CALENDARIO_NAZIONALE): AdempimentoDelPiano[] {
  const testi = [d.lavoro, ...d.fasi.map((f) => f.nome)].join(" · ");
  const entro = (giorni: number) => (d.inizio ? spostaLavorativi(d.inizio, -giorni, cal) : null);
  const dal = d.inizio ? ` (inizio lavori ${dataCorta(d.inizio)})` : "";
  const out: AdempimentoDelPiano[] = [];
  const titolo = CON_TITOLO.test(testi);

  if (titolo) {
    out.push({
      tipo: "cila_scia", titolo: "Titolo edilizio: CILA o SCIA depositata prima di iniziare", scadenza: entro(5),
      testo: `Questi lavori di regola richiedono la CILA (o la SCIA, se toccano le strutture), depositata in Comune dal tecnico prima dell'inizio${dal}. Silvio non sa se è già stata fatta: verifica col tecnico e spunta.`,
    });
    out.push({
      tipo: "cartello_cantiere", titolo: "Cartello di cantiere esposto dal primo giorno", scadenza: d.inizio,
      testo: "Con un titolo edilizio il cartello va esposto all'ingresso del cantiere: estremi della CILA o SCIA, committente, impresa, direttore dei lavori, coordinatore della sicurezza, date.",
    });
  }

  const ug = uominiGiorno(d, cal);
  const piuImprese = d.ditte > 0;
  if (piuImprese || ug > SOGLIA_UOMINI_GIORNO) {
    const perche = [piuImprese ? `in cantiere lavorano più imprese (l'azienda e ${d.ditte === 1 ? "una ditta" : `${d.ditte} ditte`})` : "",
      ug > SOGLIA_UOMINI_GIORNO ? `i lavori stimati sono circa ${ug} uomini-giorno, oltre i ${SOGLIA_UOMINI_GIORNO}` : ""].filter(Boolean).join(" e ");
    out.push({
      tipo: "notifica_preliminare", titolo: "Notifica preliminare all'ASL e all'Ispettorato del lavoro", scadenza: entro(3),
      testo: `Serve perché ${perche} (art. 99 del D.Lgs. 81/2008). La trasmette il committente o il responsabile dei lavori prima dell'inizio${dal}, e una copia va affissa in cantiere. Con più imprese serve anche il coordinatore della sicurezza (PSC).`,
    });
  }

  if (SULLA_STRADA.test(testi)) {
    out.push({
      tipo: "suolo_pubblico", titolo: "Occupazione di suolo pubblico, se ponteggio o cassone vanno sulla strada", scadenza: entro(10),
      testo: "Se ponteggio, cassone delle macerie o mezzi occupano marciapiede o strada serve l'autorizzazione del Comune (di solito da chiedere almeno 10–15 giorni prima). Se il cantiere sta tutto nel privato, spunta e basta.",
    });
  }
  return out.map((a) => ({ ...a, avviso: avvisoScadenza(a.scadenza, d.oggi) }));
}

/** «Andava fatto entro il 28/10: è già passato.», o null. */
export function avvisoScadenza(scadenza: string | null, oggi: string | null | undefined): string | null {
  return scadenza && oggi && scadenza < oggi ? `Andava fatto entro il ${dataCorta(scadenza)}: la data è già passata, fallo subito.` : null;
}
