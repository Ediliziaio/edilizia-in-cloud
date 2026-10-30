/**
 * La scena: la pianta ridotta a poligoni, archi, cerchi e scritte, ognuno sul
 * suo livello (muri, aperture, quote…). PDF, SVG, PNG e DXF disegnano tutti la
 * stessa scena, così le quattro uscite non possono raccontare piante diverse.
 *
 * Coordinate in centimetri della pianta, y verso il basso. Le misure «di
 * foglio» (spessore delle linee, altezza delle scritte, distanza delle quote)
 * sono in millimetri stampati e passano in centimetri con la scala.
 */
import {
  allarga, diff, distanza, lungo, numeroIt, per, puntiArco, puntoEtichetta, riquadroDi, riquadroVuoto, sinistra, somma, versore,
  type Riquadro,
} from "./geometria";
import { simboloElemento } from "./simboli";
import { texturaPavimento } from "./texture";
import type {
  AperturaVista, MuroVista, OrigineMisura, Punto, StatoCostruttivo, StileDisegno, VistaPianta,
} from "./tipi";

export type NomeLayer =
  | "MURI" | "DEMOLIZIONI" | "NUOVO" | "APERTURE" | "LOCALI" | "PAVIMENTI" | "ARREDI" | "QUOTE" | "TESTI";

/** L'ordine in cui i livelli si disegnano: sotto i pavimenti, sopra le scritte. */
export const ORDINE_LAYER: NomeLayer[] = [
  "PAVIMENTI", "LOCALI", "ARREDI", "MURI", "DEMOLIZIONI", "NUOVO", "APERTURE", "QUOTE", "TESTI",
];

export interface Tratto {
  colore: string;
  /** Spessore della linea stampata, in mm. */
  spessoreMm: number;
  /** Tratteggio stampato, in mm (pieno, vuoto, …). */
  tratteggioMm?: number[];
}

interface Base {
  layer: NomeLayer;
}

export interface Poligono extends Base {
  tipo: "poligono";
  punti: Punto[];
  chiuso: boolean;
  riempimento?: string;
  tratto?: Tratto;
}

export interface Arco extends Base {
  tipo: "arco";
  centro: Punto;
  raggio: number;
  /** Radianti, crescenti in senso orario sullo schermo; `fine` > `inizio`. */
  inizio: number;
  fine: number;
  tratto: Tratto;
}

export interface Cerchio extends Base {
  tipo: "cerchio";
  centro: Punto;
  raggio: number;
  riempimento?: string;
  tratto?: Tratto;
}

export interface Testo extends Base {
  tipo: "testo";
  posizione: Punto;
  testo: string;
  /** Altezza del carattere stampato, in mm. */
  altezzaMm: number;
  allinea: "sinistra" | "centro" | "destra";
  verticale: "basso" | "centro" | "alto";
  /** Gradi, in senso orario sullo schermo. */
  rotazione: number;
  colore: string;
  grassetto?: boolean;
}

export type Primitiva = Poligono | Arco | Cerchio | Testo;

export interface Scena {
  primitive: Primitiva[];
  /** Tutto ciò che si disegna, quote e scritte comprese, in cm. */
  riquadro: Riquadro;
  scala: number;
  stile: StileDisegno;
}

export interface OpzioniScena {
  stile?: StileDisegno;
  /** Denominatore della scala (50 = 1:50): serve per spessori, scritte e quote. */
  scala?: number;
  /** Catene di quote sui lati esterni. Di serie sì. */
  quoteAutomatiche?: boolean;
  /** Le quote in metri («4,20») o in centimetri («420»). */
  unitaQuote?: "m" | "cm";
  /** Le scritte nei locali (nome, superficie, altezza). Di serie sì. */
  etichetteLocali?: boolean;
}

// ─── Colori ──────────────────────────────────────────────────────────────────

/** Giallo e rosso della convenzione italiana; il nero dei muri esistenti. */
export const COLORI_STATO: Record<StatoCostruttivo, { riempimento: string; bordo: string }> = {
  esistente: { riempimento: "#3A3A3A", bordo: "#000000" },
  da_demolire: { riempimento: "#FFD400", bordo: "#7A6400" },
  nuovo: { riempimento: "#E30613", bordo: "#7A0008" },
};

const LAYER_STATO: Record<StatoCostruttivo, NomeLayer> = {
  esistente: "MURI",
  da_demolire: "DEMOLIZIONI",
  nuovo: "NUOVO",
};

const INCHIOSTRO = "#111111";
const GRIGIO_QUOTE = "#222222";

// ─── Muri ────────────────────────────────────────────────────────────────────

interface Intervallo {
  da: number;
  a: number;
}

/**
 * Quanto allungare (o accorciare, se negativo) un muro alle due estremità.
 * In un angolo, dove due muri finiscono nello stesso punto, ognuno si allunga
 * di mezzo spessore dell'altro e l'angolo si chiude. In una T, dove un muro
 * finisce sull'asse di un altro, si ferma sul filo di quello e non ci entra:
 * altrimenti un tramezzo giallo coprirebbe un pezzo di muro esterno che resta.
 */
export function allungamenti(m: MuroVista, muri: MuroVista[]): [number, number] {
  const tolleranza = 1;
  const allunga = (p: Punto) => {
    let angolo = 0, ti = 0;
    for (const o of muri) {
      if (o === m) continue;
      if (distanza(p, o.p1) <= tolleranza || distanza(p, o.p2) <= tolleranza) angolo = Math.max(angolo, o.spessore / 2);
      else if (distanzaPuntoAsse(p, o) <= tolleranza) ti = Math.max(ti, o.spessore / 2);
    }
    return angolo > 0 ? angolo : -ti;
  };
  return [allunga(m.p1), allunga(m.p2)];
}

function distanzaPuntoAsse(p: Punto, m: MuroVista): number {
  const ab = diff(m.p2, m.p1);
  const l2 = ab.x * ab.x + ab.y * ab.y;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - m.p1.x) * ab.x + (p.y - m.p1.y) * ab.y) / l2));
  return distanza(p, lungo(m.p1, ab, t));
}

/** Il rettangolo del muro fra le ascisse `da` e `a` (cm dall'inizio dell'asse). */
export function quadMuro(m: MuroVista, da: number, a: number): Punto[] {
  const d = versore(diff(m.p2, m.p1));
  const n = per(sinistra(d), m.spessore / 2);
  const p0 = lungo(m.p1, d, da), p1 = lungo(m.p1, d, a);
  return [somma(p0, n), somma(p1, n), diff(p1, n), diff(p0, n)];
}

export function intervalliAperture(m: MuroVista, aperture: AperturaVista[]): (Intervallo & { apertura: AperturaVista })[] {
  const L = distanza(m.p1, m.p2);
  return aperture
    .filter((a) => a.muroId === m.id)
    .map((a) => ({ da: Math.max(0, a.distanza), a: Math.min(L, a.distanza + a.larghezza), apertura: a }))
    .filter((i) => i.a > i.da)
    .sort((x, y) => x.da - y.da);
}

/** Il muro meno i vani delle aperture: i pezzi pieni, da `-e1` a `L + e2`. */
export function pezziMuro(m: MuroVista, muri: MuroVista[], aperture: AperturaVista[]): Intervallo[] {
  const L = distanza(m.p1, m.p2);
  const [e1, e2] = allungamenti(m, muri);
  const pezzi: Intervallo[] = [];
  let cursore = -e1;
  for (const v of intervalliAperture(m, aperture)) {
    if (v.da > cursore + 1e-6) pezzi.push({ da: cursore, a: v.da });
    cursore = Math.max(cursore, v.a);
  }
  if (L + e2 > cursore + 1e-6) pezzi.push({ da: cursore, a: L + e2 });
  return pezzi;
}

// ─── Costruzione ─────────────────────────────────────────────────────────────

export function costruisciScena(vista: VistaPianta, opzioni: OpzioniScena = {}): Scena {
  const stile = opzioni.stile ?? "tecnico";
  const scala = opzioni.scala ?? 50;
  /** Millimetri stampati → centimetri della pianta. */
  const mm = (v: number) => (v * scala) / 10;
  const presentazione = stile === "presentazione";
  const primitive: Primitiva[] = [];
  const muriPerId = new Map(vista.muri.map((m) => [m.id, m]));

  // Pavimenti (solo presentazione) e contorni dei locali
  for (const l of vista.locali) {
    if (l.contorno.length < 3) continue;
    if (presentazione) {
      const t = texturaPavimento(l);
      primitive.push({ tipo: "poligono", layer: "PAVIMENTI", punti: l.contorno, chiuso: true, riempimento: t.colore });
      for (const [a, b] of t.linee) {
        primitive.push({
          tipo: "poligono", layer: "PAVIMENTI", punti: [a, b], chiuso: false,
          tratto: { colore: t.coloreLinee, spessoreMm: t.spessoreMm },
        });
      }
    }
    primitive.push({
      tipo: "poligono", layer: "LOCALI", punti: l.contorno, chiuso: true,
      tratto: { colore: presentazione ? "#9A9488" : "#9CA3AF", spessoreMm: 0.1 },
    });
  }

  // Arredi e sanitari
  for (const e of vista.elementi) primitive.push(...simboloElemento(e, stile));

  // Muri: prima gli esistenti, poi il giallo, poi il rosso (sopra gli altri).
  // Ogni pezzo si disegna due volte: prima il bordo (spessore doppio), poi il
  // pieno sopra. Il pieno copre la metà interna del bordo e i bordi che cadono
  // dentro un altro muro: resta il contorno dell'unione, senza righe negli angoli.
  const bordi: Poligono[] = [], pieni: Poligono[] = [];
  const ordineStati: StatoCostruttivo[] = ["esistente", "da_demolire", "nuovo"];
  for (const stato of ordineStati) {
    for (const m of vista.muri.filter((x) => x.stato === stato)) {
      const colori = COLORI_STATO[m.stato];
      const riempimento = presentazione && m.stato === "esistente" ? "#2B2B2B" : colori.riempimento;
      for (const p of pezziMuro(m, vista.muri, vista.aperture)) {
        const punti = quadMuro(m, p.da, p.a);
        bordi.push({
          tipo: "poligono", layer: LAYER_STATO[m.stato], punti, chiuso: true,
          tratto: { colore: colori.bordo, spessoreMm: 2 * (m.stato === "esistente" ? 0.35 : 0.25) },
        });
        pieni.push({ tipo: "poligono", layer: LAYER_STATO[m.stato], punti, chiuso: true, riempimento });
      }
    }
  }

  primitive.push(...bordi);
  bordi.length = 0;
  // Vani: un'apertura nuova in un muro che resta è un pezzo di muro da demolire;
  // un'apertura che si chiude è un tamponamento nuovo.
  for (const m of vista.muri) {
    if (m.stato !== "esistente") continue;
    for (const v of intervalliAperture(m, vista.aperture)) {
      const s = v.apertura.stato;
      if (s === "esistente") continue;
      const statoVano: StatoCostruttivo = s === "nuovo" ? "da_demolire" : "nuovo";
      const punti = quadMuro(m, v.da, v.a);
      bordi.push({ tipo: "poligono", layer: LAYER_STATO[statoVano], punti, chiuso: true, tratto: { colore: COLORI_STATO[statoVano].bordo, spessoreMm: 0.5 } });
      pieni.push({ tipo: "poligono", layer: LAYER_STATO[statoVano], punti, chiuso: true, riempimento: COLORI_STATO[statoVano].riempimento });
    }
  }
  primitive.push(...bordi, ...pieni);

  // Aperture
  for (const a of vista.aperture) {
    const m = muriPerId.get(a.muroId);
    if (m) primitive.push(...simboloApertura(a, m, presentazione));
  }

  // Quote
  const formato = (cm: number, origine?: OrigineMisura) => {
    const t = opzioni.unitaQuote === "cm" ? String(Math.round(cm)) : numeroIt(cm / 100);
    return origine === "stimata" ? `~${t}` : t;
  };
  for (const q of vista.quote) {
    const d = versore(diff(q.p2, q.p1));
    const n = sinistra(d);
    const segno = q.scostamento >= 0 ? 1 : -1;
    primitive.push(...quota(q.p1, q.p2, per(n, segno), Math.abs(q.scostamento), q.testo ?? formato(distanza(q.p1, q.p2), q.origine), mm));
  }
  if (opzioni.quoteAutomatiche ?? true) primitive.push(...quoteEsterne(vista, mm, (cm) => formato(cm)));

  // Scritte dei locali: lontano dagli arredi; in un corridoio stretto si girano
  if (opzioni.etichetteLocali ?? true) {
    const puntiDi = (ps: Primitiva[]) => ps.flatMap((x) =>
      x.tipo === "poligono" ? x.punti : x.tipo === "arco" ? puntiArco(x.centro, x.raggio, x.inizio, x.fine, 15) : []);
    const ostacoli = [
      ...vista.elementi.map((e) => riquadroDi(puntiDi(simboloElemento(e, "tecnico")))),
      ...vista.aperture.filter((a) => a.tipo !== "finestra").flatMap((a) => {
        const m = muriPerId.get(a.muroId);
        return m ? [riquadroDi(puntiDi(simboloApertura(a, m, false)))] : [];
      }),
    ];
    for (const l of vista.locali) {
      if (l.contorno.length < 3) continue;
      const stimata = l.origine === "stimata";
      const righe: { testo: string; altezza: number; grassetto?: boolean }[] = [
        { testo: l.nome, altezza: 2.6, grassetto: true },
        { testo: `${numeroIt(l.superficieMq ?? 0)} m²${stimata ? " *" : ""}`, altezza: 2.2 },
      ];
      if (l.altezza) righe.push({ testo: `h ${numeroIt(l.altezza / 100)} m`, altezza: 1.9 });
      const r = riquadroDi(l.contorno);
      const largo = Math.max(...righe.map((x) => larghezzaTesto(x.testo, mm(x.altezza))));
      const alto = righe.reduce((s, x) => s + mm(x.altezza * 1.6), 0);
      // Girata di 90° se non sta in orizzontale e il locale è più alto che largo
      const gira = largo > (r.maxX - r.minX) * 0.75 && r.maxY - r.minY > r.maxX - r.minX;
      const spazio = gira ? r.maxY - r.minY : r.maxX - r.minX;
      const riduci = Math.min(1, (spazio * 0.92) / largo);
      const [bw, bh] = gira ? [alto * riduci, largo * riduci] : [largo * riduci, alto * riduci];
      const c = puntoEtichetta(l.contorno, { ostacoli, larghezza: bw, altezza: bh });
      const versoRighe = gira ? { x: 1, y: 0 } : { x: 0, y: 1 };
      let s = -(alto * riduci) / 2;
      for (const x of righe) {
        const h = mm(x.altezza * 1.6) * riduci;
        primitive.push({
          tipo: "testo", layer: "TESTI", posizione: lungo(c, versoRighe, s + h / 2), testo: x.testo, altezzaMm: x.altezza * riduci,
          allinea: "centro", verticale: "centro", rotazione: gira ? -90 : 0, colore: presentazione ? "#1F2937" : INCHIOSTRO,
          grassetto: x.grassetto,
        });
        s += h;
      }
    }
  }

  for (const t of vista.testi) {
    primitive.push({
      tipo: "testo", layer: "TESTI", posizione: t.posizione, testo: t.testo, altezzaMm: t.altezzaMm ?? 2.5,
      allinea: "centro", verticale: "centro", rotazione: t.rotazione ?? 0, colore: INCHIOSTRO,
    });
  }

  return { primitive, riquadro: riquadroScena(primitive, scala), scala, stile };
}

/** Larghezza stimata di una scritta alta `altezza` (maiuscole): Helvetica, lettere miste. */
export const larghezzaTesto = (testo: string, altezza: number) => testo.length * altezza * 0.7;

/** Il riquadro di tutto ciò che si vede, scritte comprese (larghezza stimata). */
export function riquadroScena(primitive: Primitiva[], scala: number): Riquadro {
  const r = riquadroVuoto();
  const mm = (v: number) => (v * scala) / 10;
  for (const p of primitive) {
    if (p.tipo === "poligono") p.punti.forEach((q) => allarga(r, q));
    else if (p.tipo === "arco") puntiArco(p.centro, p.raggio, p.inizio, p.fine, 5).forEach((q) => allarga(r, q));
    else if (p.tipo === "cerchio") allarga(r, p.centro, p.raggio);
    else {
      const meta = Math.max(larghezzaTesto(p.testo, mm(p.altezzaMm)) / 2, mm(p.altezzaMm));
      allarga(r, p.posizione, meta);
    }
  }
  return r;
}

// ─── Aperture ────────────────────────────────────────────────────────────────

function trattoApertura(a: AperturaVista, presentazione: boolean, spessoreMm: number): Tratto {
  if (a.stato === "nuovo") return { colore: COLORI_STATO.nuovo.riempimento, spessoreMm };
  if (a.stato === "da_demolire") return { colore: "#B89600", spessoreMm, tratteggioMm: [1.2, 0.8] };
  return { colore: presentazione ? "#374151" : INCHIOSTRO, spessoreMm };
}

/** L'anta che gira: la linea dell'anta aperta a 90° e l'arco fino alla battuta. */
function anta(cerniera: Punto, verso: Punto, battuta: Punto, raggio: number, tratto: Tratto, chiaro?: string): Primitiva[] {
  const aperta = lungo(cerniera, verso, raggio);
  const aAperta = Math.atan2(verso.y, verso.x);
  const dirBattuta = versore(diff(battuta, cerniera));
  let aBattuta = Math.atan2(dirBattuta.y, dirBattuta.x);
  while (aBattuta - aAperta > Math.PI) aBattuta -= 2 * Math.PI;
  while (aBattuta - aAperta < -Math.PI) aBattuta += 2 * Math.PI;
  const [inizio, fine] = aAperta < aBattuta ? [aAperta, aBattuta] : [aBattuta, aAperta];
  const out: Primitiva[] = [];
  if (chiaro) {
    out.push({
      tipo: "poligono", layer: "APERTURE", chiuso: true, riempimento: chiaro,
      punti: [cerniera, ...puntiArco(cerniera, raggio, inizio, fine)],
    });
  }
  out.push(
    { tipo: "poligono", layer: "APERTURE", punti: [cerniera, aperta], chiuso: false, tratto: { ...tratto, spessoreMm: tratto.spessoreMm * 1.6 } },
    { tipo: "arco", layer: "APERTURE", centro: cerniera, raggio, inizio, fine, tratto: { ...tratto, spessoreMm: tratto.spessoreMm * 0.7 } },
  );
  return out;
}

export function simboloApertura(a: AperturaVista, m: MuroVista, presentazione: boolean): Primitiva[] {
  const d = versore(diff(m.p2, m.p1));
  const nSin = sinistra(d);
  const latoN = a.lato === "destra" ? per(nSin, -1) : nSin;
  const t = m.spessore;
  const da = a.distanza, aa = a.distanza + a.larghezza;
  const asse = (s: number, off = 0) => somma(lungo(m.p1, d, s), per(latoN, off));
  const tratto = trattoApertura(a, presentazione, 0.18);
  const out: Primitiva[] = [];

  // Le spalle del vano, sottili
  for (const s of [da, aa]) {
    out.push({ tipo: "poligono", layer: "APERTURE", punti: [asse(s, t / 2), asse(s, -t / 2)], chiuso: false, tratto: { ...tratto, spessoreMm: 0.13 } });
  }

  // Varco o vano senza anta: solo le spalle
  if (a.tipo === "varco" || a.manovra === "nessuna") return out;

  if (a.tipo === "porta" && a.manovra === "scorrevole") {
    // L'anta chiusa, sottile, sul lato dove scorre, e la linea del binario
    const s0 = da, s1 = aa;
    const off = t / 2 + 2;
    out.push({
      tipo: "poligono", layer: "APERTURE", chiuso: true, riempimento: presentazione ? "#FFFFFF" : undefined, tratto,
      punti: [asse(Math.min(s0, s1), off), asse(Math.max(s0, s1), off), asse(Math.max(s0, s1), off + 4), asse(Math.min(s0, s1), off + 4)],
    });
    out.push({ tipo: "poligono", layer: "APERTURE", chiuso: false, tratto: { ...tratto, spessoreMm: 0.13 }, punti: [asse(da, off + 9), asse(aa, off + 9)] });
    return out;
  }

  if (a.tipo === "porta") {
    const inizio = a.cerniera !== "fine";
    const cerniera = asse(inizio ? da : aa, t / 2);
    const battuta = asse(inizio ? aa : da, t / 2);
    out.push(...anta(cerniera, latoN, battuta, a.larghezza, tratto, presentazione ? "rgba(255,255,255,0.55)" : undefined));
    return out;
  }

  // Finestra e portafinestra: il telaio nello spessore del muro, il vetro in mezzo
  const telaio = Math.max(4, t / 3);
  out.push({
    tipo: "poligono", layer: "APERTURE", chiuso: true,
    punti: [asse(da, telaio / 2), asse(aa, telaio / 2), asse(aa, -telaio / 2), asse(da, -telaio / 2)],
    riempimento: presentazione ? "#CFE8F5" : "#FFFFFF", tratto,
  });
  out.push({ tipo: "poligono", layer: "APERTURE", punti: [asse(da, 0), asse(aa, 0)], chiuso: false, tratto: { ...tratto, spessoreMm: 0.13 } });
  // Il davanzale sul filo esterno (il lato opposto a quello dove si apre)
  if (a.tipo === "finestra") {
    out.push({ tipo: "poligono", layer: "APERTURE", punti: [asse(da - 3, -t / 2), asse(aa + 3, -t / 2)], chiuso: false, tratto });
  }
  if (a.tipo === "portafinestra" && a.manovra !== "scorrevole") {
    const ante = a.ante ?? 2;
    const faccia = (s: number) => asse(s, t / 2);
    const tr = { ...tratto, tratteggioMm: undefined as number[] | undefined };
    if (ante === 2) {
      const meta = a.larghezza / 2;
      out.push(...anta(faccia(da), latoN, faccia(da + meta), meta, tr), ...anta(faccia(aa), latoN, faccia(aa - meta), meta, tr));
    } else {
      out.push(...anta(faccia(da), latoN, faccia(aa), a.larghezza, tr));
    }
  }
  return out;
}

// ─── Quote ───────────────────────────────────────────────────────────────────

/**
 * Una quota: linee di richiamo, linea di quota con i tagli a 45° e il numero
 * sopra. `fuori` è il versore verso cui si sposta la linea di quota.
 */
export function quota(a: Punto, b: Punto, fuori: Punto, distanzaCm: number, testo: string, mm: (v: number) => number): Primitiva[] {
  const tratto: Tratto = { colore: GRIGIO_QUOTE, spessoreMm: 0.13 };
  const a1 = somma(a, per(fuori, distanzaCm)), b1 = somma(b, per(fuori, distanzaCm));
  const staccoInizio = Math.min(mm(1), distanzaCm * 0.3);
  const d = versore(diff(b, a));
  const obliquo = versore(somma(d, fuori));
  const taglio = (p: Punto): Primitiva => ({
    tipo: "poligono", layer: "QUOTE", chiuso: false, tratto: { ...tratto, spessoreMm: 0.3 },
    punti: [somma(p, per(obliquo, -mm(1.1))), somma(p, per(obliquo, mm(1.1)))],
  });
  let rotazione = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (rotazione > 89.5) rotazione -= 180;
  if (rotazione <= -90.5) rotazione += 180;
  const altezza = 2;
  const centro = somma(per(somma(a1, b1), 0.5), per(fuori, mm(0.9 + altezza / 2)));
  return [
    { tipo: "poligono", layer: "QUOTE", chiuso: false, tratto, punti: [somma(a, per(fuori, staccoInizio)), somma(a1, per(fuori, mm(1.5)))] },
    { tipo: "poligono", layer: "QUOTE", chiuso: false, tratto, punti: [somma(b, per(fuori, staccoInizio)), somma(b1, per(fuori, mm(1.5)))] },
    { tipo: "poligono", layer: "QUOTE", chiuso: false, tratto, punti: [somma(a1, per(d, -mm(1.5))), somma(b1, per(d, mm(1.5)))] },
    taglio(a1),
    taglio(b1),
    {
      tipo: "testo", layer: "QUOTE", posizione: centro, testo, altezzaMm: altezza, allinea: "centro", verticale: "centro",
      rotazione, colore: GRIGIO_QUOTE,
    },
  ];
}

type Lato = "nord" | "sud" | "ovest" | "est";

/**
 * Le quote dei lati esterni, come le fa il geometra: una catena con i vani
 * delle aperture e, più fuori, la misura totale. Valgono per i muri che stanno
 * sul bordo del riquadro della pianta (le piante a L hanno anche le quote del
 * modello).
 */
export function quoteEsterne(vista: VistaPianta, mm: (v: number) => number, formato: (cm: number) => string): Primitiva[] {
  if (vista.muri.length === 0) return [];
  const bordo = riquadroVuoto();
  const pezzi = new Map<MuroVista, Punto[][]>();
  for (const m of vista.muri) {
    const q = pezziMuro(m, vista.muri, []).map((p) => quadMuro(m, p.da, p.a));
    pezzi.set(m, q);
    q.flat().forEach((p) => allarga(bordo, p));
  }
  const out: Primitiva[] = [];
  const lati: { lato: Lato; orizzontale: boolean; valore: number; fuori: Punto }[] = [
    { lato: "nord", orizzontale: true, valore: bordo.minY, fuori: { x: 0, y: -1 } },
    { lato: "sud", orizzontale: true, valore: bordo.maxY, fuori: { x: 0, y: 1 } },
    { lato: "ovest", orizzontale: false, valore: bordo.minX, fuori: { x: -1, y: 0 } },
    { lato: "est", orizzontale: false, valore: bordo.maxX, fuori: { x: 1, y: 0 } },
  ];
  for (const s of lati) {
    const sulLato = vista.muri.filter((m) => {
      const d = versore(diff(m.p2, m.p1));
      const parallelo = s.orizzontale ? Math.abs(d.y) < 1e-6 : Math.abs(d.x) < 1e-6;
      if (!parallelo) return false;
      const filo = (s.orizzontale ? m.p1.y : m.p1.x) + (s.lato === "nord" || s.lato === "ovest" ? -1 : 1) * (m.spessore / 2);
      return Math.abs(filo - s.valore) < 1;
    });
    if (sulLato.length === 0) continue;
    const coord = (p: Punto) => (s.orizzontale ? p.x : p.y);
    const valori: number[] = [];
    for (const m of sulLato) {
      for (const q of pezzi.get(m) ?? []) q.forEach((p) => valori.push(coord(p)));
      const d = versore(diff(m.p2, m.p1));
      for (const v of intervalliAperture(m, vista.aperture)) {
        valori.push(coord(lungo(m.p1, d, v.da)), coord(lungo(m.p1, d, v.a)));
      }
    }
    valori.sort((x, y) => x - y);
    const unici = valori.filter((v, i) => i === 0 || v - valori[i - 1] > 0.5);
    if (unici.length < 2) continue;
    const punto = (v: number): Punto => (s.orizzontale ? { x: v, y: s.valore } : { x: s.valore, y: v });
    // Una catena che misura lo stesso tratto di una quota del modello è doppia: resta quella del modello.
    const giaNelModello = (a: number, b: number) => vista.quote.some((q) => {
      const parallela = s.orizzontale ? Math.abs(q.p1.y - q.p2.y) < 1 : Math.abs(q.p1.x - q.p2.x) < 1;
      const [qa, qb] = [coord(q.p1), coord(q.p2)].sort((x, y) => x - y);
      const sulLato = Math.abs((s.orizzontale ? q.p1.y : q.p1.x) - s.valore) < 60;
      return parallela && sulLato && Math.abs(qa - a) < 2 && Math.abs(qb - b) < 2;
    });
    const primaFila = mm(7);
    if (unici.length > 2) {
      for (let i = 0; i < unici.length - 1; i++) {
        out.push(...quota(punto(unici[i]), punto(unici[i + 1]), s.fuori, primaFila, formato(unici[i + 1] - unici[i]), mm));
      }
    }
    const totale = unici[unici.length - 1] - unici[0];
    const distanzaTotale = unici.length > 2 ? primaFila + mm(7) : primaFila;
    if (!giaNelModello(unici[0], unici[unici.length - 1])) {
      out.push(...quota(punto(unici[0]), punto(unici[unici.length - 1]), s.fuori, distanzaTotale, formato(totale), mm));
    }
  }
  return out;
}
