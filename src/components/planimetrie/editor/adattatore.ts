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
  nuovaPlanimetria,
  originePeggiore,
  statoVuoto,
  type Apertura as AperturaModello,
  type Destinazione,
  type Finiture,
  type Livello,
  type Locale as LocaleModello,
  type Manovra,
  type Muro as MuroModello,
  type Origine,
  type Planimetria,
  type Proposta,
  type StatoLavori,
  type StatoPianta,
  type TipoMuro,
} from "../../../../shared/planimetrie/modello.ts";
import { areaPoligono, puntoInterno, puntoNelPoligono, ricostruisciLocali } from "../../../../shared/planimetrie/geometria.ts";
import { calcolaQuantita, type MappaQuantita } from "../../../../shared/planimetrie/quantita.ts";
import { controllaPlanimetria, type Problema } from "../../../../shared/planimetrie/controllo.ts";

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
  /** Da che parte sta la cerniera e verso quale lato (sullo schermo) si apre. */
  verso: { cerniera: "inizio" | "fine"; lato: "sinistra" | "destra" };
  stato: StatoElemento;
  origine: Origine;
}

export interface Locale {
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Contorno sull'asse dei muri, in senso qualunque. */
  contorno: Punto[];
  altezza: number;
  finiture?: Finiture;
  /** «nuovo» se la stanza nasce disegnata nel progetto. */
  stato: StatoElemento;
  origine: Origine;
}

export interface Pianta {
  versione: 1;
  unita: "cm";
  muri: Muro[];
  aperture: Apertura[];
  locali: Locale[];
  /** Nome e destinazione dei locali del progetto, quando sono diversi da quelli di oggi. */
  nomiProgetto?: Record<string, { nome: string; destinazione: Destinazione }>;
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
  { valore: "altro", etichetta: "Altro" },
];

export const SPESSORE_TRAMEZZO = 10;
export const SPESSORE_PORTANTE = 30;
export const ALTEZZA_PIANO = 270;

export function piantaVuota(): Pianta {
  return { versione: 1, unita: "cm", muri: [], aperture: [], locali: [] };
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
function muroSulLato(pianta: Pianta, a: Punto, b: Punto): Muro | undefined {
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
export function contornoInterno(pianta: Pianta, locale: Locale): Punto[] {
  const p = locale.contorno;
  const n = p.length;
  if (n < 3) return p;
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
  return { id: m.id, p1: capovolgi(m.p1), p2: capovolgi(m.p2), spessore: m.spessore, altezza: m.altezza, tipo: m.tipo, stato: m.stato, origine: origineDi(m) };
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
    // capovolgendo y la sinistra del documento diventa la destra dello schermo
    verso: a.verso
      ? { cerniera: a.verso.cardine === "p1" ? "inizio" : "fine", lato: a.verso.lato === "sinistra" ? "destra" : "sinistra" }
      : { cerniera: "inizio", lato: "destra" },
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

/**
 * Dal documento alla pianta di lavoro (un livello: il primo, o quello indicato).
 * Le pareti della proposta che non ci sono oggi entrano come «nuove»; quelle che la
 * proposta demolisce sono segnate «da demolire».
 */
export function daPlanimetria(doc: Planimetria, livelloId?: string): Pianta {
  const livello = doc.livelli.find((l) => l.id === livelloId) ?? doc.livelli[0];
  if (!livello) return piantaVuota();
  const { fatto } = livello;
  const proposta = livello.proposte.find((p) => p.id === ID_PROPOSTA) ?? livello.proposte[0];
  const muri = fatto.muri.map(muroDaModello);
  const aperture = fatto.aperture.map(aperturaDaModello);
  const nomiProgetto: NonNullable<Pianta["nomiProgetto"]> = {};
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
    }
    for (const l of proposta.locali) {
      const oggi = fatto.locali.find((x) => x.id === l.id);
      if (!oggi || oggi.nome !== l.nome || oggi.destinazione !== l.destinazione) {
        nomiProgetto[l.id] = { nome: l.nome, destinazione: l.destinazione };
      }
    }
  }
  const locali: Locale[] = fatto.locali.map((l) => ({
    id: l.id,
    nome: l.nome,
    destinazione: l.destinazione,
    contorno: contornoSullAsse(l.contorno, fatto.muri).map(capovolgi),
    altezza: l.altezza,
    ...(l.finiture ? { finiture: l.finiture } : {}),
    stato: "esistente",
    origine: origineDi(l),
  }));
  return { ...piantaVuota(), muri, aperture, locali, ...(Object.keys(nomiProgetto).length ? { nomiProgetto } : {}) };
}

function muroAModello(m: Muro, stato: StatoLavori, prima?: MuroModello): MuroModello {
  return {
    id: m.id,
    p1: capovolgi(m.p1),
    p2: capovolgi(m.p2),
    spessore: m.spessore,
    altezza: m.altezza,
    tipo: m.tipo,
    stato,
    ...origineVerso(m.origine, prima),
  };
}

function aperturaAModello(a: Apertura, stato: StatoLavori, prima?: AperturaModello): AperturaModello {
  const battente = a.manovra === "battente" && a.tipo !== "varco";
  return {
    id: a.id,
    muroId: a.muroId,
    tipo: a.tipo,
    offset: arrotonda2(a.posizione - a.larghezza / 2),
    larghezza: a.larghezza,
    altezza: a.altezza,
    davanzale: a.davanzale,
    manovra: a.tipo === "varco" ? "nessuna" : a.manovra,
    ...(battente
      ? { verso: { cardine: a.verso.cerniera === "inizio" ? "p1" : "p2", lato: a.verso.lato === "sinistra" ? "destra" : "sinistra" } as const }
      : {}),
    stato,
    ...origineVerso(a.origine, prima),
  };
}

function localeAModello(pianta: Pianta, l: Locale, prima?: LocaleModello): LocaleModello {
  return {
    id: l.id,
    nome: l.nome,
    destinazione: l.destinazione,
    contorno: contornoInterno(pianta, l).map(capovolgi),
    altezza: l.altezza,
    ...(l.finiture ? { finiture: l.finiture } : {}),
    ...origineVerso(l.origine, prima),
  };
}

const trova = <T extends { id: string }>(lista: T[] | undefined, id: string) => lista?.find((x) => x.id === id);

/**
 * Dalla pianta di lavoro al documento. `base` è il documento di partenza (o l'ultimo
 * prodotto): da lì si tengono titolo, scala, gli altri livelli e le altre proposte,
 * arredi, quote e testi, le origini campo per campo e gli id dei locali del progetto.
 */
export function aPlanimetria(pianta: Pianta, base: Planimetria = nuovaPlanimetria(), livelloId?: string): Planimetria {
  const indice = Math.max(0, base.livelli.findIndex((l) => l.id === livelloId));
  const livelloBase: Livello = base.livelli[indice] ?? { id: "pt", nome: "Piano terra", quota: 0, fatto: statoVuoto(), proposte: [] };
  const fattoBase = livelloBase.fatto;
  const propostaBase = livelloBase.proposte.find((p) => p.id === ID_PROPOSTA);

  const muriOggi = pianta.muri.filter((m) => m.stato !== "nuovo");
  const fatto: StatoPianta = {
    ...fattoBase,
    muri: muriOggi.map((m) => muroAModello(m, "esistente", trova(fattoBase.muri, m.id))),
    aperture: pianta.aperture
      .filter((a) => a.stato !== "nuovo" && muriOggi.some((m) => m.id === a.muroId))
      .map((a) => aperturaAModello(a, "esistente", trova(fattoBase.aperture, a.id))),
    locali: pianta.locali.filter((l) => l.stato !== "nuovo").map((l) => localeAModello(pianta, l, trova(fattoBase.locali, l.id))),
  };

  const serveProposta =
    !!propostaBase ||
    pianta.muri.some((m) => m.stato !== "esistente") ||
    pianta.aperture.some((a) => a.stato !== "esistente") ||
    pianta.locali.some((l) => l.stato === "nuovo");
  let proposte = livelloBase.proposte;
  if (serveProposta) {
    const muri = pianta.muri.map((m) => muroAModello(m, m.stato, trova(propostaBase?.muri, m.id) ?? trova(fattoBase.muri, m.id)));
    const proposta: Proposta = {
      ...(propostaBase ?? { elementi: fattoBase.elementi, quote: fattoBase.quote, testi: fattoBase.testi }),
      id: ID_PROPOSTA,
      nome: propostaBase?.nome ?? NOME_PROPOSTA,
      muri,
      aperture: pianta.aperture
        .filter((a) => pianta.muri.some((m) => m.id === a.muroId))
        .map((a) => aperturaAModello(a, a.stato, trova(propostaBase?.aperture, a.id) ?? trova(fattoBase.aperture, a.id))),
      locali: localiDelProgetto(pianta, muri, propostaBase),
    };
    proposte = propostaBase ? proposte.map((p) => (p.id === ID_PROPOSTA ? proposta : p)) : [proposta, ...proposte];
  }

  const livello: Livello = { ...livelloBase, fatto, proposte };
  const livelli = base.livelli.length ? base.livelli.map((l, i) => (i === indice ? livello : l)) : [livello];
  return { ...base, livelli };
}

/**
 * I locali dopo i lavori: si richiudono dalle pareti del progetto (senza le demolite).
 * Ogni locale tiene l'id del locale del progetto che conteneva (così le chiavi del
 * computo non cambiano), altrimenti quello della stanza di oggi più grande che ci
 * sta dentro (abbattendo un tramezzo, il soggiorno si prende la cucina).
 */
function localiDelProgetto(pianta: Pianta, muri: MuroModello[], propostaBase?: Proposta): LocaleModello[] {
  const facce = ricostruisciLocali(muri);
  const usati = new Set<string>();
  const stanze = pianta.locali.map((l) => ({ ...localeAModello(pianta, l), nuova: l.stato === "nuovo" }));
  const dentro = (contenitore: Punto[]) => (c: { contorno: Punto[] }) => {
    const p = puntoInterno(c.contorno);
    return !!p && puntoNelPoligono(p, contenitore);
  };
  const scegli = <T extends { id: string; contorno: Punto[] }>(lista: T[], contenitore: Punto[]) =>
    lista
      .filter((c) => !usati.has(c.id) && dentro(contenitore)(c))
      .sort((a, b) => areaPoligono(b.contorno) - areaPoligono(a.contorno))[0];

  const out: LocaleModello[] = [];
  let progressivo = 1;
  for (const f of facce) {
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
      ...(fonte?.finiture ? { finiture: fonte.finiture } : {}),
      origine: originePeggiore(...origini),
    });
  }
  // Stanze senza pareti intorno (disegnate solo come contorno): restano come sono.
  for (const s of stanze) {
    if (usati.has(s.id) || facce.some((f) => dentro(f.contorno)(s))) continue;
    usati.add(s.id);
    const { nuova: _nuova, ...locale } = s;
    const nomi = pianta.nomiProgetto?.[s.id];
    out.push(nomi ? { ...locale, ...nomi } : locale);
  }
  return out;
}

// ─── Quel che l'editor mostra, letto dal documento ───────────────────────────

export interface LocaleVista {
  id: string;
  nome: string;
  destinazione: Destinazione;
  /** Al filo interno, in coordinate dello schermo. */
  contorno: Punto[];
  mq: number;
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
export function datiVista(pianta: Pianta, documento: Planimetria, vista: "fatto" | "progetto"): DatiVista {
  const livello = documento.livelli[0];
  const proposta = livello?.proposte.find((p) => p.id === ID_PROPOSTA);
  const ambito = vista === "progetto" && proposta ? `progetto:${ID_PROPOSTA}` : "fatto";
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
      mq: pavimento?.valore ?? areaPoligono(l.contorno) / 10_000,
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
  }));
  const testi = (stato?.testi ?? []).map((t) => ({ id: t.id, posizione: capovolgi(t.posizione), testo: t.testo, rotazione: 0 - (t.rotazione ?? 0) }));
  return { ambito, locali, elementi, testi, problemi, quantita };
}
