/**
 * Confronto fra ciò che l'AI ha letto e ciò che era scritto davvero (30/10/2026).
 *
 * Serve a misurare la lettura dei documenti: su un insieme di documenti con la
 * risposta giusta già nota (scripts/valuta-lettura.ts) e, quando se ne
 * registreranno, su quanto l'utente ha corretto prima di confermare
 * (`correzioniUtente`). Stesse regole per entrambi: un campo è giusto se un
 * contabile direbbe che è lo stesso valore, non se la stringa è identica.
 *
 * Quattro modi di sbagliare, tenuti separati perché si curano in modo diverso:
 *   · errato     — c'è un valore, ma non è quello scritto;
 *   · mancante   — il documento lo riporta e l'AI non l'ha letto;
 *   · inventato  — il documento non lo riporta e l'AI ha scritto un valore;
 *   · (giusti)   — esatto, oppure equivalente (maiuscole, spazi, formato della data).
 *
 * Puro: niente rete, niente Deno, niente data corrente.
 */
import { num } from "./controlliDocumento.ts";

export type EsitoCampo = "esatto" | "equivalente" | "errato" | "mancante" | "inventato";

export interface CampoValutato {
  /** «cedente.piva», «righe[2].quantita»; «(valore)» se il documento è un solo valore. */
  percorso: string;
  atteso: unknown;
  letto: unknown;
  esito: EsitoCampo;
}

export interface Valutazione {
  campi: CampoValutato[];
  conteggi: Record<EsitoCampo, number>;
  /** Campi attesi letti giusti (esatto + equivalente) su quelli attesi: 0..1. Null se non c'era niente da leggere. */
  accuratezza: number | null;
  /** Nessun campo errato, mancante o inventato. */
  perfetta: boolean;
}

type Foglie = Map<string, unknown>;

const PROFONDITA_MASSIMA = 8;
const FOGLIE_MASSIME = 4000;

/** Un valore «vuoto» vale come «il documento non lo dice»: undefined, null e stringa vuota. */
const vuoto = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Le foglie di un JSON con il loro percorso. Le liste si leggono per posizione. */
function foglie(valore: unknown): Foglie {
  const out: Foglie = new Map();
  const visita = (v: unknown, percorso: string, profondita: number) => {
    if (out.size >= FOGLIE_MASSIME) return;
    if (Array.isArray(v) && profondita < PROFONDITA_MASSIMA) {
      v.forEach((x, i) => visita(x, `${percorso}[${i}]`, profondita + 1));
    } else if (v && typeof v === "object" && !Array.isArray(v) && profondita < PROFONDITA_MASSIMA) {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        visita(x, percorso ? `${percorso}.${k}` : k, profondita + 1);
      }
    } else {
      out.set(percorso || "(valore)", v);
    }
  };
  visita(valore, "", 0);
  return out;
}

/** Il nome del campo, senza le posizioni: «righe[2].quantita» → «quantita». */
const nomeCampo = (percorso: string): string => percorso.replace(/\[\d+\]/g, "").split(".").pop() ?? percorso;

const CAMPO_PIVA = /^(piva|p_iva|partita_iva|vat|vat_number|supplier_vat)$/i;
const CAMPO_CODICE_FISCALE = /^(cf|codice_fiscale|fiscal_code)$/i;
const CAMPO_DATA = /(^|_)(data|date|scadenza)(_|$)/i;

/** Partita IVA senza spazi, punti e trattini e senza il prefisso IT; una estera («DE123456789») resta com'è. */
function normalizzaPiva(v: string): string {
  const s = v.replace(/[\s.\-]/g, "").toUpperCase();
  return /^IT\d{11}$/.test(s) ? s.slice(2) : s;
}

/** Data in AAAA-MM-GG se si riconosce («12/10/2026», «12-10-2026», «2026/10/12»); altrimenti il testo pulito. */
function normalizzaData(v: string): string {
  const s = v.trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  const ita = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  const [a, m, g] = iso ? [iso[1], iso[2], iso[3]] : ita ? [ita[3], ita[2], ita[1]] : [null, null, null];
  if (!a || !m || !g) return s;
  return `${a}-${m.padStart(2, "0")}-${g.padStart(2, "0")}`;
}

const spaziPuliti = (s: string) => s.trim().replace(/\s+/g, " ");

/** Il valore come testo; un oggetto rimasto oltre la profondità massima si confronta per il suo JSON. */
const testo = (v: unknown): string => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * La forma «povera» di un testo: minuscolo, senza accenti, punteggiatura e spazi.
 * Il punto e la virgola fra due cifre restano: «12.5» e «125» non sono lo stesso valore.
 */
const formaPovera = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, "")
    .replace(/[^a-z0-9.,]+/g, "");

/** Confronta due valori presenti. Ritorna giusto-esatto, giusto-equivalente o errato. */
function confronta(percorso: string, atteso: unknown, letto: unknown): "esatto" | "equivalente" | "errato" {
  const campo = nomeCampo(percorso);

  // Il tipo lo dice l'atteso: un numero atteso si confronta come numero, anche se letto «1.220,00».
  if (typeof atteso === "number") {
    const n = num(letto);
    if (n === null) return "errato";
    if (Math.abs(n - atteso) <= 0.005) return typeof letto === "number" ? "esatto" : "equivalente";
    return "errato";
  }
  if (typeof atteso === "boolean") return letto === atteso ? "esatto" : "errato";

  const a = testo(atteso);
  const l = testo(letto);
  if (spaziPuliti(a) === spaziPuliti(l)) return "esatto";

  if (CAMPO_PIVA.test(campo)) return normalizzaPiva(a) === normalizzaPiva(l) ? "equivalente" : "errato";
  if (CAMPO_CODICE_FISCALE.test(campo)) {
    return a.replace(/\s/g, "").toUpperCase() === l.replace(/\s/g, "").toUpperCase() ? "equivalente" : "errato";
  }
  if (CAMPO_DATA.test(campo)) return normalizzaData(a) === normalizzaData(l) ? "equivalente" : "errato";

  return formaPovera(a) !== "" && formaPovera(a) === formaPovera(l) ? "equivalente" : "errato";
}

const conteggiVuoti = (): Record<EsitoCampo, number> => ({ esatto: 0, equivalente: 0, errato: 0, mancante: 0, inventato: 0 });

/**
 * Confronta ciò che l'AI ha letto con ciò che era scritto. Due JSON qualsiasi:
 * le foglie si abbinano per percorso, le liste per posizione.
 */
export function valutaLettura(atteso: unknown, letto: unknown): Valutazione {
  const fa = foglie(atteso);
  const fl = foglie(letto);
  const percorsi = [...new Set([...fa.keys(), ...fl.keys()])];
  const campi: CampoValutato[] = [];
  const conteggi = conteggiVuoti();

  for (const percorso of percorsi) {
    const a = fa.get(percorso);
    const l = fl.get(percorso);
    const aVuoto = vuoto(a);
    const lVuoto = vuoto(l);
    if (aVuoto && lVuoto) continue;
    const esito: EsitoCampo = aVuoto ? "inventato" : lVuoto ? "mancante" : confronta(percorso, a, l);
    conteggi[esito]++;
    campi.push({ percorso, atteso: a ?? null, letto: l ?? null, esito });
  }

  const attesi = conteggi.esatto + conteggi.equivalente + conteggi.errato + conteggi.mancante;
  return {
    campi,
    conteggi,
    accuratezza: attesi === 0 ? null : (conteggi.esatto + conteggi.equivalente) / attesi,
    perfetta: conteggi.errato + conteggi.mancante + conteggi.inventato === 0,
  };
}

export interface CorrezioneUtente {
  percorso: string;
  /** Ciò che aveva letto l'AI (null se non aveva letto niente). */
  letto: unknown;
  /** Ciò che l'utente ha confermato (null se l'ha tolto). */
  confermato: unknown;
}

/**
 * I campi che l'utente ha cambiato prima di confermare: il confermato fa da
 * «scritto davvero». Un valore tolto (confermato vuoto) conta come correzione.
 */
export function correzioniUtente(letto: unknown, confermato: unknown): CorrezioneUtente[] {
  return valutaLettura(confermato, letto)
    .campi.filter((c) => c.esito === "errato" || c.esito === "mancante" || c.esito === "inventato")
    .map((c) => ({ percorso: c.percorso, letto: c.letto, confermato: c.atteso }));
}

export interface RiepilogoCampo {
  /** Il campo senza posizioni: «righe[].quantita». */
  campo: string;
  attesi: number;
  giusti: number;
  errati: number;
  mancanti: number;
  inventati: number;
  /** Giusti su attesi; null se questo campo non era mai atteso (solo inventato). */
  accuratezza: number | null;
}

export interface Riepilogo {
  documenti: number;
  perfetti: number;
  /** Su tutti i campi attesi di tutti i documenti. Null se non c'era niente da leggere. */
  accuratezza: number | null;
  /** Dal campo che si sbaglia di più a quello che si sbaglia di meno. */
  perCampo: RiepilogoCampo[];
}

const senzaPosizioni = (percorso: string) => percorso.replace(/\[\d+\]/g, "[]");

/** Mette insieme più valutazioni (un tipo di documento, o un'intera serie). */
export function riepilogaSerie(valutazioni: Valutazione[]): Riepilogo {
  const perCampo = new Map<string, RiepilogoCampo>();
  let giusti = 0;
  let attesi = 0;

  for (const v of valutazioni) {
    for (const c of v.campi) {
      const chiave = senzaPosizioni(c.percorso);
      const r = perCampo.get(chiave) ?? { campo: chiave, attesi: 0, giusti: 0, errati: 0, mancanti: 0, inventati: 0, accuratezza: null };
      if (c.esito === "inventato") {
        r.inventati++;
      } else {
        r.attesi++;
        attesi++;
        if (c.esito === "esatto" || c.esito === "equivalente") {
          r.giusti++;
          giusti++;
        } else if (c.esito === "errato") r.errati++;
        else r.mancanti++;
      }
      perCampo.set(chiave, r);
    }
  }

  const righe = [...perCampo.values()].map((r) => ({ ...r, accuratezza: r.attesi === 0 ? null : r.giusti / r.attesi }));
  righe.sort((x, y) => (x.accuratezza ?? 1) - (y.accuratezza ?? 1) || y.inventati - x.inventati || x.campo.localeCompare(y.campo));
  return {
    documenti: valutazioni.length,
    perfetti: valutazioni.filter((v) => v.perfetta).length,
    accuratezza: attesi === 0 ? null : giusti / attesi,
    perCampo: righe,
  };
}
