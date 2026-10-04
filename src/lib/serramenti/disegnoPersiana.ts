/**
 * Il disegno di una persiana (o di uno scuro), generato da misure, configurazione, tipo, lamelle e
 * forma. Si vede da fuori, sempre chiusa.
 *
 * Lo stile di serie è quello delle schede del listino: disegno tecnico piatto, grigi chiari, lamelle a
 * coppie di fili, una piccola cappa in alto, i simboli di apertura in rosso. Si colora con la finitura
 * scelta (un RAL, un legno). Lo stile «realistico» ha volume, ombre, parete e davanzale.
 *
 * Configurazioni di apertura (le stesse delle schede):
 *  - a battente: 1, 2, 3 o 4 ante; asimmetriche (principale a destra o a sinistra); 3 ante 1+2 o 2+1; 4 ante 2+2;
 *  - a libro: 2, 3 o 4 ante incernierate fra loro;
 *  - a pacchetto: 3 o 4 ante che si ripiegano a pacchetto a destra o a sinistra;
 *  - scorrevole: 1 anta (destra o sinistra), 2 ante, 2 ante sovrapposte;
 *  - ad angolo: 2 o 3 ante attorno a uno spigolo;
 *  - con sopraluce di vetro fisso, o con pannello fisso di vetro (laterale o superiore).
 *
 * Tipi: veneziana (lamelle FISSE, con la fessura di 0, 10 o 16 mm, oppure ORIENTABILI con l'asta di comando),
 * gelosia, scuro pieno, scuro a cornice, avvolgibile, griglia di sicurezza, brise-soleil.
 *
 * Forme: rettangolare, arco, trapezio, lunetta, tonda, triangolo, ogiva, con una o due ante, per veneziana,
 * gelosia e scuri.
 *
 * Restano disponibili, anche se non servono al preventivo, le ante aperte a 45° e a 90°.
 */
import {
  contornoForma,
  cornice,
  frecciaArco,
  altezzeTrapezio,
  simboliDaAngoli,
  specchiaScena,
  type DatiSagoma,
  type Forma,
  type FormaSerramento,
  type Punto,
  type Quota,
  type ScenaSerramento,
} from "./disegnoSerramento";
import { area, dentro, estremi, estremiVerticali, fasciaOrizzontale, fasciaVerticale } from "./geometriaConvessa";

export type TipoPersiana =
  | "veneziana" | "gelosia" | "scuro_pieno" | "scuro_cornice"
  | "avvolgibile" | "a_libro" | "griglia" | "brise_soleil"
  | "scorrevole" | "pacchetto" | "angolo";
export type StatoPersiana = "chiusa" | "aperta_45" | "aperta_90" | "anta_singola_aperta";

export interface PersianaDisegno {
  larghezzaMm: number;
  altezzaMm: number;
  /** Numero di ante, da 1 a 4 (a libro 2–4; pacchetto 3–4; scorrevole 1–2; angolo 2–3; sagomata 1–2). */
  ante: number;
  tipo: TipoPersiana;
  /** Solo veneziana: lamelle fisse o orientabili. */
  lamelle?: "fisse" | "orientabili";
  /** Lamelle fisse: la fessura fra una lamella e l'altra, in mm (0, 10 o 16). */
  fessuraMm?: 0 | 10 | 16;
  /** Solo lamelle orientabili: 0 = chiuse, 100 = tutte aperte. */
  aperturaLamellePct?: number;
  stato?: StatoPersiana;
  /** Peso delle ante, ad esempio [0.42, 0.58] per due ante asimmetriche. Non indicato: uguali. */
  proporzioni?: number[];
  /** Il lato delle cerniere di ogni anta (vista da fuori). Non indicato: le ante esterne sulle cerniere esterne. */
  cerniere?: Array<"sx" | "dx">;
  /** Con una sola anta: il lato delle cerniere. */
  lato?: "dx" | "sx";
  /** Aletta del telaio in mm; assente o 0 = nessuna. */
  alettaMm?: number;
  /** Solo avvolgibile: di quanto è abbassata (0 = tutta su, 100 = tutta giù). Di serie 100. */
  abbassataPct?: number;
  /** Una fascia di vetro fisso sopra le ante. */
  sopraluceMm?: number;
  /** Un pannello di vetro fisso a lato delle ante. */
  pannelloFisso?: { lato: "dx" | "sx"; larghezzaMm: number };
  /** Scorrevole e pacchetto: il verso in cui scorre (e dove sta la freccia). */
  direzione?: "dx" | "sx";
  /** Scorrevole a 2 ante: le ante si sovrappongono. */
  sovrapposte?: boolean;
  /** Forma del vano; arco e trapezio e le altre sagome come per i serramenti. */
  forma?: FormaSerramento;
  frecciaMm?: number;
  altezzaMinoreMm?: number;
  latoMinore?: "dx" | "sx";
  /**
   * La vista. «esterna» (di serie): come nelle schede, le ante vengono verso chi guarda. «interna»: vista da dentro,
   * specchiata, con la maniglia; la persiana si spinge da dentro, quindi i simboli di apertura sono tratteggiati.
   */
  vista?: "esterna" | "interna";
  /**
   * L'apertura vista da dentro: «dx» = cerniere a destra (la maniglia a sinistra). Con una sola anta sceglie il lato delle
   * cerniere; con due ante che si incontrano sceglie l'anta principale (quella con la maniglia): a destra o a sinistra.
   */
  apertura?: "dx" | "sx";
  /** Da dentro: da che parte sta la maniglia quando due ante si incontrano (porta la maniglia l'anta di quel lato). Di serie a destra. */
  maniglia?: "dx" | "sx";
  /** «scheda»: disegno tecnico piatto (di serie). «realistico»: con volume e ombre. */
  stile?: "scheda" | "realistico";
  /** La parete attorno e il davanzale sotto. Di serie sì nello stile realistico, no nella scheda. */
  contesto?: boolean;
}

const COS_45 = Math.SQRT1_2;
const TIPI_SAGOMABILI: TipoPersiana[] = ["veneziana", "gelosia", "scuro_pieno", "scuro_cornice"];
const SENZA_CAPPA: TipoPersiana[] = ["avvolgibile", "angolo"];

/** La parete attorno al vano e il davanzale sotto: danno la scala e fanno sembrare la persiana montata. */
function contestoParete(W: number, H: number, aletta: number): { forme: Forma[]; sfondo: number } {
  const m = Math.max(140, W * 0.12);
  const forme: Forma[] = [
    { kind: "rect", ruolo: "parete", x: -m, y: -m, w: W + 2 * m, h: H + 2 * m },
    { kind: "rect", ruolo: "davanzale", x: -aletta - 50, y: H + aletta, w: W + 2 * aletta + 100, h: 36 },
  ];
  return { forme, sfondo: m };
}

export function disegnaPersiana(dIn: PersianaDisegno): ScenaSerramento {
  // L'apertura (da dentro) si traduce nel lato delle cerniere (da fuori: specchiato) e nell'anta con la maniglia.
  const scorre = dIn.tipo === "scorrevole" || dIn.tipo === "pacchetto";
  const d: PersianaDisegno = dIn.apertura
    ? {
        ...dIn,
        maniglia: dIn.maniglia ?? dIn.apertura,
        lato: dIn.ante === 1 ? (dIn.apertura === "dx" ? "sx" : "dx") : dIn.lato,
        // Scorrevole e pacchetto: «a destra» da dentro è il verso opposto nel disegno da fuori.
        direzione: scorre ? (dIn.apertura === "dx" ? "sx" : "dx") : dIn.direzione,
      }
    : dIn;
  const W = Math.max(300, d.larghezzaMm);
  const H = Math.max(300, d.altezzaMm);
  const aletta = Math.max(0, d.alettaMm ?? 0);
  const scheda = (d.stile ?? "scheda") === "scheda";
  const contesto = (d.contesto ?? !scheda) ? contestoParete(W, H, aletta) : { forme: [] as Forma[], sfondo: 0 };
  const sagomata = !!d.forma && d.forma !== "rettangolare" && TIPI_SAGOMABILI.includes(d.tipo);

  let scena: ScenaSerramento;
  if (d.tipo === "avvolgibile") scena = persianaAvvolgibile(d, W, H);
  else if (d.tipo === "griglia") scena = persianaGriglia(d, W, H, aletta);
  else if (d.tipo === "brise_soleil") scena = persianaBrise(d, W, H, aletta);
  else if (d.tipo === "scorrevole") scena = persianaScorrevole(d, W, H, aletta, scheda);
  else if (d.tipo === "pacchetto") scena = persianaPacchetto(d, W, H, aletta, scheda);
  else if (d.tipo === "angolo") scena = persianaAngolo(d, W, H, scheda);
  else if (sagomata) scena = persianaSagomata(d, W, H);
  else scena = persianaConAnte(d, W, H, aletta, scheda);

  // Nelle schede c'è la piccola cappa sopra il vano (non sulle sagome, sull'avvolgibile e sull'angolo).
  const cappa: Forma[] =
    scheda && !sagomata && !SENZA_CAPPA.includes(d.tipo)
      ? [{ kind: "rect", ruolo: "cappello", x: -aletta - 30, y: -aletta - 34, w: W + 2 * aletta + 60, h: 34 }]
      : [];
  const risultato: ScenaSerramento = { ...scena, forme: [...contesto.forme, ...cappa, ...scena.forme], sfondo: contesto.sfondo, stile: scheda ? "scheda" : undefined };
  // Da dentro: tutto specchiato; le cerniere stanno fuori e non si vedono, la maniglia sì.
  return d.vista === "interna" ? specchiaScena({ ...risultato, forme: risultato.forme.filter((f) => f.ruolo !== "cerniera") }, true) : risultato;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pezzi comuni

const quoteBase = (W: number, H: number): Quota[] => [
  { orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)) },
  { orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) },
];

function telaioConAletta(W: number, H: number, aletta: number, tel: number): Forma[] {
  const forme: Forma[] = [];
  if (aletta > 0) {
    forme.push({
      kind: "sagoma",
      ruolo: "aletta",
      punti: [[-aletta, -aletta], [W + aletta, -aletta], [W + aletta, H + aletta], [-aletta, H + aletta]],
      buco: [[0, 0], [W, 0], [W, H], [0, H]],
    });
  }
  forme.push(...cornice(0, 0, W, H, tel, "telaio"));
  return forme;
}

/** Il passo delle lamelle: più fitto sulla gelosia; nelle schede un po' più largo (meno righe). */
const passoLamelle = (d: PersianaDisegno, scheda: boolean) => (d.tipo === "gelosia" ? (scheda ? 24 : 18) : scheda ? 46 : 36);

/** Lo spessore (l'altezza) di una lamella: le fisse lasciano la fessura, le orientabili si aprono. */
function spessoreLamella(d: PersianaDisegno, passo: number): number {
  if (d.lamelle === "orientabili") {
    const aperte = Math.min(100, Math.max(0, d.aperturaLamellePct ?? 0)) / 100;
    return Math.max(passo * 0.18, passo * (1 - 0.82 * aperte));
  }
  if (d.tipo === "gelosia") return passo * 0.8;
  const fessura = d.fessuraMm ?? 10;
  return passo - (fessura > 0 ? fessura * 0.45 : 2);
}

/** Un'anta chiusa: cornice, campo e riempimento (lamelle, doghe o pannello). Ritorna anche gli angoli del campo per i simboli. */
function anta(forme: Forma[], d: PersianaDisegno, scheda: boolean, x: number, y: number, w: number, h: number) {
  const t = Math.min(scheda ? 34 : 40, w * (scheda ? 0.12 : 0.22));
  forme.push(...cornice(x, y, w, h, t, "anta"));
  const ix = x + t, iy = y + t, iw = w - 2 * t, ih = h - 2 * t;
  forme.push({ kind: "rect", ruolo: "campo", x: ix, y: iy, w: iw, h: ih });
  const passo = passoLamelle(d, scheda);
  const conLamelle = d.tipo === "veneziana" || d.tipo === "gelosia" || d.tipo === "a_libro" || d.tipo === "scorrevole" || d.tipo === "pacchetto";
  if (conLamelle) {
    const spessore = spessoreLamella(d, passo);
    const quante = Math.max(1, Math.floor(ih / passo));
    const margine = (ih - quante * passo) / 2;
    for (let k = 0; k < quante; k++) {
      forme.push({ kind: "rect", ruolo: "lamella", x: ix, y: iy + margine + k * passo + (passo - spessore) / 2, w: iw, h: spessore });
    }
    if (d.lamelle === "orientabili" && d.tipo !== "gelosia") forme.push({ kind: "rect", ruolo: "asta", x: ix + iw / 2 - 5, y: iy, w: 10, h: ih });
  } else if (d.tipo === "scuro_pieno") {
    forme.push({ kind: "rect", ruolo: "pannello", x: ix, y: iy, w: iw, h: ih });
    const doghe = Math.max(1, Math.round(iw / 110));
    for (let j = 1; j < doghe; j++) forme.push({ kind: "poly", ruolo: "pannelloLinea", punti: [[ix + (iw * j) / doghe, iy], [ix + (iw * j) / doghe, iy + ih]] });
  } else if (d.tipo === "scuro_cornice") {
    forme.push({ kind: "rect", ruolo: "pannello", x: ix, y: iy, w: iw, h: ih });
    forme.push({ kind: "rect", ruolo: "pannelloRilievo", x: ix + iw * 0.12, y: iy + ih * 0.08, w: iw * 0.76, h: ih * 0.84 });
  }
  return { tl: [ix, iy] as Punto, tr: [ix + iw, iy] as Punto, br: [ix + iw, iy + ih] as Punto, bl: [ix, iy + ih] as Punto, cima: [ix + iw / 2, iy] as Punto };
}

/** Le cerniere lungo un bordo: nelle schede piccoli tasselli a cavallo del bordo, nello stile realistico staffe con i ribattini. */
function cerniereAlBordo(forme: Forma[], scheda: boolean, xBordo: number, lato: "sx" | "dx", larghezzaAnta: number, y: number, h: number) {
  const qs = h > 1800 ? [0.1, 0.5, 0.9] : [0.12, 0.88];
  for (const q of qs) {
    if (scheda) forme.push({ kind: "rect", ruolo: "cerniera", x: xBordo - 6, y: y + h * q - 13, w: 12, h: 26 });
    else {
      const wc = Math.min(larghezzaAnta * 0.32, 150);
      forme.push({ kind: "rect", ruolo: "cerniera", x: lato === "sx" ? xBordo : xBordo - wc, y: y + h * q - 12, w: wc, h: 24 });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ante a battente e a libro (vano rettangolare, con sopraluce o pannello fisso)

function persianaConAnte(d: PersianaDisegno, W: number, H: number, aletta: number, scheda: boolean): ScenaSerramento {
  const aLibro = d.tipo === "a_libro";
  const n = aLibro ? (d.ante <= 2 ? 2 : d.ante === 3 ? 3 : 4) : Math.min(4, Math.max(1, Math.round(d.ante)));
  const stato = d.stato ?? "chiusa";
  const tel = Math.min(36, Math.min(W, H) * 0.06);
  const forme: Forma[] = telaioConAletta(W, H, aletta, tel);

  const x0 = tel, y0 = tel, w0 = W - 2 * tel, h0 = H - 2 * tel;
  const barra = tel * 0.8;

  // Il vetro fisso: sopra le ante e/o a lato.
  let xL = x0, wL = w0, yL = y0, hL = h0;
  const sopraluce = d.sopraluceMm && d.sopraluceMm > 0 ? Math.min(d.sopraluceMm, h0 * 0.5) : 0;
  if (sopraluce > 0) {
    forme.push({ kind: "rect", ruolo: "vetro", x: x0, y: y0, w: w0, h: sopraluce });
    forme.push({ kind: "rect", ruolo: "telaio", x: x0, y: y0 + sopraluce, w: w0, h: barra });
    yL = y0 + sopraluce + barra;
    hL = h0 - sopraluce - barra;
  }
  const pf = d.pannelloFisso && d.pannelloFisso.larghezzaMm > 0 ? { lato: d.pannelloFisso.lato, w: Math.min(d.pannelloFisso.larghezzaMm, w0 * 0.6) } : null;
  if (pf) {
    const vx = pf.lato === "dx" ? x0 + w0 - pf.w : x0;
    forme.push({ kind: "rect", ruolo: "vetro", x: vx, y: yL, w: pf.w, h: hL });
    forme.push({ kind: "rect", ruolo: "telaio", x: pf.lato === "dx" ? vx - barra : vx + pf.w, y: yL, w: barra, h: hL });
    wL = w0 - pf.w - barra;
    xL = pf.lato === "dx" ? x0 : x0 + pf.w + barra;
  }

  const pesi = d.proporzioni && d.proporzioni.length === n && d.proporzioni.every((p) => p > 0) ? d.proporzioni : Array.from({ length: n }, () => 1);
  const somma = pesi.reduce((a, b) => a + b, 0);
  const larghezze = pesi.map((p) => (wL * p) / somma);
  const xs = larghezze.map((_, i) => xL + larghezze.slice(0, i).reduce((a, b) => a + b, 0));

  // Il lato delle cerniere di ogni anta.
  const lati: Array<"sx" | "dx"> =
    d.cerniere && d.cerniere.length === n
      ? d.cerniere
      : n === 1
        ? [d.lato ?? "sx"]
        : aLibro
          ? Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "sx" : "dx"))
          : Array.from({ length: n }, (_, i) => (i < Math.ceil(n / 2) ? "sx" : "dx"));
  // Dove sta il pacchetto di una coppia a libro (le prime due ante, poi le altre).
  const latoPacchetto = (i: number): "sx" | "dx" => (n === 2 ? (d.lato ?? "sx") : Math.floor(i / 2) === 0 ? "sx" : "dx");

  const modo = (i: number): "chiusa" | "taglio" | "scorcio" => {
    if (stato === "chiusa") return "chiusa";
    if (aLibro) return stato === "anta_singola_aperta" ? (i < 2 ? "taglio" : "chiusa") : "taglio";
    if (stato === "aperta_90") return "taglio";
    if (stato === "aperta_45") return "scorcio";
    return i === 0 ? "taglio" : "chiusa";
  };
  const modi = Array.from({ length: n }, (_, i) => modo(i));
  const tutteAperte = modi.every((m) => m !== "chiusa");

  // Sfondo: con le ante chiuse il gioco fra le ante e il telaio, dove le ante sono aperte la finestra.
  if (tutteAperte) {
    forme.push({ kind: "rect", ruolo: "vetro", x: xL, y: yL, w: wL, h: hL });
  } else {
    forme.push({ kind: "rect", ruolo: "fondo", x: xL, y: yL, w: wL, h: hL });
    modi.forEach((m, i) => {
      if (m !== "chiusa") forme.push({ kind: "rect", ruolo: "vetro", x: xs[i], y: yL, w: larghezze[i], h: hL });
    });
  }

  const passo = passoLamelle(d, scheda);
  const conLamelle = d.tipo === "veneziana" || d.tipo === "gelosia" || aLibro;
  let fuori = 0; // quanto le ante di taglio escono dal vano

  const strisciaDiTaglio = (sx: number, ts: number, spostaY = 0) => {
    forme.push({ kind: "rect", ruolo: "anta", x: sx, y: yL - 6 + spostaY, w: ts, h: hL + 12 });
    if (conLamelle) {
      const quante = Math.floor(hL / passo);
      for (let k = 1; k < quante; k++) forme.push({ kind: "poly", ruolo: "lamellaLinea", punti: [[sx + 6, yL + spostaY + k * passo], [sx + ts - 6, yL + spostaY + k * passo]] });
    }
  };
  const anteDiTaglio = (i: number, x: number, w: number) => {
    const ts = 46;
    if (aLibro) {
      if (i % 2 === 1) return;
      const base = latoPacchetto(i) === "sx" ? -aletta - 2 * ts - 6 : W + aletta + 6;
      strisciaDiTaglio(base, ts);
      if (i + 1 < n) strisciaDiTaglio(base + ts + 2, ts, 10);
      fuori = Math.max(fuori, 2 * ts + 8);
      return;
    }
    const aSinistra = lati[i] === "sx";
    const esterno = aSinistra ? i === 0 : i === n - 1;
    let sx: number;
    if (esterno) {
      sx = aSinistra ? -aletta - ts : W + aletta;
      fuori = Math.max(fuori, ts);
    } else {
      sx = aSinistra ? x - ts / 2 : x + w - ts / 2;
    }
    strisciaDiTaglio(sx, ts);
  };
  const anteDiScorcio = (x: number, w: number, aSinistra: boolean) => {
    const dir = aSinistra ? 1 : -1;
    const xc = aSinistra ? x : x + w;
    const xl = xc + dir * w * COS_45;
    const yc = yL + hL / 2;
    const kh = 1.06;
    const cT: Punto = [xc, yL], cB: Punto = [xc, yL + hL];
    const lT: Punto = [xl, yc - (hL * kh) / 2], lB: Punto = [xl, yc + (hL * kh) / 2];
    forme.push({ kind: "sagoma", ruolo: "anta", punti: [cT, lT, lB, cB] });
    const lerp = (a: Punto, b: Punto, f: number): Punto => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    if (conLamelle) {
      const quante = Math.floor(hL / passo);
      for (let k = 1; k < quante; k++) forme.push({ kind: "poly", ruolo: "lamellaLinea", punti: [lerp(cT, cB, k / quante), lerp(lT, lB, k / quante)] });
    } else {
      const doghe = Math.max(1, Math.round((w * COS_45) / 110));
      for (let j = 1; j < doghe; j++) forme.push({ kind: "poly", ruolo: "pannelloLinea", punti: [lerp(cT, lT, j / doghe), lerp(cB, lB, j / doghe)] });
      if (d.tipo === "scuro_cornice") {
        const pt = (g: number, f: number): Punto => lerp(lerp(cT, lT, g), lerp(cB, lB, g), f);
        forme.push({ kind: "sagoma", ruolo: "pannelloRilievo", punti: [pt(0.14, 0.08), pt(0.86, 0.08), pt(0.86, 0.92), pt(0.14, 0.92)] });
      }
    }
  };

  // La maniglia (da dentro): una sola quando due ante si incontrano, sull'anta del lato scelto; da sola sull'anta senza compagna.
  const conManiglia = Array.from({ length: n }, () => false);
  for (let i = 0; i < n; ) {
    if (lati[i] === "sx" && i + 1 < n && lati[i + 1] === "dx") {
      // Da dentro la vista è specchiata: la maniglia «a destra» sta sull'anta che da fuori è a sinistra.
      conManiglia[(d.maniglia ?? "dx") === "dx" ? i : i + 1] = true;
      i += 2;
    } else {
      conManiglia[i] = true;
      i += 1;
    }
  }

  const simboli: Forma[] = [];
  for (let i = 0; i < n; i++) {
    const m = modi[i];
    const aSinistra = lati[i] === "sx";
    if (m === "chiusa") {
      const c = anta(forme, d, scheda, xs[i], yL, larghezze[i], hL);
      // Il simbolo di apertura: nelle schede ogni anta ha il suo triangolo rosso.
      if (scheda) simboli.push(...simboliDaAngoli({ tipo: "battente", lato: lati[i] }, { tl: c.tl, tr: c.tr, br: c.br, bl: c.bl }, c.cima, d.vista === "interna"));
      if (d.vista === "interna" && !aLibro && conManiglia[i]) {
        const bordoLibero = lati[i] === "sx" ? xs[i] + larghezze[i] : xs[i];
        const cx = bordoLibero + (lati[i] === "sx" ? -1 : 1) * Math.min(46, larghezze[i] * 0.18);
        const hm = Math.min(230, hL * 0.17);
        forme.push({ kind: "rect", ruolo: "maniglia", x: cx - 15, y: yL + hL * 0.5 - hm / 2, w: 30, h: hm });
      }
      if (!aLibro) cerniereAlBordo(forme, scheda, aSinistra ? xs[i] : xs[i] + larghezze[i], lati[i], larghezze[i], yL, hL);
    } else if (m === "taglio") {
      anteDiTaglio(i, xs[i], larghezze[i]);
    } else {
      anteDiScorcio(xs[i], larghezze[i], aSinistra);
      cerniereAlBordo(forme, scheda, aSinistra ? xs[i] : xs[i] + larghezze[i], lati[i], larghezze[i], yL, hL);
    }
  }
  if (aLibro) {
    // A libro: cerniere ai due estremi e dove le ante si incontrano a coppie.
    const chiusa = (i: number) => modi[i] === "chiusa";
    if (chiusa(0)) cerniereAlBordo(forme, scheda, xs[0], "sx", larghezze[0], yL, hL);
    if (chiusa(n - 1)) cerniereAlBordo(forme, scheda, xs[n - 1] + larghezze[n - 1], "dx", larghezze[n - 1], yL, hL);
    for (let i = 0; i + 1 < n; i += 2) if (chiusa(i) && chiusa(i + 1)) cerniereAlBordo(forme, scheda, xs[i] + larghezze[i], "dx", larghezze[i], yL, hL);
  }
  forme.push(...simboli);

  const perAnta = !!d.proporzioni && d.proporzioni.length === n && n > 1;
  const quote = quoteBase(W, H);
  if (perAnta) {
    quote[0] = { ...quote[0], livello: 1 };
    larghezze.forEach((l, i) => quote.push({ orientamento: "h", lato: "sotto", da: xs[i], a: xs[i] + l, testo: String(Math.round(l)), livello: 0 }));
  }
  return { larghezza: W, altezza: H, forme, quote, sporgenza: aletta + fuori };
}

// ---------------------------------------------------------------------------------------------------------------------
// Scorrevole, a pacchetto, ad angolo

function persianaScorrevole(d: PersianaDisegno, W: number, H: number, aletta: number, scheda: boolean): ScenaSerramento {
  const tel = Math.min(36, Math.min(W, H) * 0.06);
  const forme: Forma[] = telaioConAletta(W, H, aletta, tel);
  const x0 = tel, y0 = tel, w0 = W - 2 * tel, h0 = H - 2 * tel;
  const dir = d.direzione ?? "dx";
  const n = d.ante >= 2 ? 2 : 1;
  const bin = 12;
  forme.push({ kind: "rect", ruolo: "vetro", x: x0, y: y0, w: w0, h: h0 });
  forme.push({ kind: "rect", ruolo: "binario", x: x0, y: y0, w: w0, h: bin });
  forme.push({ kind: "rect", ruolo: "binario", x: x0, y: y0 + h0 - bin, w: w0, h: bin });
  const ya = y0 + bin, ha = h0 - 2 * bin;
  const freccia = (c: { tl: Punto; tr: Punto; br: Punto; bl: Punto; cima: Punto }): Forma[] =>
    scheda ? simboliDaAngoli({ tipo: "scorrevole", lato: dir }, { tl: c.tl, tr: c.tr, br: c.br, bl: c.bl }, c.cima, false) : [];

  if (n === 2) {
    const sovrapp = d.sovrapposte ? w0 * 0.07 : 0;
    const w = (w0 + sovrapp) / 2;
    // L'anta davanti sta dal lato verso cui scorre; quella dietro dall'altro.
    const xDietro = dir === "dx" ? x0 : x0 + w0 - w;
    const xDavanti = dir === "dx" ? x0 + w0 - w : x0;
    anta(forme, d, scheda, xDietro, ya, w, ha);
    const c = anta(forme, d, scheda, xDavanti, ya, w, ha);
    forme.push(...freccia(c));
  } else {
    const w = w0 * 0.6;
    const x = dir === "dx" ? x0 : x0 + w0 - w;
    const c = anta(forme, d, scheda, x, ya, w, ha);
    forme.push(...freccia(c));
  }
  return { larghezza: W, altezza: H, forme, quote: quoteBase(W, H), sporgenza: aletta };
}

function persianaPacchetto(d: PersianaDisegno, W: number, H: number, aletta: number, scheda: boolean): ScenaSerramento {
  const tel = Math.min(36, Math.min(W, H) * 0.06);
  const forme: Forma[] = telaioConAletta(W, H, aletta, tel);
  const x0 = tel, y0 = tel, w0 = W - 2 * tel, h0 = H - 2 * tel;
  const dir = d.direzione ?? "dx";
  const n = d.ante >= 4 ? 4 : 3;
  const strisce = n - 1;
  const sw = Math.max(26, w0 * 0.045);
  forme.push({ kind: "rect", ruolo: "vetro", x: x0, y: y0, w: w0, h: h0 });
  const pacco = strisce * sw;
  // Il pacchetto delle ante ripiegate sta dal lato opposto a dove scorre l'anta grande.
  const xPacco = dir === "dx" ? x0 : x0 + w0 - pacco;
  for (let k = 0; k < strisce; k++) {
    const x = xPacco + k * sw;
    forme.push({ kind: "rect", ruolo: "anta", x, y: y0, w: sw, h: h0 });
    forme.push({ kind: "poly", ruolo: "pannelloLinea", punti: [[x + sw / 2, y0 + 8], [x + sw / 2, y0 + h0 - 8]] });
  }
  const xGrande = dir === "dx" ? x0 + pacco : x0;
  const c = anta(forme, d, scheda, xGrande, y0, w0 - pacco, h0);
  if (scheda) forme.push(...simboliDaAngoli({ tipo: "scorrevole", lato: dir }, { tl: c.tl, tr: c.tr, br: c.br, bl: c.bl }, c.cima, false));
  return { larghezza: W, altezza: H, forme, quote: quoteBase(W, H), sporgenza: aletta };
}

/** Due o tre ante attorno a uno spigolo: in prospettiva, più basse verso lo spigolo. */
function persianaAngolo(d: PersianaDisegno, W: number, H: number, scheda: boolean): ScenaSerramento {
  const n = d.ante >= 3 ? 3 : 2;
  const sinistra = n === 3 ? 1 : 1; // ante a sinistra dello spigolo; il resto a destra
  const xp = (W * sinistra) / n; // lo spigolo
  const k = H * 0.05; // quanto le ante si abbassano verso lo spigolo
  const forme: Forma[] = [];
  const passo = passoLamelle(d, scheda);
  const lerp = (a: Punto, b: Punto, f: number): Punto => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  // l'altezza (in alto e in basso) a una data x: piena ai bordi esterni, ridotta verso lo spigolo
  const riduzione = (x: number) => (x < xp ? ((x - 0) / xp) * k : ((W - x) / (W - xp)) * k);
  const post = Math.max(34, W * 0.04);

  const gruppi: Array<[number, number, number]> = []; // x iniziale, x finale, numero di ante
  gruppi.push([0, xp - post / 2, sinistra]);
  gruppi.push([xp + post / 2, W, n - sinistra]);
  for (const [xa, xb, cnt] of gruppi) {
    const wAnta = (xb - xa) / cnt;
    for (let i = 0; i < cnt; i++) {
      const a = xa + i * wAnta;
      const b = a + wAnta;
      const lato = (x: number): [Punto, Punto] => [[x, riduzione(x)], [x, H - riduzione(x)]];
      const [aT, aB] = lato(a);
      const [bT, bB] = lato(b);
      const esterno: Punto[] = [aT, bT, bB, aB];
      forme.push({ kind: "sagoma", ruolo: "anta", punti: esterno });
      const t = Math.min(30, wAnta * 0.1);
      const interno = dentro(esterno, t);
      forme.push({ kind: "sagoma", ruolo: "campo", punti: interno });
      const e = estremi(interno);
      const quante = Math.max(1, Math.floor((e.y1 - e.y0) / passo));
      for (let q = 1; q < quante; q++) {
        const f = q / quante;
        const ya = e.y0 + (e.y1 - e.y0) * f;
        const v0 = estremiVerticali(interno, e.x0 + 0.5);
        const v1 = estremiVerticali(interno, e.x1 - 0.5);
        if (!v0 || !v1) continue;
        const pa: Punto = [e.x0, v0[0] + (v0[1] - v0[0]) * ((ya - e.y0) / (e.y1 - e.y0))];
        const pb: Punto = [e.x1, v1[0] + (v1[1] - v1[0]) * ((ya - e.y0) / (e.y1 - e.y0))];
        forme.push({ kind: "poly", ruolo: "lamellaLinea", punti: [pa, pb] });
      }
      void lerp;
    }
  }
  // Il montante d'angolo, con un vetro stretto.
  const yT = riduzione(xp), yB = H - riduzione(xp);
  forme.push({ kind: "rect", ruolo: "vetro", x: xp - post / 2, y: yT, w: post, h: yB - yT });
  forme.push({ kind: "rect", ruolo: "sbarra", x: xp - post / 2 - 6, y: yT, w: 6, h: yB - yT });
  forme.push({ kind: "rect", ruolo: "sbarra", x: xp + post / 2, y: yT, w: 6, h: yB - yT });
  return { larghezza: W, altezza: H, forme, quote: quoteBase(W, H), sporgenza: 0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Avvolgibile

function persianaAvvolgibile(d: PersianaDisegno, W: number, H: number): ScenaSerramento {
  const cb = Math.min(260, Math.max(160, H * 0.12)); // il cassonetto in alto
  const gw = Math.min(46, W * 0.05); // le guide laterali
  const forme: Forma[] = [];
  forme.push({ kind: "rect", ruolo: "cassonetto", x: 0, y: 0, w: W, h: cb });
  forme.push({ kind: "rect", ruolo: "vetro", x: gw, y: cb, w: W - 2 * gw, h: H - cb });
  forme.push({ kind: "rect", ruolo: "binario", x: 0, y: cb, w: gw, h: H - cb });
  forme.push({ kind: "rect", ruolo: "binario", x: W - gw, y: cb, w: gw, h: H - cb });

  const pct = Math.min(100, Math.max(0, d.abbassataPct ?? 100));
  const altezzaStecche = ((H - cb) * pct) / 100;
  if (altezzaStecche > 0) {
    forme.push({ kind: "rect", ruolo: "tapparella", x: gw, y: cb, w: W - 2 * gw, h: altezzaStecche });
    const pf = Math.min(34, altezzaStecche); // il profilo finale, più robusto
    forme.push({ kind: "rect", ruolo: "sbarra", x: gw, y: cb + altezzaStecche - pf, w: W - 2 * gw, h: pf });
  }
  const quote = quoteBase(W, H);
  quote.push({ orientamento: "v", lato: "sx", da: 0, a: cb, testo: String(Math.round(cb)) });
  quote.push({ orientamento: "v", lato: "sx", da: cb, a: H, testo: String(Math.round(H - cb)) });
  return { larghezza: W, altezza: H, forme, quote, sporgenza: 0 };
}

// ---------------------------------------------------------------------------------------------------------------------
// Griglia di sicurezza e brise-soleil

function telaioEVano(W: number, H: number, aletta: number) {
  const tel = Math.min(36, Math.min(W, H) * 0.06);
  const forme = telaioConAletta(W, H, aletta, tel);
  forme.push({ kind: "rect", ruolo: "vetro", x: tel, y: tel, w: W - 2 * tel, h: H - 2 * tel });
  return { forme, x0: tel, y0: tel, w0: W - 2 * tel, h0: H - 2 * tel };
}

function persianaGriglia(_d: PersianaDisegno, W: number, H: number, aletta: number): ScenaSerramento {
  const { forme, x0, y0, w0, h0 } = telaioEVano(W, H, aletta);
  const sbarre = Math.max(2, Math.round(w0 / 115));
  for (let k = 1; k < sbarre; k++) forme.push({ kind: "rect", ruolo: "sbarra", x: x0 + (w0 * k) / sbarre - 7, y: y0, w: 14, h: h0 });
  for (const q of [0.33, 0.67]) forme.push({ kind: "rect", ruolo: "sbarra", x: x0, y: y0 + h0 * q - 9, w: w0, h: 18 });
  return { larghezza: W, altezza: H, forme, quote: quoteBase(W, H), sporgenza: aletta };
}

function persianaBrise(_d: PersianaDisegno, W: number, H: number, aletta: number): ScenaSerramento {
  const { forme, x0, y0, w0, h0 } = telaioEVano(W, H, aletta);
  const passo = 120;
  const spessore = 80;
  const quante = Math.max(1, Math.floor(h0 / passo));
  const margine = (h0 - quante * passo) / 2;
  for (let k = 0; k < quante; k++) forme.push({ kind: "rect", ruolo: "lamella", x: x0, y: y0 + margine + k * passo + (passo - spessore) / 2, w: w0, h: spessore });
  return { larghezza: W, altezza: H, forme, quote: quoteBase(W, H), sporgenza: aletta };
}

// ---------------------------------------------------------------------------------------------------------------------
// Sagome: arco, trapezio, lunetta, tonda, triangolo, ogiva

function persianaSagomata(d: PersianaDisegno, W: number, H: number): ScenaSerramento {
  const dati: DatiSagoma = { forma: d.forma, frecciaMm: d.frecciaMm, altezzaMinoreMm: d.altezzaMinoreMm, latoMinore: d.latoMinore };
  const scheda = (d.stile ?? "scheda") === "scheda";
  const n = Math.min(2, Math.max(1, Math.round(d.ante)));
  const tel = Math.min(36, Math.min(W, H) * 0.06);
  const forme: Forma[] = [];
  const c0 = contornoForma(dati, W, H, 0);
  const cT = contornoForma(dati, W, H, tel);
  forme.push({ kind: "sagoma", ruolo: "telaio", punti: c0.punti, buco: cT.punti });
  forme.push({ kind: "sagoma", ruolo: "fondo", punti: cT.punti });

  const { x0, x1 } = estremi(cT.punti);
  const pesi = d.proporzioni && d.proporzioni.length === n && d.proporzioni.every((p) => p > 0) ? d.proporzioni : Array.from({ length: n }, () => 1);
  const somma = pesi.reduce((a, b) => a + b, 0);
  const larghezze = pesi.map((p) => ((x1 - x0) * p) / somma);
  const xs = larghezze.map((_, i) => x0 + larghezze.slice(0, i).reduce((a, b) => a + b, 0));

  const passo = passoLamelle(d, scheda);
  const spessore = spessoreLamella(d, passo);

  for (let i = 0; i < n; i++) {
    const xa = xs[i], xb = xs[i] + larghezze[i];
    const foglia = fasciaVerticale(cT.punti, xa, xb);
    if (foglia.length < 3) continue;
    const t = Math.min(scheda ? 34 : 40, larghezze[i] * (scheda ? 0.12 : 0.22));
    const interno = dentro(foglia, t);
    forme.push({ kind: "sagoma", ruolo: "anta", punti: foglia, buco: interno });
    forme.push({ kind: "sagoma", ruolo: "campo", punti: interno });
    const e = estremi(interno);

    if (d.tipo === "veneziana" || d.tipo === "gelosia") {
      const quante = Math.max(1, Math.floor((e.y1 - e.y0) / passo));
      const margine = (e.y1 - e.y0 - quante * passo) / 2;
      for (let k = 0; k < quante; k++) {
        const ya = e.y0 + margine + k * passo + (passo - spessore) / 2;
        const fascia = fasciaOrizzontale(interno, ya, ya + spessore);
        if (fascia.length >= 3 && area(fascia) > 40) forme.push({ kind: "sagoma", ruolo: "lamella", punti: fascia });
      }
      if (d.lamelle === "orientabili" && d.tipo === "veneziana") {
        const xc = (e.x0 + e.x1) / 2;
        const v = estremiVerticali(interno, xc);
        if (v) forme.push({ kind: "rect", ruolo: "asta", x: xc - 5, y: v[0], w: 10, h: v[1] - v[0] });
      }
    } else if (d.tipo === "scuro_pieno") {
      forme.push({ kind: "sagoma", ruolo: "pannello", punti: interno });
      const doghe = Math.max(1, Math.round((e.x1 - e.x0) / 110));
      for (let j = 1; j < doghe; j++) {
        const x = e.x0 + ((e.x1 - e.x0) * j) / doghe;
        const v = estremiVerticali(interno, x);
        if (v) forme.push({ kind: "poly", ruolo: "pannelloLinea", punti: [[x, v[0]], [x, v[1]]] });
      }
    } else {
      forme.push({ kind: "sagoma", ruolo: "pannello", punti: interno });
      const rilievo = dentro(interno, Math.min(e.x1 - e.x0, e.y1 - e.y0) * 0.12);
      if (rilievo.length >= 3 && area(rilievo) > 100) forme.push({ kind: "sagoma", ruolo: "pannelloRilievo", punti: rilievo });
    }

    // Le cerniere sul lato esterno dell'anta, lungo la parte dritta.
    const aSinistra = d.cerniere && d.cerniere.length === n ? d.cerniere[i] === "sx" : n === 1 ? (d.lato ?? "sx") === "sx" : i === 0;
    const bordo = aSinistra ? xa + 2 : xb - 2;
    const v = estremiVerticali(foglia, bordo);
    if (v) {
      const wc = Math.min(larghezze[i] * 0.32, 150);
      for (const q of [0.15, 0.85]) {
        const y = v[0] + (v[1] - v[0]) * q;
        if (scheda) forme.push({ kind: "rect", ruolo: "cerniera", x: (aSinistra ? xa : xb) - 6, y: y - 13, w: 12, h: 26 });
        else forme.push({ kind: "rect", ruolo: "cerniera", x: aSinistra ? xa : xb - wc, y: y - 12, w: wc, h: 24 });
      }
    }
  }

  const quote: Quota[] = [{ orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)) }];
  if (d.forma === "arco") {
    quote.push({ orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) });
    quote.push({ orientamento: "v", lato: "sx", da: 0, a: c0.angoli.tl[1], testo: `f ${Math.round(frecciaArco(dati, W, H))}` });
  } else if (d.forma === "trapezio") {
    const h = altezzeTrapezio(dati, H);
    quote.push({ orientamento: "v", lato: "sx", da: H - h.sx, a: H, testo: String(Math.round(h.sx)) });
    quote.push({ orientamento: "v", lato: "dx", da: H - h.dx, a: H, testo: String(Math.round(h.dx)) });
  } else {
    quote.push({ orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) });
  }
  return { larghezza: W, altezza: H, forme, quote, sporgenza: 0 };
}
