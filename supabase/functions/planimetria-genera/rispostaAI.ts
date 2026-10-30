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
}

export interface AperturaAI {
  tipo: TipoApertura;
  da: Coppia;
  a: Coppia;
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
}

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
    });
  }
  const aperture: AperturaAI[] = [];
  for (const raw of Array.isArray(o.aperture) ? o.aperture : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const tipo = tipoApertura(r.tipo);
    const da = coppia(r.da);
    const a = coppia(r.a);
    if (tipo && da && a) aperture.push({ tipo, da, a });
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
  return {
    sistema,
    leggibile: o.leggibile !== false,
    motivo_non_leggibile: typeof o.motivo_non_leggibile === "string" ? o.motivo_non_leggibile : null,
    altezza_m: numero(o.altezza_m),
    locali,
    aperture,
    quote,
  };
}
