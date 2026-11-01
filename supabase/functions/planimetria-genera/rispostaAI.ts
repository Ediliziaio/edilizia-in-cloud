// Il JSON che chiediamo al modello di visione e la sua lettura tollerante.
//
// Il modello NON scrive il modello della planimetria: descrive ciò che vede
// (contorni dei locali, aperture come segmenti, quote lette) in un sistema di
// coordinate semplice. Muri, scala e origini delle misure li ricava il codice
// (costruisci.ts): un modello di visione legge bene i numeri scritti e la forma
// delle stanze, molto meno bene spessori e allineamenti al centimetro.

import { DESTINAZIONI, type Destinazione, type TipoApertura } from "../../../shared/planimetrie/modello.ts";

export type Coppia = [number, number];

export interface LocaleAI {
  nome: string;
  destinazione: Destinazione;
  contorno: Coppia[];
  superficie_scritta_mq: number | null;
  altezza_scritta_m: number | null;
  /** Solo nel sistema «metri»: le misure di questo locale sono scritte sul foglio. */
  misure_lette: boolean;
  /** Più piani sullo stesso foglio (piano terra e sottotetto): a quale appartiene. */
  piano?: string | null;
  /** Più appartamenti sullo stesso foglio (condominio, bifamiliare): «A», «B»… */
  unita?: string | null;
}

/** Arredi, sanitari e pilastri disegnati: un riquadro e il lato appoggiato al muro. */
export interface ElementoAI {
  tipo: string;
  /** [x0, y0, x1, y1] nello stesso sistema delle altre coordinate. */
  riquadro: [number, number, number, number];
  /** Da che parte sta lo schienale o l'attacco (sull'immagine). */
  lato_muro: "alto" | "basso" | "sinistra" | "destra" | null;
  piano?: string | null;
}

export interface AperturaAI {
  tipo: TipoApertura;
  da: Coppia;
  a: Coppia;
  piano?: string | null;
}

export interface QuotaAI {
  valore_m: number;
  da: Coppia;
  a: Coppia;
}

export interface RispostaAI {
  /** immagine: coordinate 0–1000 sulla larghezza e sull'altezza dell'immagine.
   *  metri: coordinate già in metri (schizzo non in scala, descrizione). */
  sistema: "immagine" | "metri";
  leggibile: boolean;
  motivo_non_leggibile: string | null;
  altezza_m: number | null;
  locali: LocaleAI[];
  aperture: AperturaAI[];
  quote: QuotaAI[];
  /** Assente nelle risposte del prompt «p1». */
  elementi?: ElementoAI[];
}

/** Tipi di elemento che l'editor e le esportazioni sanno disegnare, più i pilastri. */
export const TIPI_ELEMENTO_AI = [
  "pilastro", "wc", "bidet", "lavabo", "doccia", "vasca", "lavatrice", "cucina", "frigorifero", "tavolo", "sedia",
  "letto_matrimoniale", "letto_singolo", "comodino", "armadio", "scrivania", "divano", "caldaia",
  "divano_angolare", "poltrona", "mobile_tv", "libreria", "tavolo_rotondo", "cucina_angolare", "isola_cucina", "auto", "scala",
] as const;

const SINONIMI_ELEMENTO: Array<[RegExp, string]> = [
  [/pilastr|colonn/i, "pilastro"],
  [/auto|macchina|vettura/i, "auto"],
  [/scal[ae]\b|rampa/i, "scala"],
  [/divano.*(angol|penisola|chaise)|angolare/i, "divano_angolare"],
  [/poltron/i, "poltrona"],
  [/mobile.*tv|porta.?tv|tv/i, "mobile_tv"],
  [/librer/i, "libreria"],
  [/tavol.*(tond|rotond)/i, "tavolo_rotondo"],
  [/cucina.*(angol|a l\b)/i, "cucina_angolare"],
  [/isola/i, "isola_cucina"],
  [/^w\.?c|water|vaso/i, "wc"],
  [/bidet/i, "bidet"],
  [/lavab|lavandin/i, "lavabo"],
  [/docc/i, "doccia"],
  [/vasca/i, "vasca"],
  [/lavatric/i, "lavatrice"],
  [/frigo/i, "frigorifero"],
  [/cucin|piano.?cottura|fornell/i, "cucina"],
  [/tavol/i, "tavolo"],
  [/sedi/i, "sedia"],
  [/letto.*(singol|una piazza)|singol/i, "letto_singolo"],
  [/letto|matrimonial/i, "letto_matrimoniale"],
  [/comodin/i, "comodino"],
  [/armad|guardarob/i, "armadio"],
  [/scrivan/i, "scrivania"],
  [/divan|sofa/i, "divano"],
  [/caldaia/i, "caldaia"],
];

export function tipoElementoDa(v: unknown): string | null {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  if ((TIPI_ELEMENTO_AI as readonly string[]).includes(t)) return t;
  return SINONIMI_ELEMENTO.find(([re]) => re.test(t))?.[1] ?? null;
}

const testoOpzionale = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : null);

/** Numero da un valore del modello: accetta "4,20", "4.20 m", 4.2. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function coppia(v: unknown): Coppia | null {
  if (Array.isArray(v) && v.length >= 2) {
    const x = numero(v[0]);
    const y = numero(v[1]);
    return x === null || y === null ? null : [x, y];
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const x = numero(o.x);
    const y = numero(o.y);
    return x === null || y === null ? null : [x, y];
  }
  return null;
}

const SINONIMI: Array<[RegExp, Destinazione]> = [
  [/soggiorno|salotto|living|sala|pranzo/, "soggiorno"],
  [/cucin|cottura|kitchen/, "cucina"],
  [/camer|letto|bedroom|matrimonial|cameretta/, "camera"],
  [/bagn|wc|w\.c|servizi|doccia|toilet/, "bagno"],
  [/corridoio/, "corridoio"],
  [/disimp|passaggio|dis\b|hall/, "disimpegno"],
  [/ingress|entrata/, "ingresso"],
  [/ripost|riposti|rip\b|sgabuzz|armadi|guardaroba|dispensa/, "ripostiglio"],
  [/studio|ufficio/, "studio"],
  [/lavander/, "lavanderia"],
  [/balcon|loggia/, "balcone"],
  [/terrazz|lastrico/, "terrazzo"],
  [/garage|box|autorimessa/, "garage"],
  [/cantin|deposito|magazzino/, "cantina"],
];

export function destinazioneDa(testo: unknown, nome: string): Destinazione {
  const t = String(testo ?? "").toLowerCase().trim();
  if ((DESTINAZIONI as readonly string[]).includes(t)) return t as Destinazione;
  const fonte = `${t} ${nome.toLowerCase()}`;
  for (const [re, d] of SINONIMI) if (re.test(fonte)) return d;
  return "altro";
}

function tipoApertura(v: unknown): TipoApertura | null {
  const t = String(v ?? "").toLowerCase();
  if (/porta.?finestra|portafinestra|french/.test(t)) return "portafinestra";
  if (/finestr|window|lucernari/.test(t)) return "finestra";
  if (/varco|passaggio|apertura senza/.test(t)) return "varco";
  if (/porta|door/.test(t)) return "porta";
  return null;
}

/** Toglie i ``` e prende il primo oggetto JSON della risposta. */
export function estraiJson(testo: string): unknown {
  const pulito = testo.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(pulito);
  } catch {
    const inizio = pulito.indexOf("{");
    const fine = pulito.lastIndexOf("}");
    if (inizio >= 0 && fine > inizio) return JSON.parse(pulito.slice(inizio, fine + 1));
    throw new Error("La risposta non contiene un oggetto JSON.");
  }
}

/** Legge la risposta del modello. Scarta in silenzio gli elementi malformati. */
export function leggiRispostaAI(grezza: unknown, sistemaAtteso: "immagine" | "metri"): RispostaAI {
  const o = (grezza && typeof grezza === "object" ? grezza : {}) as Record<string, unknown>;
  const sistema = o.sistema === "metri" || o.sistema === "immagine" ? o.sistema : sistemaAtteso;
  const locali: LocaleAI[] = [];
  for (const raw of Array.isArray(o.locali) ? o.locali : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const nome = String(r.nome ?? "").trim() || "Locale";
    const contorno = (Array.isArray(r.contorno) ? r.contorno : []).map(coppia).filter((c): c is Coppia => c !== null);
    // Un rettangolo descritto da due angoli.
    if (contorno.length === 2) {
      const [[x1, y1], [x2, y2]] = contorno;
      contorno.splice(0, 2, [x1, y1], [x2, y1], [x2, y2], [x1, y2]);
    }
    if (contorno.length > 3) {
      const [fx, fy] = contorno[0];
      const [lx, ly] = contorno[contorno.length - 1];
      if (fx === lx && fy === ly) contorno.pop();
    }
    locali.push({
      nome,
      destinazione: destinazioneDa(r.destinazione, nome),
      contorno,
      superficie_scritta_mq: numero(r.superficie_scritta_mq),
      altezza_scritta_m: numero(r.altezza_scritta_m),
      misure_lette: r.misure_lette === true,
      piano: testoOpzionale(r.piano),
      unita: testoOpzionale(r.unita),
    });
  }
  const aperture: AperturaAI[] = [];
  for (const raw of Array.isArray(o.aperture) ? o.aperture : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const tipo = tipoApertura(r.tipo);
    const da = coppia(r.da);
    const a = coppia(r.a);
    if (tipo && da && a) aperture.push({ tipo, da, a, piano: testoOpzionale(r.piano) });
  }
  const quote: QuotaAI[] = [];
  for (const raw of Array.isArray(o.quote) ? o.quote : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const valore = numero(r.valore_m);
    const da = coppia(r.da);
    const a = coppia(r.a);
    if (valore && valore > 0 && da && a) quote.push({ valore_m: valore, da, a });
  }
  const elementi: ElementoAI[] = [];
  for (const raw of Array.isArray(o.elementi) ? o.elementi : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const tipo = tipoElementoDa(r.tipo);
    const q = Array.isArray(r.riquadro) ? r.riquadro.map(numero) : [];
    if (!tipo || q.length < 4 || q.some((v) => v === null)) continue;
    const [x0, y0, x1, y1] = q as number[];
    if (Math.abs(x1 - x0) <= 0 || Math.abs(y1 - y0) <= 0) continue;
    const lato = r.lato_muro === "alto" || r.lato_muro === "basso" || r.lato_muro === "sinistra" || r.lato_muro === "destra" ? r.lato_muro : null;
    elementi.push({ tipo, riquadro: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)], lato_muro: lato, piano: testoOpzionale(r.piano) });
  }
  return {
    sistema,
    leggibile: o.leggibile !== false,
    motivo_non_leggibile: typeof o.motivo_non_leggibile === "string" ? o.motivo_non_leggibile : null,
    altezza_m: numero(o.altezza_m),
    locali,
    aperture,
    quote,
    elementi,
  };
}
