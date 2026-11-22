/**
 * Adattatore tra l'editor e il modello della pianta (fase 1, `shared/planimetrie/`).
 *
 * L'editor lavora su una sua «pianta di lavoro» (`Pianta`), comoda per disegnare:
 * coordinate dello schermo (y verso il basso), stanze sull'asse dei muri (così
 * spostando una parete gli angoli delle stanze la seguono), porte col centro, e un
 * solo elenco con lo stato di ogni oggetto (esistente / da demolire / nuovo).
 *
 * Il documento vero è la `Planimetria` della fase 1: y verso l'alto, locali al filo
 * interno, aperture con `offset`, stato di fatto e proposte separati. Tutto il
 * passaggio fra i due sta qui sotto (`daPlanimetria`, `aPlanimetria`), insieme alle
 * quantità (`calcolaQuantita`) e al controllo (`controllaPlanimetria`) della fase 1.
 *
 * Unità: centimetri.
 */
import {
  eAmbienteInterno,
  nuovaPlanimetria,
  origineMisura,
  originePeggiore,
  statoVuoto,
  type AlzataCad,
  type Apertura as AperturaModello,
  type AreaEsterna as AreaModello,
  type Destinazione,
  type TipoArea,
  type Elemento as ElementoModello,
  type Finiture,
  type Livello,
  type Locale as LocaleModello,
  type Manovra,
  type SistemaApertura,
  type TipoCassonetto,
  type TipoOscurante,
  type TipoZanzariera,
  type Muro as MuroModello,
  type Origine,
  type Planimetria,
  type PrezzoVocePlanimetria,
  type Proposta,
  type Quota as QuotaModello,
  type Ricalco,
  type Tetto,
  type StatoLavori,
  type Testo as TestoModello,
  type StatoPianta,
  type TipoMuro,
  type TracciatoImpianto,
} from "../../../../shared/planimetrie/modello.ts";
import { areaPoligono, contornoIncrociato, distanzaDalContorno, interniSovrapposti, puntoInterno, puntoNelPoligono, ricostruisciLocali } from "../../../../shared/planimetrie/geometria.ts";
import { calcolaQuantita, type MappaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import { controllaPlanimetria, type Problema } from "../../../../shared/planimetrie/controllo.ts";
import { unisciLocaliDopoDemolizione } from "../../../../shared/planimetrie/demolizioni.ts";
import { rinominaRiferimentiQuota, seguiQuota } from "../../../../shared/planimetrie/quote.ts";
import { dividiContornoSulTramezzo } from "@/lib/planimetrie/frazionamento";

export type { Destinazione, Origine, Planimetria, Problema };

/** Stato rispetto al progetto: convenzione italiana giallo = demolire, rosso = nuovo. */
export type StatoElemento = StatoLavori;

export interface Punto {
  x: number;
  y: number;
}

export interface Muro {
  id: string;
  p1: Punto;
  p2: Punto;
  spessore: number;
  altezza: number;
  tipo: TipoMuro;
  stato: StatoElemento;
  origine: Origine;
  origineAltezza?: Origine;
  funzioneDaVerificare?: boolean;
}

export type TipoApertura = "porta" | "finestra" | "portafinestra" | "varco";

export interface Apertura {
  id: string;
  muroId: string;
  tipo: TipoApertura;
  /** Distanza del centro dell'apertura da `muro.p1`, lungo l'asse del muro. */
  posizione: number;
  larghezza: number;
  altezza: number;
  davanzale: number;
  manovra: Manovra;
  /** Ante (1-6) e sistema del serramento (vedi shared/planimetrie/serramenti.ts); assenti = quelli di default. */
  ante?: number;
  sistema?: SistemaApertura;
  /** Oscurante, cassonetto e motore (vedi shared/planimetrie/serramenti.ts). */
  oscurante?: TipoOscurante;
  cassonetto?: TipoCassonetto;
  altezzaCassonetto?: number;
  motore?: boolean;
  zanzariera?: TipoZanzariera;
  /** Da che parte sta la cerniera e verso quale lato (sullo schermo) si apre. */
  verso: { cerniera: "inizio" | "fine"; lato: "sinistra" | "destra" };
  /** Il documento lascia il verso nullo: il segno convenzionale non va mostrato come letto. */
  versoDaVerificare?: boolean;
  stato: StatoElemento;
  origine: Origine;
}

export interface Locale {
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Contorno sull'asse dei muri oppure al filo interno per le zone aperte o senza un aggancio valido. */
  contorno: Punto[];
  altezza: number;
  aperto?: boolean;
  alFiloInterno?: boolean;
  finiture?: Finiture;
  /** Appartamento (condominio, bifamiliare). */
  unita?: string;
  /** «nuovo» se la stanza nasce disegnata nel progetto. */
  stato: StatoElemento;
  origine: Origine;
}

/** Arredo o sanitario (fase 3 del piano di completamento): centro e rotazione oraria sullo schermo. */
/** Lotto o area esterna nella pianta di lavoro (y verso il basso). */
export interface AreaLavoro {
  id: string;
  tipo: TipoArea;
  nome?: string;
  contorno: Punto[];
  recinzione?: boolean;
  quota?: number;
  stato: StatoElemento;
}

export interface ElementoLavoro {
  id: string;
  tipo: string;
  etichetta?: string;
  centro: Punto;
  /** Gradi, in senso orario sullo schermo. */
  rotazione: number;
  larghezza: number;
  profondita: number;
  altezza?: number;
  alzateCad?: AlzataCad[];
  stato: StatoElemento;
  origine: Origine;
}

export interface QuotaLavoro extends QuotaModello {
  /** Presente soltanto fra le quote della proposta attiva. */
  soloProgetto?: boolean;
}

/** Testo libero sulla pianta. Uguale in «oggi» e nel progetto. */
export interface TestoLavoro {
  id: string;
  posizione: Punto;
  testo: string;
  /** Gradi, in senso orario sullo schermo. */
  rotazione: number;
}

export interface Pianta {
  ambitoDocumento?: Planimetria["ambitoDocumento"];
  letturaDocumento?: Planimetria["letturaDocumento"];
  versione: 1;
  unita: "cm";
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
  /** Arredi, quote e testi: assenti nelle piante di lavoro vecchie (allora restano quelli del documento). */
  elementi?: ElementoLavoro[];
  quote?: QuotaLavoro[];
  testi?: TestoLavoro[];
  /** Lotto e aree esterne. */
  aree?: AreaLavoro[];
  /** Tratti disegnati nella variante attiva, in coordinate dell’editor. */
  tracciatiImpianti?: TracciatoImpianto[];
  /** Nome e destinazione dei locali del progetto, quando sono diversi da quelli di oggi. */
  nomiProgetto?: Record<string, { nome: string; destinazione: Destinazione; finiture?: Finiture; unita?: string | null }>;
  /** Accessorio della proposta su un serramento che rimane in opera. */
  zanzariereProgetto?: Record<string, TipoZanzariera | null>;
  prezziProgetto?: Record<string, PrezzoVocePlanimetria>;
}

export function aperturaNellaVista(pianta: Pianta, apertura: Apertura, vista: "fatto" | "progetto"): Apertura {
  const zanzariera = vista === "progetto" ? pianta.zanzariereProgetto?.[apertura.id] : undefined;
  return zanzariera === undefined ? apertura : { ...apertura, zanzariera: zanzariera ?? undefined };
}

export const DESTINAZIONI: ReadonlyArray<{ valore: Destinazione; etichetta: string }> = [
  { valore: "soggiorno", etichetta: "Soggiorno" },
  { valore: "cucina", etichetta: "Cucina" },
  { valore: "camera", etichetta: "Camera" },
  { valore: "bagno", etichetta: "Bagno" },
  { valore: "ingresso", etichetta: "Ingresso" },
  { valore: "disimpegno", etichetta: "Disimpegno" },
  { valore: "corridoio", etichetta: "Corridoio" },
  { valore: "ripostiglio", etichetta: "Ripostiglio" },
  { valore: "studio", etichetta: "Studio" },
  { valore: "lavanderia", etichetta: "Lavanderia" },
  { valore: "balcone", etichetta: "Balcone" },
  { valore: "terrazzo", etichetta: "Terrazzo" },
  { valore: "garage", etichetta: "Garage" },
  { valore: "cantina", etichetta: "Cantina" },
  { valore: "giardino", etichetta: "Giardino / cortile" },
  { valore: "altro", etichetta: "Altro" },
];

export const SPESSORE_TRAMEZZO = 10;
export const SPESSORE_PORTANTE = 30;
export const ALTEZZA_PIANO = 270;

export function piantaVuota(): Pianta {
  // Le liste vuote appartengono al disegno: durante Annulla sostituiscono quelle del documento corrente.
  return {
    versione: 1, unita: "cm", muri: [], aperture: [], locali: [], elementi: [], quote: [], testi: [], aree: [],
    tracciatiImpianti: [], letturaDocumento: undefined,
  };
}

// ─── Geometria di lavoro ──────────────────────────────────────────────────────
// Le misure interne delle stanze della pianta di lavoro: servono ai comandi (allungare
// un lato «da muro a muro»). Le quantità mostrate all'utente vengono invece dal modello
// (`datiVista`, più sotto), così editor e computo dicono lo stesso numero.

function areaConSegno(punti: Punto[]): number {
  let s = 0;
  for (let i = 0; i < punti.length; i++) {
    const a = punti[i];
    const b = punti[(i + 1) % punti.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Muro che giace sul lato a→b (stesso allineamento, lo copre almeno in parte). */
function muroSulLato(pianta: Pick<Pianta, "muri">, a: Punto, b: Punto): Muro | undefined {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return undefined;
  const ux = dx / len;
  const uy = dy / len;
  let migliore: Muro | undefined;
  let sovrapposizioneMax = 0;
  for (const m of pianta.muri) {
    const d1 = Math.abs((m.p1.x - a.x) * uy - (m.p1.y - a.y) * ux);
    const d2 = Math.abs((m.p2.x - a.x) * uy - (m.p2.y - a.y) * ux);
    if (d1 > 0.5 || d2 > 0.5) continue;
    const t1 = (m.p1.x - a.x) * ux + (m.p1.y - a.y) * uy;
    const t2 = (m.p2.x - a.x) * ux + (m.p2.y - a.y) * uy;
    const sovrapposizione = Math.min(len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
    if (sovrapposizione > sovrapposizioneMax) {
      sovrapposizioneMax = sovrapposizione;
      migliore = m;
    }
  }
  return migliore;
}

/**
 * Contorno interno (il pavimento calpestabile): il contorno sull'asse spostato verso
 * l'interno di mezzo spessore del muro che sta su ciascun lato.
 */
export function contornoInterno(pianta: Pick<Pianta, "muri">, locale: Pick<Locale, "contorno" | "aperto" | "alFiloInterno">): Punto[] {
  const p = locale.contorno;
  const n = p.length;
  if (n < 3 || locale.aperto || locale.alFiloInterno) return p;
  const orario = areaConSegno(p) > 0; // y verso il basso: area positiva = senso orario a schermo
  // Retta di ogni lato spostata verso l'interno.
  const rette = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    // normale interna
    const nx = orario ? -uy : uy;
    const ny = orario ? ux : -ux;
    const muro = muroSulLato(pianta, a, b);
    const off = muro ? muro.spessore / 2 : 0;
    return { a: { x: a.x + nx * off, y: a.y + ny * off }, u: { x: ux, y: uy } };
  });
  return rette.map((r, i) => {
    const prec = rette[(i - 1 + n) % n];
    return intersezioneRette(prec.a, prec.u, r.a, r.u) ?? r.a;
  });
}

function intersezioneRette(p: Punto, u: Punto, q: Punto, v: Punto): Punto | null {
  const den = u.x * v.y - u.y * v.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / den;
  return { x: p.x + u.x * t, y: p.y + u.y * t };
}

export interface QuantitaLocale {
  /** Superficie del pavimento, in mq. */
  mq: number;
  /** Perimetro interno, in metri. */
  perimetro: number;
  /** Lunghezza interna di ciascun lato, in cm (lato i = contorno[i] → contorno[i+1]). */
  lati: number[];
  stimata: boolean;
}

export function quantitaLocale(pianta: Pianta, locale: Locale): QuantitaLocale {
  const interno = contornoInterno(pianta, locale);
  const lati = interno.map((a, i) => {
    const b = interno[(i + 1) % interno.length];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  const stimata =
    locale.origine === "stimata" ||
    locale.contorno.some((a, i) => {
      const m = muroSulLato(pianta, a, locale.contorno[(i + 1) % locale.contorno.length]);
      return m?.origine === "stimata";
    });
  return {
    mq: Math.abs(areaConSegno(interno)) / 10_000,
    perimetro: lati.reduce((s, l) => s + l, 0) / 100,
    lati,
    stimata,
  };
}

/** Il muro su cui giace il lato i del locale, se c'è (serve per correggerne la misura). */
export function muroDelLato(pianta: Pianta, locale: Locale, lato: number): Muro | undefined {
  const c = locale.contorno;
  return muroSulLato(pianta, c[lato], c[(lato + 1) % c.length]);
}

// ─── Ponte verso il documento della fase 1 ────────────────────────────────────

/** In v1 l'editor mostra una sola proposta: questa. */
export const ID_PROPOSTA = "A";
const NOME_PROPOSTA = "Progetto";

const arrotonda2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** Schermo (y in giù) ⇄ documento (y in su): la stessa operazione nei due versi. */
export const capovolgi = (p: Punto): Punto => ({ x: arrotonda2(p.x), y: arrotonda2(0 - p.y) });
const capovolgiAlzata = ([a, b]: AlzataCad): AlzataCad => [{ x: a.x, y: -a.y }, { x: b.x, y: -b.y }];

const lunghezza = (a: Punto, b: Punto) => Math.hypot(b.x - a.x, b.y - a.y);

/** L'origine che l'editor mostra: la peggiore fra quella dell'oggetto e quelle delle sue misure. */
function origineDi(o: { origine: Origine; origineMisure?: Partial<Record<string, Origine>> }): Origine {
  return originePeggiore(o.origine, ...Object.values(o.origineMisure ?? {}).filter((x): x is Origine => !!x));
}

/** Se l'editor non ha cambiato l'origine, si tengono quelle del documento campo per campo. */
function origineVerso<T extends { origine: Origine; origineMisure?: Partial<Record<string, Origine>> }>(origine: Origine, prima?: T) {
  if (prima && origineDi(prima) === origine) {
    return prima.origineMisure ? { origine: prima.origine, origineMisure: prima.origineMisure } : { origine: prima.origine };
  }
  return { origine };
}

function muroDaModello(m: MuroModello): Muro {
  const origine = origineDi(m);
  const origineAltezza = origineMisura(m, "altezza");
  return { id: m.id, p1: capovolgi(m.p1), p2: capovolgi(m.p2), spessore: m.spessore, altezza: m.altezza, tipo: m.tipo, stato: m.stato, origine,
    funzioneDaVerificare: m.funzioneDaVerificare,
    ...(origineAltezza !== origine || m.origineMisure?.altezza ? { origineAltezza } : {}) };
}

function aperturaDaModello(a: AperturaModello): Apertura {
  return {
    id: a.id,
    muroId: a.muroId,
    tipo: a.tipo,
    posizione: a.offset + a.larghezza / 2,
    larghezza: a.larghezza,
    altezza: a.altezza,
    davanzale: a.davanzale,
    manovra: a.manovra,
    ...(a.ante ? { ante: a.ante } : {}),
    ...(a.sistema ? { sistema: a.sistema } : {}),
    ...(a.oscurante ? { oscurante: a.oscurante } : {}),
    ...(a.cassonetto ? { cassonetto: a.cassonetto } : {}),
    ...(a.altezzaCassonetto ? { altezzaCassonetto: a.altezzaCassonetto } : {}),
    ...(a.motore ? { motore: true } : {}),
    ...(a.zanzariera ? { zanzariera: a.zanzariera } : {}),
    // capovolgendo y la sinistra del documento diventa la destra dello schermo
    verso: a.verso
      ? { cerniera: a.verso.cardine === "p1" ? "inizio" : "fine", lato: a.verso.lato === "sinistra" ? "destra" : "sinistra" }
      : { cerniera: "inizio", lato: "destra" },
    ...(a.manovra === "battente" && a.verso === null ? { versoDaVerificare: true } : {}),
    stato: a.stato,
    origine: origineDi(a),
  };
}

function intersezione(p: Punto, u: Punto, q: Punto, v: Punto): Punto | null {
  return intersezioneRette(p, u, q, v);
}

/**
 * Dal filo interno all'asse: ogni lato del locale si sposta verso la parete che ci
 * corre accanto (a mezzo spessore), poi i lati spostati si intersecano.
 */
export function contornoSullAsse(contorno: Punto[], muri: MuroModello[]): Punto[] {
  const n = contorno.length;
  const rette = contorno.map((a, i) => {
    const b = contorno[(i + 1) % n];
    const len = lunghezza(a, b) || 1;
    const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const normale = { x: -u.y, y: u.x };
    let spostamento = 0;
    for (const m of muri) {
      const lm = lunghezza(m.p1, m.p2);
      if (lm < 1 || m.stato === "da_demolire") continue;
      const v = { x: (m.p2.x - m.p1.x) / lm, y: (m.p2.y - m.p1.y) / lm };
      if (Math.abs(u.x * v.y - u.y * v.x) > 0.01) continue; // non parallela
      const d = (m.p1.x - a.x) * normale.x + (m.p1.y - a.y) * normale.y;
      if (Math.abs(Math.abs(d) - m.spessore / 2) > 1.5) continue;
      const t1 = (m.p1.x - a.x) * u.x + (m.p1.y - a.y) * u.y;
      const t2 = (m.p2.x - a.x) * u.x + (m.p2.y - a.y) * u.y;
      if (Math.min(len, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) < 1) continue;
      spostamento = d;
      break;
    }
    return { a: { x: a.x + normale.x * spostamento, y: a.y + normale.y * spostamento }, u };
  });
  return rette.map((r, i) => {
    const prec = rette[(i - 1 + n) % n];
    const p = intersezione(prec.a, prec.u, r.a, r.u) ?? r.a;
    return { x: arrotonda2(p.x), y: arrotonda2(p.y) };
  });
}

function contornoDiLavoro(locale: LocaleModello, muriModello: MuroModello[], muri: Muro[]): Pick<Locale, "contorno" | "aperto" | "alFiloInterno"> {
  if (locale.aperto) return { contorno: locale.contorno.map(capovolgi), aperto: true };
  const contorno = contornoSullAsse(locale.contorno, muriModello).map(capovolgi);
  if (contornoIncrociato(contorno) || contornoIncrociato(contornoInterno({ muri }, { contorno }).map(capovolgi))) {
    return { contorno: locale.contorno.map(capovolgi), alFiloInterno: true };
  }
  return { contorno };
}

/**
 * Dal documento alla pianta di lavoro (un livello: il primo, o quello indicato).
 * Le pareti della proposta che non ci sono oggi entrano come «nuove»; quelle che la
 * proposta demolisce sono segnate «da demolire».
 */
export function daPlanimetria(doc: Planimetria, livelloId?: string, propostaId: string = ID_PROPOSTA): Pianta {
  const livello = doc.livelli.find((l) => l.id === livelloId) ?? doc.livelli[0];
  if (!livello) return piantaVuota();
  const { fatto } = livello;
  const proposta = livello.proposte.find((p) => p.id === propostaId) ?? livello.proposte[0];
  const muriDiFatto = fatto.muri.map(muroDaModello);
  const muri = [...muriDiFatto];
  const aperture = fatto.aperture.map(aperturaDaModello);
  const nomiProgetto: NonNullable<Pianta["nomiProgetto"]> = {};
  const zanzariereProgetto: NonNullable<Pianta["zanzariereProgetto"]> = {};
  if (proposta) {
    for (const m of proposta.muri) {
      const i = muri.findIndex((x) => x.id === m.id);
      if (i < 0) muri.push(muroDaModello(m));
      else if (m.stato === "da_demolire") muri[i] = { ...muri[i], stato: "da_demolire" };
    }
    for (const a of proposta.aperture) {
      const i = aperture.findIndex((x) => x.id === a.id);
      if (i < 0) aperture.push(aperturaDaModello(a));
      else if (a.stato === "da_demolire") aperture[i] = { ...aperture[i], stato: "da_demolire" };
      else if (a.zanzariera !== aperture[i].zanzariera) zanzariereProgetto[a.id] = a.zanzariera ?? null;
    }
    for (const l of proposta.locali) {
      const oggi = fatto.locali.find((x) => x.id === l.id);
      if (!oggi || oggi.nome !== l.nome || oggi.destinazione !== l.destinazione || oggi.unita !== l.unita || JSON.stringify(oggi.finiture) !== JSON.stringify(l.finiture)) {
        nomiProgetto[l.id] = { nome: l.nome, destinazione: l.destinazione, finiture: l.finiture ?? {}, unita: l.unita ?? null };
      }
    }
  }
  const daCad = !!livello.tavolaDwg || livello.ricalco?.bloccata !== undefined || /^cad-\d+$/.test(livello.id);
  const muriPerContorni = daCad ? muriDiFatto : muri;
  const locali: Locale[] = fatto.locali.map(l => ({
    id: l.id, nome: l.nome, destinazione: l.destinazione, altezza: l.altezza, stato: "esistente", origine: origineDi(l),
    ...contornoDiLavoro(l, fatto.muri, muriPerContorni),
    ...(l.finiture ? { finiture: l.finiture } : {}),
    ...(l.unita ? { unita: l.unita } : {}),
  }));
  const parti = new Set(proposta?.frazionamenti?.flatMap(f => f.parti));
  for (const l of proposta?.locali ?? []) {
    if ((!parti.has(l.id) && !proposta?.distribuzioneBilocali) || locali.some(x => x.id === l.id)) continue;
    const contorno = proposta?.distribuzioneBilocali && !l.aperto
      ? contornoSullAsse(l.contorno, proposta.muri.filter(m => m.stato !== "da_demolire")) : l.contorno;
    locali.push({
      id: l.id, nome: l.nome, destinazione: l.destinazione, contorno: contorno.map(capovolgi),
      altezza: l.altezza, finiture: l.finiture, unita: l.unita, stato: "nuovo", origine: l.origine,
      ...(l.aperto ? { aperto: true } : {}),
      ...(contorno === l.contorno ? { alFiloInterno: true } : {}),
    });
  }
  // Arredi: quelli di oggi; nel progetto quelli che mancano sono da togliere, quelli in più sono nuovi.
  const elementi: ElementoLavoro[] = fatto.elementi.map((e) => {
    const tolto = !!proposta && !proposta.elementi.some((x) => x.id === e.id);
    return elementoDaModello(e, tolto ? "da_demolire" : "esistente");
  });
  for (const e of proposta?.elementi ?? []) if (!elementi.some((x) => x.id === e.id)) elementi.push(elementoDaModello(e, "nuovo"));
  const idQuoteOggi = new Set(fatto.quote.map(q => q.id));
  const quote = unisciPerId(fatto.quote, proposta?.quote).map(q => ({
    ...quotaDaModello(q), ...(!idQuoteOggi.has(q.id) && { soloProgetto: true }),
  }));
  const testi = unisciPerId(fatto.testi, proposta?.testi).map(testoDaModello);
  // Aree esterne: come gli arredi (tolte nel progetto = da demolire, in più = nuove).
  // una proposta fatta prima delle aree non ha il campo: allora le aree sono quelle di oggi
  const areeProposta = proposta?.aree;
  const aree: AreaLavoro[] = (fatto.aree ?? []).map((a) => areaDaModello(a, areeProposta && !areeProposta.some((x) => x.id === a.id) ? "da_demolire" : "esistente"));
  for (const a of proposta?.aree ?? []) if (!aree.some((x) => x.id === a.id)) aree.push(areaDaModello(a, "nuovo"));
  return { ...piantaVuota(), ambitoDocumento: doc.ambitoDocumento, ...(doc.letturaDocumento ? { letturaDocumento: { ...doc.letturaDocumento, protocolloVerifica: 1 as const } } : {}), muri, aperture, locali, elementi, quote, testi,
    ...(aree.length ? { aree } : {}), ...(Object.keys(nomiProgetto).length ? { nomiProgetto } : {}),
    ...(proposta?.prezziLavorazioni ? { prezziProgetto: proposta.prezziLavorazioni } : {}),
    ...(proposta?.tracciatiImpianti ? { tracciatiImpianti: proposta.tracciatiImpianti.map(t => ({ ...t, vertici: t.vertici.map(capovolgi) })) } : {}),
    ...(Object.keys(zanzariereProgetto).length ? { zanzariereProgetto } : {}) };
}

function unisciPerId<T extends { id: string }>(a: T[], b?: T[]): T[] {
  const out = [...a];
  for (const x of b ?? []) if (!out.some((y) => y.id === x.id)) out.push(x);
  return out;
}

function areaDaModello(a: AreaModello, stato: StatoLavori): AreaLavoro {
  return {
    id: a.id,
    tipo: a.tipo,
    ...(a.nome ? { nome: a.nome } : {}),
    contorno: a.contorno.map(capovolgi),
    ...(a.recinzione !== undefined ? { recinzione: a.recinzione } : {}),
    ...(a.quota ? { quota: a.quota } : {}),
    stato,
  };
}

function areaAModello(a: AreaLavoro, stato: StatoLavori): AreaModello {
  return {
    id: a.id,
    tipo: a.tipo,
    ...(a.nome ? { nome: a.nome } : {}),
    contorno: a.contorno.map(capovolgi),
    ...(a.recinzione !== undefined ? { recinzione: a.recinzione } : {}),
    ...(a.quota ? { quota: a.quota } : {}),
    ...(stato !== "esistente" ? { stato } : {}),
  };
}

function elementoDaModello(e: ElementoModello, stato: StatoLavori): ElementoLavoro {
  return {
    id: e.id,
    tipo: e.tipo,
    ...(e.etichetta ? { etichetta: e.etichetta } : {}),
    centro: capovolgi(e.posizione),
    rotazione: arrotonda2(0 - (e.rotazione ?? 0)),
    larghezza: e.larghezza,
    profondita: e.profondita,
    ...(e.altezza != null ? { altezza: e.altezza } : {}),
    ...(e.alzateCad ? { alzateCad: e.alzateCad.map(capovolgiAlzata) } : {}),
    stato,
    origine: origineDi(e),
  };
}

export function elementoAModello(e: ElementoLavoro, stato: StatoLavori, prima?: ElementoModello): ElementoModello {
  return {
    ...(prima?.localeId !== undefined ? { localeId: prima.localeId } : {}),
    ...(prima?.colore ? { colore: prima.colore } : {}),
    ...(prima?.modello && prima.tipo === e.tipo ? { modello: prima.modello } : {}),
    id: e.id,
    tipo: e.tipo,
    ...(e.etichetta ? { etichetta: e.etichetta } : {}),
    posizione: capovolgi(e.centro),
    rotazione: arrotonda2(0 - e.rotazione),
    larghezza: e.larghezza,
    profondita: e.profondita,
    ...(e.altezza != null ? { altezza: e.altezza } : {}),
    ...(e.alzateCad ? { alzateCad: e.alzateCad.map(capovolgiAlzata) } : {}),
    ...(stato !== "esistente" || prima?.stato ? { stato } : {}),
    ...origineVerso(e.origine, prima),
  };
}

const quotaDaModello = (q: QuotaModello): QuotaLavoro => ({ ...q, p1: capovolgi(q.p1), p2: capovolgi(q.p2), scostamento: arrotonda2(0 - q.scostamento) });
const quotaAModello = ({ soloProgetto: _soloProgetto, ...q }: QuotaLavoro): QuotaModello => ({
  ...q, p1: capovolgi(q.p1), p2: capovolgi(q.p2), scostamento: arrotonda2(0 - q.scostamento),
});

export function quoteNellaVista(pianta: Pianta, vista: "fatto" | "progetto") {
  const quote = (pianta.quote ?? []).filter(q => vista === "progetto" || !q.soloProgetto);
  const muri = new Map(pianta.muri.filter(m => vista === "fatto" ? m.stato !== "nuovo" : m.stato !== "da_demolire").map(m => [m.id, m]));
  return quote.map(q => seguiQuota(q, muri));
}

/** Memorizza i capi validi per conservarli anche dopo un'eliminazione o un taglio. */
export function aggiornaQuote(pianta: Pianta): Pianta {
  if (!pianta.quote?.some(q => q.riferimenti)) return pianta;
  const muri = new Map(pianta.muri.map(m => [m.id, m]));
  const quote = pianta.quote.map(q => seguiQuota(q, muri).quota);
  return quote.some((q, i) => q !== pianta.quote![i]) ? { ...pianta, quote } : pianta;
}
const testoDaModello = (t: TestoModello): TestoLavoro => ({ id: t.id, posizione: capovolgi(t.posizione), testo: t.testo, rotazione: arrotonda2(0 - (t.rotazione ?? 0)) });
const testoAModello = (t: TestoLavoro, prima?: TestoModello): TestoModello => ({
  id: t.id, posizione: capovolgi(t.posizione), testo: t.testo,
  ...(t.rotazione || prima?.rotazione !== undefined ? { rotazione: arrotonda2(0 - t.rotazione) } : {}),
});

function muroAModello(m: Muro, stato: StatoLavori, prima?: MuroModello): MuroModello {
  const provenienza = origineVerso(m.origine, prima);
  const altezzaCambiata = m.origineAltezza && m.origineAltezza !== (provenienza.origineMisure?.altezza ?? provenienza.origine);
  return {
    id: m.id,
    p1: capovolgi(m.p1),
    p2: capovolgi(m.p2),
    spessore: m.spessore,
    altezza: m.altezza,
    tipo: m.tipo,
    stato,
    ...(m.funzioneDaVerificare !== undefined ? { funzioneDaVerificare: m.funzioneDaVerificare } : {}),
    ...provenienza,
    ...(altezzaCambiata ? { origineMisure: { ...provenienza.origineMisure, altezza: m.origineAltezza } } : {}),
  };
}

function aperturaAModello(a: Apertura, stato: StatoLavori, prima?: AperturaModello): AperturaModello {
  const battente = a.manovra === "battente" && a.tipo !== "varco";
  const stessoSerramento = prima && a.tipo === prima.tipo && a.larghezza === prima.larghezza && a.altezza === prima.altezza
    && a.sistema === prima.sistema && a.manovra === prima.manovra && a.ante === prima.ante;
  return {
    id: a.id,
    muroId: a.muroId,
    tipo: a.tipo,
    offset: arrotonda2(a.posizione - a.larghezza / 2),
    larghezza: a.larghezza,
    altezza: a.altezza,
    davanzale: a.davanzale,
    manovra: a.tipo === "varco" ? "nessuna" : a.manovra,
    ...(stessoSerramento && prima.luceNettaCm !== undefined && { luceNettaCm: prima.luceNettaCm }),
    ...(stessoSerramento && prima.superficieApribileMq !== undefined && { superficieApribileMq: prima.superficieApribileMq }),
    ...(stessoSerramento && prima.superficieIlluminanteMq !== undefined && { superficieIlluminanteMq: prima.superficieIlluminanteMq }),
    ...(a.ante ? { ante: a.ante } : {}),
    ...(a.sistema ? { sistema: a.sistema } : {}),
    ...(a.oscurante ? { oscurante: a.oscurante } : {}),
    ...(a.cassonetto ? { cassonetto: a.cassonetto } : {}),
    ...(a.altezzaCassonetto ? { altezzaCassonetto: a.altezzaCassonetto } : {}),
    ...(a.motore ? { motore: true } : {}),
    ...(a.zanzariera ? { zanzariera: a.zanzariera } : {}),
    ...(battente && a.versoDaVerificare ? { verso: null } : battente
      ? { verso: { cardine: a.verso.cerniera === "inizio" ? "p1" : "p2", lato: a.verso.lato === "sinistra" ? "destra" : "sinistra" } as const }
      : {}),
    stato,
    ...origineVerso(a.origine, prima),
  };
}

function localeAModello(pianta: Pick<Pianta, "muri">, l: Locale, prima?: LocaleModello): LocaleModello {
  return {
    id: l.id,
    nome: l.nome,
    destinazione: l.destinazione,
    contorno: contornoInterno(pianta, l).map(capovolgi),
    altezza: l.altezza,
    ...(prima?.superficieDichiarataMq !== undefined ? { superficieDichiarataMq: prima.superficieDichiarataMq } : {}),
    ...(l.aperto ? { aperto: true } : {}),
    ...(l.finiture ? { finiture: l.finiture } : {}),
    ...(l.unita ? { unita: l.unita } : {}),
    ...origineVerso(l.origine, prima),
  };
}

const trova = <T extends { id: string }>(lista: T[] | undefined, id: string) => lista?.find((x) => x.id === id);

/**
 * Dalla pianta di lavoro al documento. `base` è il documento di partenza (o l'ultimo
 * prodotto): da lì si tengono titolo, scala, gli altri livelli e le altre proposte,
 * arredi, quote e testi, le origini campo per campo e gli id dei locali del progetto.
 */
export function aPlanimetria(pianta: Pianta, base: Planimetria = nuovaPlanimetria(), livelloId?: string, propostaId: string = ID_PROPOSTA): Planimetria {
  const indice = Math.max(0, base.livelli.findIndex((l) => l.id === livelloId));
  const livelloBase: Livello = base.livelli[indice] ?? { id: "pt", nome: "Piano terra", quota: 0, fatto: statoVuoto(), proposte: [] };
  const fattoBase = livelloBase.fatto;
  const propostaBase = livelloBase.proposte.find((p) => p.id === propostaId);
  const daCad = !!livelloBase.tavolaDwg || livelloBase.ricalco?.bloccata !== undefined || /^cad-\d+$/.test(livelloBase.id);
  const muriCadPrecedenti = daCad ? fattoBase.muri.map(muroDaModello) : null;

  const muriOggi = pianta.muri.filter((m) => m.stato !== "nuovo");
  const localiOggi = pianta.locali.filter(l => l.stato !== "nuovo").map(l => {
    const prima = trova(fattoBase.locali, l.id);
    const locale = localeAModello(daCad ? { muri: muriOggi } : pianta, l, prima);
    if (!prima || !muriCadPrecedenti) return locale;
    const sagoma = contornoDiLavoro(prima, fattoBase.muri, muriCadPrecedenti);
    const ricalcolato = contornoInterno({ muri: muriCadPrecedenti }, sagoma).map(capovolgi);
    // Il ritorno ai fili interni può arrotondare un contorno CAD anche senza una modifica geometrica.
    return locale.contorno.length === ricalcolato.length && locale.contorno.every((p, i) => p.x === ricalcolato[i].x && p.y === ricalcolato[i].y)
      ? { ...locale, contorno: prima.contorno } : locale;
  });
  const fatto: StatoPianta = {
    ...fattoBase,
    muri: muriOggi.map((m) => muroAModello(m, "esistente", trova(fattoBase.muri, m.id))),
    aperture: pianta.aperture
      .filter((a) => a.stato !== "nuovo" && muriOggi.some((m) => m.id === a.muroId))
      .map((a) => aperturaAModello(a, "esistente", trova(fattoBase.aperture, a.id))),
    locali: localiOggi,
    ...(pianta.elementi
      ? { elementi: pianta.elementi.filter((e) => e.stato !== "nuovo").map((e) => elementoAModello(e, "esistente", trova(fattoBase.elementi, e.id))) }
      : {}),
    ...(pianta.quote ? { quote: quoteNellaVista(pianta, "fatto").map(({ quota }) => quotaAModello(quota)) } : {}),
    ...(pianta.testi ? { testi: pianta.testi.map((t) => testoAModello(t, trova(fattoBase.testi, t.id))) } : {}),
    ...(pianta.aree ? { aree: pianta.aree.filter((a) => a.stato !== "nuovo").map((a) => areaAModello(a, "esistente")) } : {}),
  };
  if (fatto.tracciatiImpianti?.length) {
    const ids = new Set(fatto.elementi.map(e => e.id));
    fatto.tracciatiImpianti = fatto.tracciatiImpianti.filter(t => ids.has(t.daId) && ids.has(t.aId));
  }

  const serveProposta =
    !!propostaBase ||
    Object.keys(pianta.nomiProgetto ?? {}).length > 0 ||
    pianta.aperture.some(a => a.stato === "esistente" && pianta.zanzariereProgetto?.[a.id] !== undefined) ||
    pianta.muri.some((m) => m.stato !== "esistente") ||
    pianta.aperture.some((a) => a.stato !== "esistente") ||
    pianta.locali.some((l) => l.stato === "nuovo") ||
    (pianta.quote ?? []).some(q => q.soloProgetto) ||
    (pianta.elementi ?? []).some((e) => e.stato !== "esistente") ||
    (pianta.aree ?? []).some((a) => a.stato !== "esistente") ||
    !!pianta.tracciatiImpianti?.length;
  let proposte = livelloBase.proposte;
  if (serveProposta) {
    const muri = pianta.muri.map((m) => muroAModello(m, m.stato, trova(propostaBase?.muri, m.id) ?? trova(fattoBase.muri, m.id)));
    const proposta: Proposta = {
      ...(propostaBase ?? { elementi: fattoBase.elementi, quote: fattoBase.quote, testi: fattoBase.testi }),
      id: propostaId,
      nome: propostaBase?.nome ?? (propostaId === ID_PROPOSTA ? NOME_PROPOSTA : `Proposta ${propostaId}`),
      ...(pianta.prezziProgetto ? { prezziLavorazioni: pianta.prezziProgetto } : {}),
      muri,
      aperture: pianta.aperture
        .filter((a) => pianta.muri.some((m) => m.id === a.muroId))
        .map((a) => aperturaAModello(aperturaNellaVista(pianta, a, "progetto"), a.stato, trova(propostaBase?.aperture, a.id) ?? trova(fattoBase.aperture, a.id))),
      locali: localiDelProgetto(pianta, muri, propostaBase, daCad ? localiOggi : null),
      ...(pianta.elementi
        ? {
            elementi: pianta.elementi
              .filter((e) => e.stato !== "da_demolire")
              .map((e) => elementoAModello(e, e.stato === "nuovo" ? "nuovo" : "esistente", trova(propostaBase?.elementi, e.id) ?? trova(fattoBase.elementi, e.id))),
          }
        : {}),
      ...(pianta.quote ? { quote: quoteNellaVista(pianta, "progetto").map(({ quota }) => quotaAModello(quota)) } : {}),
      ...(pianta.testi ? { testi: pianta.testi.map((t) => testoAModello(t, trova(propostaBase?.testi, t.id))) } : {}),
      ...(pianta.aree ? { aree: pianta.aree.filter((a) => a.stato !== "da_demolire").map((a) => areaAModello(a, a.stato === "nuovo" ? "nuovo" : "esistente")) } : {}),
    };
    const tracciati = pianta.tracciatiImpianti?.map(t => ({ ...t, vertici: t.vertici.map(capovolgi) })) ?? propostaBase?.tracciatiImpianti;
    if (tracciati) {
      const ids = new Set(proposta.elementi.map(e => e.id));
      proposta.tracciatiImpianti = tracciati.filter(t => ids.has(t.daId) && ids.has(t.aId));
    }
    proposte = propostaBase ? proposte.map((p) => (p.id === propostaId ? proposta : p)) : [proposta, ...proposte];
  }
  const altezzeCorrette = new Map(muriOggi.flatMap(m => {
    const prima = trova(fattoBase.muri, m.id);
    return m.origineAltezza === "rilevata" && prima && (m.altezza !== prima.altezza || origineMisura(prima, "altezza") !== "rilevata")
      ? [[m.id, m.altezza] as const] : [];
  }));
  if (altezzeCorrette.size) proposte = proposte.map(p => p.id === propostaId ? p : {
    ...p, muri: p.muri.map(m => {
      const altezza = altezzeCorrette.get(m.id);
      return altezza === undefined || m.stato === "nuovo"
        ? m : { ...m, altezza, origineMisure: { ...m.origineMisure, altezza: "rilevata" } };
    }),
  });

  const livello: Livello = { ...livelloBase, fatto, proposte };
  const livelli = base.livelli.length ? base.livelli.map((l, i) => (i === indice ? livello : l)) : [livello];
  const letturaDocumento = Object.hasOwn(pianta, "letturaDocumento") ? pianta.letturaDocumento : base.letturaDocumento;
  return { ...base, ambitoDocumento: pianta.ambitoDocumento, letturaDocumento, livelli };
}

/**
 * I locali dopo i lavori: si richiudono dalle pareti del progetto (senza le demolite).
 * Ogni locale tiene l'id del locale del progetto che conteneva (così le chiavi del
 * computo non cambiano), altrimenti quello della stanza di oggi più grande che ci
 * sta dentro (abbattendo un tramezzo, il soggiorno si prende la cucina).
 */
function localiDelProgetto(pianta: Pianta, muri: MuroModello[], propostaBase: Proposta | undefined, localiCad: LocaleModello[] | null): LocaleModello[] {
  const daCad = localiCad !== null;
  if (propostaBase?.distribuzioneBilocali) {
    const primaPerId = new Map(propostaBase.muri.map(m => [m.id, m]));
    const localiDiLavoro = new Map(pianta.locali.map(l => [l.id, l]));
    const localiOriginali = new Map(propostaBase.locali.map(l => [l.id, l]));
    const daUnire: MuroModello[] = [];
    const geometriaInvariata = muri.length === primaPerId.size && muri.every(m => {
      const prima = primaPerId.get(m.id);
      if (!prima || prima.spessore !== m.spessore || prima.p1.x !== m.p1.x || prima.p1.y !== m.p1.y ||
        prima.p2.x !== m.p2.x || prima.p2.y !== m.p2.y) return false;
      if (prima.stato === m.stato) return true;
      if (prima.stato !== "esistente" || m.stato !== "da_demolire" || prima.tipo !== "tramezzo" || m.tipo !== "tramezzo") return false;
      daUnire.push(m);
      return true;
    });
    // I contorni di una distribuzione importata possono comprendere passaggi senza una faccia chiusa.
    if (geometriaInvariata && propostaBase.locali.every(l => localiDiLavoro.has(l.id)) &&
      pianta.locali.every(l => l.stato !== "nuovo" || localiOriginali.has(l.id))) {
      const localiConModifiche = propostaBase.locali.map(l => {
        const nomi = pianta.nomiProgetto?.[l.id];
        const nuovo = localiDiLavoro.get(l.id);
        const modificato = nuovo?.stato === "nuovo" ? { ...l, altezza: nuovo.altezza, nome: nuovo.nome,
          destinazione: nuovo.destinazione, finiture: nuovo.finiture, unita: nuovo.unita } : l;
        return nomi ? { ...modificato, ...nomi, unita: nomi.unita === undefined ? modificato.unita : nomi.unita ?? undefined } : modificato;
      });
      return daUnire.reduce((locali, muro) => unisciLocaliDopoDemolizione(locali, muro, muri) ?? locali, localiConModifiche);
    }
  }
  const usati = new Set<string>();
  const sostituiti = new Set(propostaBase?.frazionamenti?.map(f => f.localeId));
  const disegnati = new Set(propostaBase?.frazionamenti?.flatMap(f => f.parti));
  const esterni = new Map(propostaBase?.distribuzioneBilocali
    ? propostaBase.locali.filter(l => l.aperto && !eAmbienteInterno(l)).map(l => [l.id, l]) : []);
  for (const id of esterni.keys()) disegnati.add(id);
  let stanze = pianta.locali.filter(l => !sostituiti.has(l.id) && (!propostaBase?.distribuzioneBilocali || l.stato === "nuovo" || esterni.has(l.id))).map(l => {
    const prima = propostaBase?.locali.find(p => p.id === l.id);
    const esterno = esterni.get(l.id);
    return { ...(esterno ?? localiCad?.find(s => s.id === l.id) ?? localeAModello(pianta, l, prima)), nuova: l.stato === "nuovo" };
  });
  const conservaContorniCad = daCad && !propostaBase?.distribuzioneBilocali && !disegnati.size && !muri.some(m => m.stato === "da_demolire");
  if (conservaContorniCad) {
    for (const muro of muri.filter(m => m.stato === "nuovo" && m.tipo === "tramezzo")) {
      stanze = stanze.flatMap((l, i) => {
        const parti = !l.aperto && dividiContornoSulTramezzo(l.contorno, muro, muri);
        if (!parti) return [l];
        const [prima, seconda] = parti.sort((a, b) => areaPoligono(b) - areaPoligono(a));
        const id = `${muro.id.slice(0, 50)}-parte-${i + 1}`;
        const esistente = propostaBase?.locali.find(s => s.id === id);
        const finiture = pianta.nomiProgetto?.[l.id]?.finiture ?? l.finiture;
        return [
          { ...l, contorno: prima, superficieDichiarataMq: undefined },
          { ...l, finiture, ...esistente, id, nome: esistente?.nome ?? "Stanza", destinazione: esistente?.destinazione ?? "altro",
            contorno: seconda, superficieDichiarataMq: undefined, nuova: true },
        ];
      });
    }
    // I contorni CAD sono già al filo interno. Mantenerli evita che un raccordo lontano deformi il locale.
    for (const l of stanze) disegnati.add(l.id);
  }
  const dentro = (contenitore: Punto[]) => (c: { contorno: Punto[] }) => {
    const p = puntoInterno(c.contorno);
    return !!p && puntoNelPoligono(p, contenitore);
  };
  const partiDisegnate = stanze.filter(s => disegnati.has(s.id));
  const contorniCad = daCad ? [...stanze, ...(propostaBase?.locali ?? [])].filter(s => !s.aperto) : [];
  const nuoviMuri = daCad ? new Set(muri.filter(m => m.stato === "nuovo").map(m => m.id)) : undefined;
  const facce = ricostruisciLocali(muri).filter(f =>
    !partiDisegnate.some(s => dentro(f.contorno)(s) || dentro(s.contorno)(f)));
  // Il punto del locale originario può cadere nello spessore del nuovo muro.
  const contieneParte = (s: { aperto?: boolean; contorno: Punto[] }, parte: Punto[]) =>
    !s.aperto && areaPoligono(s.contorno) - areaPoligono(parte) > 1
    && parte.every(p => puntoNelPoligono(p, s.contorno) || distanzaDalContorno(p, s.contorno) <= 0.5);
  const scegli = <T extends { id: string; aperto?: boolean; contorno: Punto[] }>(lista: T[], contenitore: Punto[]) => {
    const liberi = lista.filter(c => !usati.has(c.id));
    const interi = liberi.filter(dentro(contenitore));
    const candidati = interi.length ? interi : liberi.filter(c => contieneParte(c, contenitore));
    return candidati.sort((a, b) => areaPoligono(b.contorno) - areaPoligono(a.contorno))[0];
  };

  const out: LocaleModello[] = [];
  let progressivo = 1;
  for (const f of facce) {
    // In un DWG una faccia chiusa può essere un vuoto, un cavedio o un contorno senza riscontro.
    const contorniSovrapposti = contorniCad.filter(s => interniSovrapposti(s.contorno, f.contorno));
    if (nuoviMuri && (!contorniSovrapposti.length || conservaContorniCad) && !f.muriIds.every(id => nuoviMuri.has(id))) continue;
    if (daCad && contornoIncrociato(f.contorno)) continue;
    const fonte: LocaleModello | undefined =
      (propostaBase && scegli(propostaBase.locali, f.contorno)) ||
      scegli(stanze.filter((s) => s.nuova), f.contorno) ||
      scegli(stanze, f.contorno);
    let id = fonte?.id;
    if (!id) {
      while (usati.has(`progetto-${progressivo}`) || pianta.locali.some((l) => l.id === `progetto-${progressivo}`)) progressivo++;
      id = `progetto-${progressivo}`;
    }
    usati.add(id);
    const nomi = pianta.nomiProgetto?.[id];
    const origini = f.muriIds.map((mid) => muri.find((m) => m.id === mid)).filter((m): m is MuroModello => !!m).map(origineDi);
    out.push({
      id,
      nome: nomi?.nome ?? fonte?.nome ?? "Stanza",
      destinazione: nomi?.destinazione ?? fonte?.destinazione ?? "altro",
      contorno: f.contorno.map((p) => ({ x: arrotonda2(p.x), y: arrotonda2(p.y) })),
      altezza: fonte?.altezza ?? ALTEZZA_PIANO,
      ...(fonte?.aperto ? { aperto: true } : {}),
      ...((nomi?.finiture ?? fonte?.finiture) ? { finiture: nomi?.finiture ?? fonte?.finiture } : {}),
      unita: nomi?.unita === undefined ? fonte?.unita : nomi.unita ?? undefined,
      origine: originePeggiore(...origini, ...contorniSovrapposti.map(s => origineMisura(s, "contorno"))),
    });
  }
  // Stanze senza pareti intorno (disegnate solo come contorno): restano come sono.
  for (const s of stanze) {
    if (usati.has(s.id) || (!disegnati.has(s.id) && facce.some(f => dentro(f.contorno)(s) || contieneParte(s, f.contorno)))) continue;
    usati.add(s.id);
    const { nuova: _nuova, ...locale } = s;
    const nomi = pianta.nomiProgetto?.[s.id];
    out.push(nomi ? { ...locale, ...nomi, unita: nomi.unita === undefined ? locale.unita : nomi.unita ?? undefined } : locale);
  }
  return out;
}

// ─── Quel che l'editor mostra, letto dal documento ───────────────────────────

export interface LocaleVista {
  finiture?: Finiture;
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Al filo interno, in coordinate dello schermo. */
  contorno: Punto[];
  mq: number;
  superficieDichiarataMq?: number;
  aperto?: boolean;
  unita?: string;
  /** In metri. */
  perimetro: number;
  /** Lunghezza interna di ogni lato, in cm (lato i = contorno[i] → contorno[i+1]). */
  lati: number[];
  stimata: boolean;
}

export interface ElementoVista {
  id: string;
  tipo: string;
  etichetta?: string;
  centro: Punto;
  /** Gradi, in senso orario sullo schermo. */
  rotazione: number;
  larghezza: number;
  profondita: number;
  alzateCad?: AlzataCad[];
}

export interface DatiVista {
  ambito: string;
  locali: LocaleVista[];
  elementi: ElementoVista[];
  testi: Array<{ id: string; posizione: Punto; testo: string; rotazione: number }>;
  problemi: Problema[];
  quantita: MappaQuantita;
}

/**
 * Locali, quantità e problemi della vista scelta, calcolati dal documento con le
 * funzioni della fase 1. «Progetto» senza proposta è lo stato di fatto.
 */
export function datiVista(pianta: Pianta, documento: Planimetria, vista: "fatto" | "progetto", livelloId?: string, propostaId: string = ID_PROPOSTA): DatiVista {
  const livello = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
  const proposta = livello?.proposte.find((p) => p.id === propostaId);
  const ambito = vista === "progetto" && proposta ? `progetto:${propostaId}` : "fatto";
  const stato = ambito === "fatto" ? livello?.fatto : proposta;
  const quantita = calcolaQuantita(documento);
  const problemi = controllaPlanimetria(documento).filter((p) => !p.ambito || p.ambito === ambito);
  const locali = (stato?.locali ?? []).map((l): LocaleVista => {
    // Le stanze nuove del progetto si misurano sul loro contorno di lavoro, così il
    // lato i è lo stesso che i comandi allungano.
    const diLavoro = pianta.locali.find((x) => x.id === l.id && (ambito === "fatto" || x.stato === "nuovo"));
    const contorno = diLavoro ? contornoInterno(pianta, diLavoro) : l.contorno.map(capovolgi);
    const pavimento = quantita[`${ambito}:locale:${l.id}.pavimento_mq`];
    const perimetro = quantita[`${ambito}:locale:${l.id}.perimetro_ml`];
    return {
      id: l.id,
      nome: l.nome,
      destinazione: l.destinazione,
      contorno,
      finiture: l.finiture,
      mq: pavimento?.valore ?? areaPoligono(l.contorno) / 10_000,
      superficieDichiarataMq: l.superficieDichiarataMq,
      aperto: l.aperto,
      unita: l.unita,
      perimetro: perimetro?.valore ?? 0,
      lati: contorno.map((a, i) => lunghezza(a, contorno[(i + 1) % contorno.length])),
      stimata: (pavimento?.origine ?? origineDi(l)) === "stimata",
    };
  });
  const elementi = (stato?.elementi ?? []).map((e) => ({
    id: e.id,
    tipo: e.tipo,
    etichetta: e.etichetta,
    centro: capovolgi(e.posizione),
    rotazione: 0 - (e.rotazione ?? 0),
    larghezza: e.larghezza,
    profondita: e.profondita,
    alzateCad: e.alzateCad?.map(capovolgiAlzata),
  }));
  const testi = (stato?.testi ?? []).map((t) => ({ id: t.id, posizione: capovolgi(t.posizione), testo: t.testo, rotazione: 0 - (t.rotazione ?? 0) }));
  return { ambito, locali, elementi, testi, problemi, quantita };
}


// ─── Piani (fase 5 del piano di completamento) ───────────────────────────────

export type BaseNuovoPiano = "vuoto" | "esterni" | "tutto" | "identico";

/**
 * Un piano nuovo sopra (o sotto) quelli che ci sono. Si può partire vuoti, dalle sole pareti
 * esterne del piano scelto (il perimetro dell'edificio), dalla copia di tutte le pareti, porte e
 * finestre di oggi, oppure dal piano identico (anche stanze, arredi, impianti, quote e testi: il
 * piano tipo di un condominio). Gli id copiati prendono un suffisso: sono unici su tutti i livelli.
 */
export function aggiungiLivello(
  doc: Planimetria,
  o: { nome: string; quota: number; base: BaseNuovoPiano; daLivelloId?: string },
): { documento: Planimetria; id: string } {
  const usati = new Set(doc.livelli.map((l) => l.id));
  let n = doc.livelli.length;
  let id = `p${n}`;
  while (usati.has(id)) id = `p${++n}`;
  const origine = doc.livelli.find((l) => l.id === o.daLivelloId) ?? doc.livelli[doc.livelli.length - 1];
  const fatto = statoVuoto();
  if (origine && o.base !== "vuoto") {
    const tutte = o.base === "tutto" || o.base === "identico";
    const muri = origine.fatto.muri.filter((m) => tutte || m.tipo === "esterno" || m.tipo === "portante");
    const ids = new Map(muri.map((m) => [m.id, `${m.id}_${id}`]));
    fatto.muri = muri.map((m) => ({ ...m, id: ids.get(m.id)!, stato: "esistente" as const }));
    if (o.base === "identico") {
      const loc = new Map(origine.fatto.locali.map((l) => [l.id, `${l.id}_${id}`]));
      fatto.locali = origine.fatto.locali.map((l) => ({ ...l, id: loc.get(l.id)! }));
      fatto.elementi = origine.fatto.elementi.map((e) => ({ ...e, id: `${e.id}_${id}`, stato: "esistente" as const, ...(e.localeId ? { localeId: loc.get(e.localeId) ?? null } : {}) }));
      if (origine.fatto.tracciatiImpianti?.length) fatto.tracciatiImpianti = origine.fatto.tracciatiImpianti.map(t => ({
        ...t, daId: `${t.daId}_${id}`, aId: `${t.aId}_${id}`, vertici: t.vertici.map(p => ({ ...p })),
      }));
      fatto.quote = origine.fatto.quote.map((q) => ({ ...q, id: `${q.id}_${id}`, riferimenti: rinominaRiferimentiQuota(q, ids) }));
      fatto.testi = origine.fatto.testi.map((t) => ({ ...t, id: `${t.id}_${id}` }));
    }
    if (tutte) {
      fatto.aperture = origine.fatto.aperture
        .filter((a) => ids.has(a.muroId))
        .map((a) => ({ ...a, id: `${a.id}_${id}`, muroId: ids.get(a.muroId)!, stato: "esistente" as const }));
    }
  }
  const livello: Livello = { id, nome: o.nome.trim() || `Piano ${doc.livelli.length}`, quota: o.quota, fatto, proposte: [] };
  return { documento: { ...doc, livelli: [...doc.livelli, livello].sort((a, b) => a.quota - b.quota) }, id };
}

/** L'immagine da ricalcare del piano (null per toglierla). */
export function impostaRicalco(doc: Planimetria, livelloId: string, ricalco: Ricalco | null): Planimetria {
  return {
    ...doc,
    livelli: doc.livelli.map((l) => {
      if (l.id !== livelloId) return l;
      const { ricalco: _vecchio, ...resto } = l;
      return ricalco ? { ...resto, ricalco } : resto;
    }),
  };
}

export function rinominaLivello(doc: Planimetria, id: string, campi: { nome?: string; quota?: number; tetto?: Tetto | null }): Planimetria {
  const livelli = doc.livelli.map((l) => {
    if (l.id !== id) return l;
    const { tetto: _prima, ...resto } = l;
    const tetto = campi.tetto === undefined ? l.tetto : campi.tetto ?? undefined;
    return { ...resto, ...(tetto ? { tetto } : {}), ...(campi.nome?.trim() ? { nome: campi.nome.trim() } : {}), ...(campi.quota != null ? { quota: campi.quota } : {}) };
  });
  return { ...doc, livelli: [...livelli].sort((a, b) => a.quota - b.quota) };
}

/** Il piano si toglie solo se ne resta almeno uno. */
export function eliminaLivello(doc: Planimetria, id: string): Planimetria {
  if (doc.livelli.length <= 1) return doc;
  return { ...doc, livelli: doc.livelli.filter((l) => l.id !== id) };
}


// ─── Proposte alternative (seconda parte del piano, A1) ──────────────────────

/** La prossima lettera libera: A, B, C… (poi A2, B2…). */
export function prossimaProposta(livello: Pick<Livello, "proposte">): string {
  const usati = new Set(livello.proposte.map((p) => p.id));
  for (let giro = 1; giro < 10; giro++) {
    for (const l of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const id = giro === 1 ? l : `${l}${giro}`;
      if (!usati.has(id)) return id;
    }
  }
  return `P${Date.now().toString(36)}`;
}

/**
 * Un'alternativa nuova copiando una proposta (o, se il livello non ne ha, lo stato di oggi). Gli
 * id dentro la proposta restano quelli: sono unici per stato, e le chiavi del computo non cambiano.
 */
export function duplicaProposta(doc: Planimetria, livelloId: string, daId?: string): { documento: Planimetria; id: string } {
  const livello = doc.livelli.find((l) => l.id === livelloId);
  if (!livello) return { documento: doc, id: daId ?? ID_PROPOSTA };
  const id = prossimaProposta(livello);
  const origine = livello.proposte.find((p) => p.id === daId) ?? livello.proposte[0];
  const copia: Proposta = origine
    ? { ...structuredClone(origine), id, nome: `Proposta ${id}`, alternativaDi: origine.id }
    : { ...structuredClone(livello.fatto), id, nome: `Proposta ${id}` };
  const nuovo: Livello = { ...livello, proposte: [...livello.proposte, copia] };
  return { documento: { ...doc, livelli: doc.livelli.map((l) => (l.id === livelloId ? nuovo : l)) }, id };
}

export function rinominaProposta(doc: Planimetria, livelloId: string, id: string, nome: string): Planimetria {
  const n = nome.trim();
  if (!n) return doc;
  return { ...doc, livelli: doc.livelli.map((l) => (l.id === livelloId ? { ...l, proposte: l.proposte.map((p) => (p.id === id ? { ...p, nome: n } : p)) } : l)) };
}

/** Si toglie un'alternativa; l'ultima rimasta si può togliere solo se non è l'unica del progetto. */
export function eliminaProposta(doc: Planimetria, livelloId: string, id: string): Planimetria {
  return { ...doc, livelli: doc.livelli.map((l) => (l.id === livelloId ? { ...l, proposte: l.proposte.filter((p) => p.id !== id) } : l)) };
}
