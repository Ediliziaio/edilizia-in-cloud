/**
 * La scheda di una linea del listino: la foto del profilo, il testo che lo
 * racconta, i dati tecnici (profondità, camere, guarnizioni, Uw) e la scheda
 * del produttore di «PVC Salamander 76».
 *
 * La linea non è una tabella: è un valore dell'asse «Linea» ripetuto su ogni
 * prodotto (Renova: 23 volte), oppure una categoria dentro la tipologia. La
 * scheda si scrive una volta sola e si ritrova per tipologia e nome della
 * linea scritto in qualunque modo, con la stessa regola con cui il listino
 * unisce le linee.
 *
 * La leggono il listino (sotto le linguette delle linee), il preventivatore
 * (quando si sceglie la linea) e il PDF del preventivo (pagina «Il sistema
 * scelto»).
 */
import { chiaveTesto } from "./areeStandard";

export interface SchedaLinea {
  id: string;
  company_id: string;
  /** La tipologia (macrocategoria) della linea; null per i prodotti senza tipologia. */
  macrocategoria_id: string | null;
  /** Il nome normalizzato: «PVC Salamander 76» → «pvc_salamander_76». */
  chiave: string;
  nome: string;
  descrizione: string | null;
  immagine_url: string | null;
  profondita_mm: number | null;
  camere: number | null;
  guarnizioni: number | null;
  /** La trasmittanza migliore dichiarata dal produttore: «fino a». */
  uw: number | null;
  scheda_tecnica_url: string | null;
  scheda_tecnica_nome: string | null;
}

/** Gli assi che fanno da linea: «Linea», o «Serie» nei listini importati per serie di profilo. */
const CODICI_ASSE_LINEA = new Set(["linea", "serie"]);

/** Un asse fa da linea se si chiama così nel codice o nel nome, scritto in qualunque modo. */
export function eAsseLinea(asse: { codice?: string | null; nome?: string | null }): boolean {
  return CODICI_ASSE_LINEA.has(chiaveTesto(asse.codice)) || CODICI_ASSE_LINEA.has(chiaveTesto(asse.nome));
}

export type IndiceSchede = Map<string, SchedaLinea>;

function chiaveIndice(macrocategoriaId: string | null | undefined, chiave: string): string {
  return `${macrocategoriaId ?? "-"}|${chiave}`;
}

export function indiceSchede(schede: readonly SchedaLinea[]): IndiceSchede {
  return new Map(schede.map((s) => [chiaveIndice(s.macrocategoria_id, s.chiave), s] as const));
}

/**
 * La scheda di una linea: prima quella della sua tipologia, poi quella scritta
 * per i prodotti senza tipologia. «PVC» delle tapparelle e «PVC» dei
 * cassonetti restano due schede diverse.
 */
export function trovaSchedaLinea(
  indice: IndiceSchede,
  macrocategoriaId: string | null | undefined,
  nomeLinea: string | null | undefined,
): SchedaLinea | null {
  const chiave = chiaveTesto(nomeLinea);
  if (!chiave) return null;
  return indice.get(chiaveIndice(macrocategoriaId, chiave)) ?? indice.get(chiaveIndice(null, chiave)) ?? null;
}

/** Una scheda senza foto, testo, dati e documento: come se non ci fosse. */
export function schedaVuota(scheda: SchedaLinea | null | undefined): boolean {
  if (!scheda) return true;
  return (
    !scheda.immagine_url &&
    !(scheda.descrizione ?? "").trim() &&
    scheda.profondita_mm == null &&
    scheda.camere == null &&
    scheda.guarnizioni == null &&
    scheda.uw == null &&
    !scheda.scheda_tecnica_url
  );
}

export interface DatoTecnico {
  /** «Profondità» */
  etichetta: string;
  /** «76 mm» */
  valore: string;
  /** «76 mm», «6 camere», «Uw 0,9»: per le righe strette. */
  breve: string;
}

const NUMERO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

export function datiTecniciScheda(
  scheda: Pick<SchedaLinea, "profondita_mm" | "camere" | "guarnizioni" | "uw">,
): DatoTecnico[] {
  const dati: DatoTecnico[] = [];
  if (scheda.profondita_mm != null) {
    const mm = `${NUMERO.format(scheda.profondita_mm)} mm`;
    dati.push({ etichetta: "Profondità", valore: mm, breve: mm });
  }
  if (scheda.camere != null) {
    const n = NUMERO.format(scheda.camere);
    dati.push({ etichetta: "Camere", valore: n, breve: `${n} ${scheda.camere === 1 ? "camera" : "camere"}` });
  }
  if (scheda.guarnizioni != null) {
    const n = NUMERO.format(scheda.guarnizioni);
    dati.push({ etichetta: "Guarnizioni", valore: n, breve: `${n} ${scheda.guarnizioni === 1 ? "guarnizione" : "guarnizioni"}` });
  }
  if (scheda.uw != null) {
    const uw = NUMERO.format(scheda.uw);
    dati.push({ etichetta: "Isolamento termico", valore: `Uw fino a ${uw} W/m²K`, breve: `Uw ${uw}` });
  }
  return dati;
}

interface AsseConValori {
  codice: string;
  nome?: string | null;
  values: ReadonlyArray<{ id: string; label?: string | null; valore?: string | null }>;
}

/** Il nome della linea scelta su una riga di preventivo: il valore dell'asse «Linea» o «Serie». */
export function nomeLineaScelta(
  assi: readonly AsseConValori[] | null | undefined,
  valoriAssi: Record<string, string> | null | undefined,
): string | null {
  if (!assi || !valoriAssi) return null;
  for (const asse of assi) {
    if (!eAsseLinea(asse)) continue;
    const scelto = valoriAssi[asse.codice];
    const valore = scelto ? asse.values.find((v) => v.id === scelto) : undefined;
    const nome = valore?.label?.trim() || valore?.valore?.trim();
    if (nome) return nome;
  }
  return null;
}

/** La linea di un prodotto su una riga: il valore scelto sull'asse Linea, altrimenti la sua categoria. */
export function lineaDellaRiga(opts: {
  assi?: readonly AsseConValori[] | null;
  valoriAssi?: Record<string, string> | null;
  categoria?: string | null;
}): string | null {
  return nomeLineaScelta(opts.assi, opts.valoriAssi) ?? (opts.categoria?.trim() || null);
}

export interface RigaConLinea {
  macrocategoriaId: string | null;
  linea: string | null;
  /** Il nome del prodotto, per dire nel PDF dove si usa la linea. */
  prodotto: string | null;
}

export interface SchedaUsata {
  scheda: SchedaLinea;
  prodotti: string[];
}

/** Le schede delle linee di un preventivo, nell'ordine in cui compaiono, una volta sola. */
export function schedeUsate(righe: readonly RigaConLinea[], indice: IndiceSchede): SchedaUsata[] {
  const perScheda = new Map<string, SchedaUsata>();
  for (const riga of righe) {
    const scheda = trovaSchedaLinea(indice, riga.macrocategoriaId, riga.linea);
    if (!scheda || schedaVuota(scheda)) continue;
    const usata = perScheda.get(scheda.id) ?? { scheda, prodotti: [] };
    const prodotto = riga.prodotto?.trim();
    if (prodotto && !usata.prodotti.includes(prodotto)) usata.prodotti.push(prodotto);
    perScheda.set(scheda.id, usata);
  }
  return [...perScheda.values()];
}

/** «Finestra 1 Anta, Finestra 2 Ante e altri 3». */
export function elencoProdotti(prodotti: readonly string[], massimo = 3): string {
  if (prodotti.length === 0) return "";
  if (prodotti.length === 1) return prodotti[0];
  if (prodotti.length <= massimo) return `${prodotti.slice(0, -1).join(", ")} e ${prodotti[prodotti.length - 1]}`;
  const resto = prodotti.length - massimo;
  return `${prodotti.slice(0, massimo).join(", ")} e ${resto === 1 ? "un altro" : `altri ${resto}`}`;
}

// ─── La scheda come si scrive nel modulo ────────────────────────────────────

export const DESCRIZIONE_SCHEDA_MAX = 2000;

/** I campi del modulo, come testo: «0,9» con la virgola. */
export interface BozzaScheda {
  descrizione: string;
  profondita: string;
  camere: string;
  guarnizioni: string;
  uw: string;
}

export interface ValoriScheda {
  descrizione: string | null;
  profondita_mm: number | null;
  camere: number | null;
  guarnizioni: number | null;
  uw: number | null;
}

export type EsitoBozza =
  | { ok: true; valori: ValoriScheda }
  | { ok: false; errori: Partial<Record<keyof BozzaScheda, string>> };

const ERRORE = Symbol("errore");

function intero(testo: string, min: number, max: number): number | null | typeof ERRORE {
  const t = testo.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return ERRORE;
  const n = Number(t);
  return n >= min && n <= max ? n : ERRORE;
}

function decimale(testo: string, minEscluso: number, maxEscluso: number): number | null | typeof ERRORE {
  const t = testo.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return ERRORE;
  const n = Number(t);
  return n > minEscluso && n < maxEscluso ? n : ERRORE;
}

export function bozzaDaScheda(scheda: SchedaLinea | null | undefined): BozzaScheda {
  const testo = (n: number | null | undefined) => (n == null ? "" : NUMERO.format(n).replace(/\./g, ""));
  return {
    descrizione: scheda?.descrizione ?? "",
    profondita: testo(scheda?.profondita_mm),
    camere: testo(scheda?.camere),
    guarnizioni: testo(scheda?.guarnizioni),
    uw: testo(scheda?.uw),
  };
}

/** Controlla il modulo con gli stessi limiti del database. */
export function leggiBozzaScheda(bozza: BozzaScheda): EsitoBozza {
  const errori: Partial<Record<keyof BozzaScheda, string>> = {};
  const profondita = intero(bozza.profondita, 1, 1000);
  if (profondita === ERRORE) errori.profondita = "Scrivi i millimetri, per esempio 76.";
  const camere = intero(bozza.camere, 1, 20);
  if (camere === ERRORE) errori.camere = "Un numero da 1 a 20.";
  const guarnizioni = intero(bozza.guarnizioni, 1, 10);
  if (guarnizioni === ERRORE) errori.guarnizioni = "Un numero da 1 a 10.";
  const uw = decimale(bozza.uw, 0, 10);
  if (uw === ERRORE) errori.uw = "Un numero come 0,9 o 1,3.";
  const descrizione = bozza.descrizione.trim();
  if (descrizione.length > DESCRIZIONE_SCHEDA_MAX) errori.descrizione = `Al massimo ${DESCRIZIONE_SCHEDA_MAX} caratteri.`;
  if (profondita === ERRORE || camere === ERRORE || guarnizioni === ERRORE || uw === ERRORE || errori.descrizione) {
    return { ok: false, errori };
  }
  return {
    ok: true,
    valori: { descrizione: descrizione || null, profondita_mm: profondita, camere, guarnizioni, uw },
  };
}
