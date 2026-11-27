/**
 * L'ultimo controllo prima di mandare al cliente: le date scritte nel messaggio
 * devono tornare (27/11/2026).
 *
 * Perché esiste. Il 25/11/2026, Il Bagno Group: l'appuntamento era venerdì 27
 * novembre alle 14:30, e il contesto lo diceva al modello con tanto di giorno
 * della settimana («venerdì 27 novembre 2026 alle 14:30»). Il modello ha
 * comunque scritto «giovedì è il 27 novembre». La cliente ha corretto, e lui ha
 * risposto «hai perfettamente ragione, la tua chiamata è confermata per giovedì
 * 26 novembre alle 14:30» — senza chiamare nessuno strumento. Sul calendario è
 * rimasto venerdì 27: la cliente ha aspettato giovedì e non l'ha chiamata
 * nessuno.
 *
 * Le regole scritte nel prompt non bastano, perché è proprio il modello che le
 * ha disattese: davanti a «ti sbagli» ha dato ragione al cliente invece che al
 * calendario. Serve un controllo che non dipenda dalla sua buona volontà.
 *
 * Due controlli, tutti e due di puro calendario:
 *
 * 1. COERENZA — un giorno della settimana scritto accanto a una data deve
 *    essere quello vero. «giovedì 27 novembre» quando il 27 è venerdì è
 *    sbagliato sempre, qualunque cosa ci sia in calendario. Nessun falso
 *    allarme possibile.
 *
 * 2. CONFERMA — se il contatto ha un appuntamento e il messaggio lo CONFERMA
 *    («confermata per…», «è fissata…», «ti aspetto…») nominando una data
 *    diversa da quella vera, è una promessa che il calendario non mantiene.
 *    Si guardano solo le frasi di conferma, non le proposte: proporre altri
 *    orari è lecito e non deve essere bloccato.
 *
 * Chi chiama decide cosa fare quando il controllo non passa: qui non si manda
 * niente e non si lancia niente.
 */

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** Accentate e non: il modello scrive sia «lunedì» che «lunedi». */
const GIORNI_RX = "lunedì|lunedi|martedì|martedi|mercoledì|mercoledi|giovedì|giovedi|venerdì|venerdi|sabato|domenica";
const MESI_RX = MESI.join("|");

/**
 * Quello che può stare fra il giorno della settimana e il numero: niente
 * («giovedì 27»), oppure il «è il» di «giovedì è il 27 novembre» — la frase
 * esatta con cui è partito l'equivoco del 25/11.
 *
 * Attenzione: dopo «giovedì» non si può mettere `\b`. Per JavaScript la «ì»
 * non è una lettera, quindi fra «ì» e lo spazio non c'è nessun confine e il
 * gruppo non aggancia mai. Il separatore obbligatorio qui sotto fa già da
 * confine.
 */
const DOPO_GIORNO = "(?:\\s*,)?\\s+(?:(?:è|e)\\s+il\\s+|il\\s+)?";

function indiceGiorno(parola: string): number {
  const p = parola.toLowerCase().replace(/i$/, "ì");
  const i = GIORNI.indexOf(p);
  return i >= 0 ? i : GIORNI.indexOf(parola.toLowerCase());
}

/** Il giorno della settimana di una data, senza fusi orari di mezzo. */
export function giornoSettimanaDi(anno: number, mese1: number, giorno: number): number {
  return new Date(Date.UTC(anno, mese1 - 1, giorno, 12)).getUTCDay();
}

function esiste(anno: number, mese1: number, giorno: number): boolean {
  const d = new Date(Date.UTC(anno, mese1 - 1, giorno, 12));
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese1 - 1 && d.getUTCDate() === giorno;
}

function iso(anno: number, mese1: number, giorno: number): string {
  return `${anno}-${String(mese1).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

function giorniTra(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
}

/**
 * L'anno sottinteso da «27 novembre» scritto oggi: quello che cade più vicino
 * a oggi, guardando avanti di preferenza. In chat si parla delle prossime
 * settimane, non dell'anno scorso.
 */
function annoSottinteso(oggi: string, mese1: number, giorno: number): number | null {
  const annoOggi = Number(oggi.slice(0, 4));
  const candidati = [annoOggi - 1, annoOggi, annoOggi + 1]
    .filter((a) => esiste(a, mese1, giorno))
    .map((a) => ({ anno: a, distanza: giorniTra(iso(a, mese1, giorno), oggi) }))
    // Indietro si guarda poco (una settimana): «ieri era il 20» è plausibile,
    // «il 20 di undici mesi fa» no.
    .filter((c) => c.distanza >= -7 && c.distanza <= 365)
    .sort((x, y) => Math.abs(x.distanza) - Math.abs(y.distanza));
  return candidati.length ? candidati[0].anno : null;
}

/**
 * La data intera dietro un «27» senza mese: quella più vicina a oggi con quel
 * numero. Se due mesi diversi sono ugualmente vicini non si decide: meglio non
 * controllare che controllare la data sbagliata.
 */
function dataDaSoloGiorno(oggi: string, giorno: number): string | null {
  const annoOggi = Number(oggi.slice(0, 4));
  const meseOggi = Number(oggi.slice(5, 7));
  const candidati: { data: string; distanza: number }[] = [];
  for (let salto = -1; salto <= 2; salto++) {
    const m = meseOggi + salto;
    const anno = annoOggi + Math.floor((m - 1) / 12);
    const mese1 = ((m - 1 + 12 * 12) % 12) + 1;
    if (!esiste(anno, mese1, giorno)) continue;
    const data = iso(anno, mese1, giorno);
    const distanza = giorniTra(data, oggi);
    if (distanza < -7 || distanza > 60) continue;
    candidati.push({ data, distanza });
  }
  candidati.sort((x, y) => Math.abs(x.distanza) - Math.abs(y.distanza));
  if (!candidati.length) return null;
  if (candidati.length > 1 && Math.abs(candidati[0].distanza) === Math.abs(candidati[1].distanza)) return null;
  return candidati[0].data;
}

export interface DataNelTesto {
  /** Il pezzo di testo da cui viene, per il messaggio al team. */
  testo: string;
  /** "2026-11-27", o null se non si è riusciti a capire di che data si parla. */
  data: string | null;
  /** 0-6, o null se il messaggio non nominava il giorno della settimana. */
  giornoScritto: number | null;
}

/**
 * Le date nominate nel messaggio: «venerdì 27 novembre», «27 novembre»,
 * «venerdì 27», «27/11».
 */
export function dateNelTesto(testo: string, oggi: string): DataNelTesto[] {
  const trovate: DataNelTesto[] = [];
  const visti = new Set<string>();
  const aggiungi = (d: DataNelTesto) => {
    const chiave = `${d.data}|${d.giornoScritto}|${d.testo.toLowerCase()}`;
    if (visti.has(chiave)) return;
    visti.add(chiave);
    trovate.push(d);
  };

  // «venerdì 27 novembre», «27 novembre», con o senza anno.
  const conMese = new RegExp(
    `(?:\\b(${GIORNI_RX})${DOPO_GIORNO})?\\b(\\d{1,2})\\s+(${MESI_RX})\\b(?:\\s+(\\d{4}))?`,
    "gi",
  );
  for (const m of testo.matchAll(conMese)) {
    const giorno = Number(m[2]);
    const mese1 = MESI.indexOf(m[3].toLowerCase()) + 1;
    const anno = m[4] ? Number(m[4]) : annoSottinteso(oggi, mese1, giorno);
    const valida = anno !== null && esiste(anno, mese1, giorno);
    aggiungi({
      testo: m[0].trim(),
      data: valida ? iso(anno!, mese1, giorno) : null,
      giornoScritto: m[1] ? indiceGiorno(m[1]) : null,
    });
  }

  // «venerdì 27» senza mese: solo col giorno della settimana davanti, altrimenti
  // si prenderebbero numeri che non sono date («27 mq», «27 €»).
  const soloGiorno = new RegExp(`\\b(${GIORNI_RX})${DOPO_GIORNO}(\\d{1,2})\\b(?!\\s*(?:${MESI_RX})|\\s*[:.]\\d|\\s*/)`, "gi");
  for (const m of testo.matchAll(soloGiorno)) {
    const giorno = Number(m[2]);
    if (giorno < 1 || giorno > 31) continue;
    aggiungi({ testo: m[0].trim(), data: dataDaSoloGiorno(oggi, giorno), giornoScritto: indiceGiorno(m[1]) });
  }

  // «venerdì 27/11», «27/11/2026».
  const barre = new RegExp(`(?:\\b(${GIORNI_RX})${DOPO_GIORNO})?\\b(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b`, "gi");
  for (const m of testo.matchAll(barre)) {
    const giorno = Number(m[2]);
    const mese1 = Number(m[3]);
    if (mese1 < 1 || mese1 > 12) continue;
    let anno: number | null;
    if (m[4]) anno = Number(m[4].length === 2 ? `20${m[4]}` : m[4]);
    else anno = annoSottinteso(oggi, mese1, giorno);
    const valida = anno !== null && esiste(anno, mese1, giorno);
    aggiungi({
      testo: m[0].trim(),
      data: valida ? iso(anno!, mese1, giorno) : null,
      giornoScritto: m[1] ? indiceGiorno(m[1]) : null,
    });
  }

  return trovate;
}

/**
 * Le parole con cui si dà per fatto un appuntamento. Una proposta («ti andrebbe
 * bene giovedì?») non è qui dentro di proposito: proporre altri orari è lecito.
 */
const CONFERMA = [
  "confermat", "è fissat", "e fissat", "ho fissat", "abbiamo fissat", "ti ho fissat",
  "è spostat", "e spostat", "ho spostat", "l'ho spostat", "spostata a", "spostato a",
  "ti aspett", "ci sentiamo", "ti chiamiamo", "ti chiamerà", "ti chiamera", "ti richiamiamo",
  "rimane", "resta fissat", "appuntamento è", "chiamata è",
];

function parlaDiConferma(testo: string): boolean {
  const t = testo.toLowerCase();
  return CONFERMA.some((p) => t.includes(p));
}

export interface EsitoControlloDate {
  ok: boolean;
  /** Perché non passa, in italiano, per l'avviso al team. Vuoto se passa. */
  motivo: string;
}

export interface AppuntamentoVero {
  /** "2026-11-27" */
  data: string;
  /** "14:30" */
  ora: string;
}

/**
 * @param testo       il messaggio che sta per partire
 * @param oggi        "2026-11-27", ora di Roma
 * @param appuntamento l'appuntamento vero LETTO ADESSO, dopo gli strumenti, o null
 */
export function controllaDateRisposta(
  testo: string,
  oggi: string,
  appuntamento: AppuntamentoVero | null,
): EsitoControlloDate {
  const date = dateNelTesto(testo ?? "", oggi);

  // 1. Il giorno della settimana deve essere quello vero.
  for (const d of date) {
    if (d.giornoScritto === null || !d.data) continue;
    const [a, m, g] = d.data.split("-").map(Number);
    const vero = giornoSettimanaDi(a, m, g);
    if (vero !== d.giornoScritto) {
      return {
        ok: false,
        motivo: `nel messaggio c'è «${d.testo}», ma il ${g} ${MESI[m - 1]} ${a} è ${GIORNI[vero]}`,
      };
    }
  }

  // 2. Non si conferma una data diversa da quella in calendario.
  if (appuntamento && parlaDiConferma(testo)) {
    const diverse = date.filter((d) => d.data && d.data !== appuntamento.data);
    if (diverse.length) {
      const [a, m, g] = appuntamento.data.split("-").map(Number);
      const quando = `${GIORNI[giornoSettimanaDi(a, m, g)]} ${g} ${MESI[m - 1]} alle ${appuntamento.ora}`;
      return {
        ok: false,
        motivo: `il messaggio dà per confermato «${diverse[0].testo}», ma in calendario c'è ${quando}`,
      };
    }
  }

  return { ok: true, motivo: "" };
}
