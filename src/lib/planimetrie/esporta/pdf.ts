/**
 * La tavola in PDF: la pianta in scala vera, il cartiglio dell'azienda, la
 * legenda giallo/rosso, la tabella dei locali e la barra di scala.
 *
 * «In scala vera» vuol dire che il disegno è vettoriale e messo sul foglio
 * con il fattore esatto: a 1:50 un metro della pianta sono 20 mm stampati
 * (56,69 punti PDF). Stampato al 100% si misura col righello.
 *
 * pdf-lib si carica solo quando serve: questo file non lo importa in testa.
 */
import { haMisureStimate } from "./adattatore";
import { ellisse, numeroIt, puntiArco } from "./geometria";
import {
  cmInMm, ErroreImpaginazione, impagina, MM_IN_PUNTI, passoBarraScala, RESPIRO, risolviScala, spazioUtile,
  type FormatoFoglio, type Impaginazione, type Orientamento, type Rettangolo,
} from "./impaginazione";
import { COLORI_STATO, costruisciScena, ORDINE_LAYER, type OpzioniScena, type Primitiva, type Scena } from "./scena";
import { ALTEZZA_MAIUSCOLA } from "./svg";
import type { DatiCartiglio, Punto, VistaPianta } from "./tipi";
import { creaTema } from "../../../components/preventivi/pdf/temaDocumento";

export { ErroreImpaginazione };

export interface OpzioniPdf extends Omit<OpzioniScena, "scala"> {
  formato?: FormatoFoglio;
  orientamento?: Orientamento;
  /** 50 = 1:50; «auto» sceglie la più grande che entra. */
  scala?: number | "auto";
  tabellaLocali?: boolean;
}

export interface PianoPdf {
  impaginazione: Impaginazione;
  scala: number;
  scena: Scena;
  formato: FormatoFoglio;
  orientamento: Orientamento;
  /** Da un punto della pianta (cm) alla sua posizione sul foglio (mm, origine in alto a sinistra). */
  inFoglio: (p: Punto) => Punto;
}

/** Dimensioni della scena a una scala: le quote stanno a distanze fisse sul foglio, quindi cambiano con la scala. */
const misuraScena = (vista: VistaPianta, opzioni: OpzioniScena) => (scala: number) => {
  const r = costruisciScena(vista, { ...opzioni, scala }).riquadro;
  return { larghezzaCm: r.maxX - r.minX, altezzaCm: r.maxY - r.minY };
};

/** Tutto ciò che si decide prima di disegnare: scala, impaginazione, posizione della pianta. Senza pdf-lib. */
export function pianificaPdf(vista: VistaPianta, opzioni: OpzioniPdf = {}): PianoPdf {
  const formato = opzioni.formato ?? "A3";
  const orientamento = opzioni.orientamento ?? "orizzontale";
  const opzioniScena: OpzioniScena = {
    ...opzioni,
    // «auto» si risolve sotto: alla scena arriva solo una scala numerica.
    scala: typeof opzioni.scala === "number" ? opzioni.scala : undefined,
    stile: opzioni.stile ?? "tecnico",
  };
  const scala = risolviScala(misuraScena(vista, opzioniScena), formato, orientamento, opzioni.scala ?? "auto");
  const scena = costruisciScena(vista, { ...opzioniScena, scala });
  const impaginazione = impagina(formato, orientamento);
  const utile = spazioUtile(impaginazione);
  const r = scena.riquadro;
  const larg = cmInMm(r.maxX - r.minX, scala), alt = cmInMm(r.maxY - r.minY, scala);
  const x0 = impaginazione.disegno.x + RESPIRO.lati + (utile.larghezza - larg) / 2;
  const y0 = impaginazione.disegno.y + RESPIRO.alto + (utile.altezza - alt) / 2;
  const inFoglio = (p: Punto): Punto => ({ x: x0 + cmInMm(p.x - r.minX, scala), y: y0 + cmInMm(p.y - r.minY, scala) });
  return { impaginazione, scala, scena, formato, orientamento, inFoglio };
}

export interface RisultatoPdf {
  dati: Uint8Array;
  scala: number;
  formato: FormatoFoglio;
  orientamento: Orientamento;
  larghezzaPt: number;
  altezzaPt: number;
}

// ─── Colori ──────────────────────────────────────────────────────────────────

interface Rgb { r: number; g: number; b: number }

export function rgb01(colore: string): Rgb {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(colore.trim());
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]);
    // Niente trasparenze nel PDF: il colore si mescola col bianco del foglio.
    const mix = (v: string) => (Number(v) / 255) * a + (1 - a);
    return { r: mix(m[1]), g: mix(m[2]), b: mix(m[3]) };
  }
  let h = colore.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const v = Number.parseInt(h.slice(0, 6), 16);
  if (!Number.isFinite(v)) return { r: 0, g: 0, b: 0 };
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}

// ─── Disegno ─────────────────────────────────────────────────────────────────

type PdfLib = typeof import("pdf-lib");
type Pagina = import("pdf-lib").PDFPage;
type Carattere = import("pdf-lib").PDFFont;

const pt = (mm: number) => mm * MM_IN_PUNTI;

/** Il testo con i soli caratteri che Helvetica (WinAnsi) sa scrivere. */
function sicuro(font: Carattere, testo: string): string {
  const ammessi = new Set(font.getCharacterSet());
  return Array.from(testo.replace(/≈/g, "~").replace(/→/g, "-"))
    .map((c) => (ammessi.has(c.codePointAt(0)!) ? c : "?"))
    .join("");
}

class Disegnatore {
  constructor(
    private lib: PdfLib,
    readonly pagina: Pagina,
    readonly normale: Carattere,
    readonly grassetto: Carattere,
  ) {}

  /** Da mm del foglio (origine in alto) ai punti PDF (origine in basso). */
  P(p: Punto): [number, number] {
    return [pt(p.x), this.pagina.getHeight() - pt(p.y)];
  }

  percorso(punti: Punto[], o: { chiuso: boolean; riempimento?: string; tratto?: { colore: string; spessore: number; tratteggio?: number[] } }) {
    const L = this.lib;
    if (punti.length < 2) return;
    const ops = [L.pushGraphicsState(), L.setLineJoin(L.LineJoinStyle.Round), L.setLineCap(L.LineCapStyle.Round)];
    if (o.tratto) {
      const c = rgb01(o.tratto.colore);
      ops.push(L.setLineWidth(pt(o.tratto.spessore)), L.setStrokingRgbColor(c.r, c.g, c.b));
      if (o.tratto.tratteggio?.length) ops.push(L.setDashPattern(o.tratto.tratteggio.map(pt), 0));
    }
    if (o.riempimento) {
      const c = rgb01(o.riempimento);
      ops.push(L.setFillingRgbColor(c.r, c.g, c.b));
    }
    const [x0, y0] = this.P(punti[0]);
    ops.push(L.moveTo(x0, y0));
    for (const q of punti.slice(1)) ops.push(L.lineTo(...this.P(q)));
    if (o.chiuso) ops.push(L.closePath());
    const riempi = o.chiuso && !!o.riempimento;
    ops.push(riempi && o.tratto ? L.fillAndStroke() : riempi ? L.fill() : o.tratto ? L.stroke() : L.endPath());
    ops.push(L.popGraphicsState());
    this.pagina.pushOperators(...ops);
  }

  rettangolo(r: Rettangolo, o: { riempimento?: string; tratto?: { colore: string; spessore: number } }) {
    this.percorso(
      [{ x: r.x, y: r.y }, { x: r.x + r.larghezza, y: r.y }, { x: r.x + r.larghezza, y: r.y + r.altezza }, { x: r.x, y: r.y + r.altezza }],
      { chiuso: true, ...o },
    );
  }

  linea(a: Punto, b: Punto, colore = "#111111", spessore = 0.2) {
    this.percorso([a, b], { chiuso: false, tratto: { colore, spessore } });
  }

  larghezza(testo: string, corpoPt: number, forte = false) {
    const f = forte ? this.grassetto : this.normale;
    return f.widthOfTextAtSize(sicuro(f, testo), corpoPt) / MM_IN_PUNTI;
  }

  /**
   * Una scritta. `p` è il punto di riferimento in mm; `corpoPt` il corpo del
   * carattere; la rotazione in gradi orari sullo schermo.
   */
  scrivi(testo: string, p: Punto, corpoPt: number, o: {
    forte?: boolean; colore?: string; allinea?: "sinistra" | "centro" | "destra";
    verticale?: "basso" | "centro" | "alto"; rotazione?: number; massimoMm?: number;
  } = {}) {
    const font = o.forte ? this.grassetto : this.normale;
    let t = sicuro(font, testo);
    if (o.massimoMm) {
      while (t.length > 1 && font.widthOfTextAtSize(t, corpoPt) / MM_IN_PUNTI > o.massimoMm) t = t.slice(0, -2) + "…";
    }
    const w = font.widthOfTextAtSize(t, corpoPt);
    const maiuscola = corpoPt * ALTEZZA_MAIUSCOLA;
    const dx = o.allinea === "centro" ? -w / 2 : o.allinea === "destra" ? -w : 0;
    const dy = o.verticale === "centro" ? -maiuscola / 2 : o.verticale === "alto" ? -maiuscola : 0;
    const gradi = -(o.rotazione ?? 0);
    const r = (gradi * Math.PI) / 180;
    const [x, y] = this.P(p);
    const c = rgb01(o.colore ?? "#111111");
    this.pagina.drawText(t, {
      x: x + dx * Math.cos(r) - dy * Math.sin(r),
      y: y + dx * Math.sin(r) + dy * Math.cos(r),
      size: corpoPt,
      font,
      color: this.lib.rgb(c.r, c.g, c.b),
      rotate: this.lib.degrees(gradi),
    });
  }

  ritaglia(r: Rettangolo, disegna: () => void) {
    const L = this.lib;
    const [x, y] = this.P({ x: r.x, y: r.y + r.altezza });
    this.pagina.pushOperators(L.pushGraphicsState(), L.rectangle(x, y, pt(r.larghezza), pt(r.altezza)), L.clip(), L.endPath());
    disegna();
    this.pagina.pushOperators(L.popGraphicsState());
  }
}

function disegnaPrimitiva(d: Disegnatore, p: Primitiva, piano: PianoPdf) {
  const F = piano.inFoglio;
  switch (p.tipo) {
    case "poligono":
      d.percorso(p.punti.map(F), {
        chiuso: p.chiuso, riempimento: p.riempimento,
        tratto: p.tratto && { colore: p.tratto.colore, spessore: p.tratto.spessoreMm, tratteggio: p.tratto.tratteggioMm },
      });
      break;
    case "arco":
      d.percorso(puntiArco(p.centro, p.raggio, p.inizio, p.fine, 3).map(F), {
        chiuso: false, tratto: { colore: p.tratto.colore, spessore: p.tratto.spessoreMm, tratteggio: p.tratto.tratteggioMm },
      });
      break;
    case "cerchio":
      d.percorso(ellisse(p.centro, p.raggio, p.raggio, 48).map(F), {
        chiuso: true, riempimento: p.riempimento,
        tratto: p.tratto && { colore: p.tratto.colore, spessore: p.tratto.spessoreMm },
      });
      break;
    case "testo":
      d.scrivi(p.testo, F(p.posizione), (p.altezzaMm / ALTEZZA_MAIUSCOLA) * MM_IN_PUNTI, {
        forte: p.grassetto, colore: p.colore, allinea: p.allinea, verticale: p.verticale, rotazione: p.rotazione,
      });
      break;
  }
}

// ─── Riquadri del foglio ─────────────────────────────────────────────────────

const GRIGIO = "#5B6472";
const FILETTO = "#C9CED6";

function dataIt(d?: Date | string): string {
  const v = d ? new Date(d) : new Date();
  return Number.isNaN(v.getTime()) ? String(d ?? "") : v.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function disegnaCartiglio(d: Disegnatore, r: Rettangolo, c: DatiCartiglio, vista: VistaPianta, piano: PianoPdf) {
  const tema = creaTema({ primario: c.azienda.colore });
  d.rettangolo(r, { riempimento: "#FFFFFF", tratto: { colore: "#111111", spessore: 0.35 } });
  d.rettangolo({ x: r.x, y: r.y, larghezza: r.larghezza, altezza: 1.4 }, { riempimento: tema.marca });

  // Intestazione: logo e dati dell'azienda
  const pad = 3;
  let testoX = r.x + pad;
  const altoIntestazione = 19;
  if (c.azienda.logo) {
    try {
      const doc = d.pagina.doc;
      const img = c.azienda.logo.tipo === "png" ? await doc.embedPng(c.azienda.logo.dati) : await doc.embedJpg(c.azienda.logo.dati);
      const maxL = 24, maxH = 13;
      const k = Math.min(maxL / (img.width / MM_IN_PUNTI), maxH / (img.height / MM_IN_PUNTI));
      const lw = (img.width / MM_IN_PUNTI) * k, lh = (img.height / MM_IN_PUNTI) * k;
      const [x, y] = d.P({ x: r.x + pad, y: r.y + 3.5 + (maxH - lh) / 2 + lh });
      d.pagina.drawImage(img, { x, y, width: pt(lw), height: pt(lh) });
      testoX = r.x + pad + lw + 3;
    } catch {
      // Un logo illeggibile non ferma la tavola: resta il nome.
    }
  }
  const largTesto = r.x + r.larghezza - pad - testoX;
  d.scrivi(c.azienda.nome, { x: testoX, y: r.y + 7 }, 9, { forte: true, massimoMm: largTesto });
  const righe = [
    c.azienda.indirizzo,
    [c.azienda.partitaIva && `P.IVA ${c.azienda.partitaIva}`, c.azienda.telefono].filter(Boolean).join(" · "),
    c.azienda.email,
  ].filter((x): x is string => !!x);
  righe.slice(0, 3).forEach((riga, i) => d.scrivi(riga, { x: testoX, y: r.y + 10.6 + i * 3 }, 6.2, { colore: GRIGIO, massimoMm: largTesto }));

  // Le caselle: etichetta piccola in alto, valore sotto
  const casella = (x: number, y: number, larg: number, alt: number, etichetta: string, valore: string, forte = false) => {
    d.linea({ x, y }, { x: x + larg, y }, FILETTO, 0.15);
    d.scrivi(etichetta.toUpperCase(), { x: x + 1.5, y: y + 2.9 }, 5, { colore: GRIGIO, forte: true });
    // Il valore lungo prima si stringe (fino a 6,5 pt), poi si taglia
    let corpo = forte ? 8.5 : 7.5;
    while (corpo > 6.5 && d.larghezza(valore, corpo, forte) > larg - 3) corpo -= 0.25;
    d.scrivi(valore || "—", { x: x + 1.5, y: y + alt - 1.8 }, corpo, { forte, massimoMm: larg - 3 });
  };
  const oggetto = [c.oggetto ?? vista.livello ?? "Pianta"].filter(Boolean).join("");
  const righeCaselle = [
    { etichetta: "Oggetto", valore: `${vista.titolo} — ${oggetto}`, forte: true },
    { etichetta: "Cliente", valore: c.cliente ?? "" },
    { etichetta: "Cantiere", valore: c.indirizzoCantiere ?? "" },
  ];
  // Dal basso: la riga delle celle (scala, data…), sopra le caselle; in cima ciò che avanza
  const altCelle = 9.5;
  const altRiga = Math.min(8, (r.altezza - altoIntestazione - altCelle) / righeCaselle.length);
  let y = r.y + r.altezza - altCelle - altRiga * righeCaselle.length;
  for (const rc of righeCaselle) {
    casella(r.x, y, r.larghezza, altRiga, rc.etichetta, rc.valore, rc.forte);
    y += altRiga;
  }
  const celle = [
    ["Scala", `1:${piano.scala}`],
    ["Formato", `${piano.formato}`],
    ["Data", dataIt(c.data)],
    ["Versione", c.versione ?? ""],
    ...(c.tavola ? [["Tavola", c.tavola]] : []),
  ];
  const largCella = r.larghezza / celle.length;
  celle.forEach(([e, v], i) => {
    casella(r.x + i * largCella, y, largCella, r.y + r.altezza - y, e, v, e === "Scala");
    if (i > 0) d.linea({ x: r.x + i * largCella, y }, { x: r.x + i * largCella, y: r.y + r.altezza }, FILETTO, 0.15);
  });
}

function disegnaLegenda(d: Disegnatore, x: number, y: number, larg: number, vista: VistaPianta): number {
  const stati = new Set(vista.muri.map((m) => m.stato));
  vista.aperture.forEach((a) => { if (a.stato !== "esistente") stati.add(a.stato === "nuovo" ? "da_demolire" : "nuovo"); });
  const voci: { colore: string; bordo: string; testo: string }[] = [
    { ...COLORI_STATO.esistente, colore: COLORI_STATO.esistente.riempimento, testo: "Muri esistenti" },
  ];
  if (stati.has("da_demolire")) voci.push({ colore: COLORI_STATO.da_demolire.riempimento, bordo: COLORI_STATO.da_demolire.bordo, testo: "Demolizioni (giallo)" });
  if (stati.has("nuovo")) voci.push({ colore: COLORI_STATO.nuovo.riempimento, bordo: COLORI_STATO.nuovo.bordo, testo: "Nuove costruzioni (rosso)" });
  d.scrivi("LEGENDA", { x, y: y + 3 }, 6, { forte: true, colore: GRIGIO });
  let yy = y + 5.5;
  for (const v of voci) {
    d.rettangolo({ x, y: yy, larghezza: 9, altezza: 3.6 }, { riempimento: v.colore, tratto: { colore: v.bordo, spessore: 0.2 } });
    d.scrivi(v.testo, { x: x + 11.5, y: yy + 2.8 }, 7, { massimoMm: larg - 12 });
    yy += 5.2;
  }
  return yy - y;
}

function disegnaTabellaLocali(d: Disegnatore, x: number, y: number, larg: number, altMax: number, vista: VistaPianta): number {
  const locali = vista.locali.filter((l) => l.contorno.length >= 3);
  if (locali.length === 0) return 0;
  const rigaH = 4.4;
  const colonne = [
    { titolo: "Locale", larg: larg - 37, allinea: "sinistra" as const },
    { titolo: "Sup. m²", larg: 13, allinea: "destra" as const },
    { titolo: "Perim. m", larg: 13, allinea: "destra" as const },
    { titolo: "H m", larg: 11, allinea: "destra" as const },
  ];
  const righeMax = Math.max(1, Math.floor((altMax - 6 - rigaH * 2 - 4) / rigaH));
  const mostrati = locali.length > righeMax ? locali.slice(0, righeMax - 1) : locali;
  d.scrivi("LOCALI", { x, y: y + 3 }, 6, { forte: true, colore: GRIGIO });
  let yy = y + 5;
  d.rettangolo({ x, y: yy, larghezza: larg, altezza: rigaH }, { riempimento: "#EEF0F3" });
  const riga = (valori: string[], yRiga: number, forte = false) => {
    let cx = x;
    colonne.forEach((c, i) => {
      const px = c.allinea === "destra" ? cx + c.larg - 1.2 : cx + 1.2;
      d.scrivi(valori[i] ?? "", { x: px, y: yRiga + rigaH - 1.3 }, 6.8, { forte, allinea: c.allinea, massimoMm: c.larg - 2 });
      cx += c.larg;
    });
  };
  riga(colonne.map((c) => c.titolo), yy, true);
  yy += rigaH;
  let stimate = false;
  for (const l of mostrati) {
    const stimata = l.origine === "stimata";
    stimate ||= stimata;
    riga([
      l.nome + (stimata ? " *" : ""),
      numeroIt(l.superficieMq ?? 0),
      l.perimetroM !== undefined ? numeroIt(l.perimetroM) : "",
      l.altezza ? numeroIt(l.altezza / 100) : "",
    ], yy);
    d.linea({ x, y: yy + rigaH }, { x: x + larg, y: yy + rigaH }, FILETTO, 0.12);
    yy += rigaH;
  }
  if (mostrati.length < locali.length) {
    riga([`… e altri ${locali.length - mostrati.length} locali`, "", "", ""], yy);
    yy += rigaH;
  }
  const totale = locali.reduce((s, l) => s + (l.superficieMq ?? 0), 0);
  d.linea({ x, y: yy }, { x: x + larg, y: yy }, "#111111", 0.25);
  riga(["Totale", numeroIt(totale), "", ""], yy, true);
  yy += rigaH;
  if (stimate || haMisureStimate(vista)) {
    d.scrivi("* misura stimata, da verificare sul posto", { x, y: yy + 3.2 }, 5.8, { colore: GRIGIO });
    yy += 4.5;
  }
  return yy - y;
}

function disegnaBarraScala(d: Disegnatore, x: number, y: number, larg: number, scala: number): number {
  d.scrivi(`Scala 1:${scala}`, { x, y: y + 4 }, 10, { forte: true });
  const passo = passoBarraScala(scala);
  const seg = (passo * 1000) / scala;
  const n = Math.max(2, Math.min(5, Math.floor((larg - 8) / seg)));
  const by = y + 7;
  for (let i = 0; i < n; i++) {
    d.rettangolo({ x: x + i * seg, y: by, larghezza: seg, altezza: 1.6 }, { riempimento: i % 2 ? "#FFFFFF" : "#111111", tratto: { colore: "#111111", spessore: 0.15 } });
  }
  for (let i = 0; i <= n; i++) {
    const etichetta = numeroIt(passo * i).replace(/,00$/, "").replace(/(,\d)0$/, "$1");
    d.scrivi(`${etichetta}${i === n ? " m" : ""}`, { x: x + i * seg, y: by + 4.6 }, 5.5, { allinea: "centro" });
  }
  const note = [
    "Stampare al 100%,",
    "senza «adatta alla pagina».",
    `1 cm sul foglio = ${numeroIt(scala / 100, scala < 100 ? 2 : 0)} m in cantiere.`,
  ];
  note.forEach((n, i) => d.scrivi(n, { x, y: by + 8.6 + i * 2.7 }, 5.6, { colore: GRIGIO, massimoMm: larg }));
  return by + 8.6 + note.length * 2.7 - y;
}

function disegnaNord(d: Disegnatore, c: Punto, gradi: number) {
  const r = 5;
  d.percorso(ellisse(c, r, r, 40), { chiuso: true, tratto: { colore: "#111111", spessore: 0.2 } });
  const ruota = (p: Punto): Punto => {
    const a = (gradi * Math.PI) / 180;
    return { x: c.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: c.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
  };
  d.percorso([{ x: 0, y: -r + 0.6 }, { x: 1.8, y: 2.5 }, { x: 0, y: 1.2 }, { x: -1.8, y: 2.5 }].map(ruota), { chiuso: true, riempimento: "#111111" });
  d.scrivi("N", ruota({ x: 0, y: -r - 2.2 }), 7, { forte: true, allinea: "centro", verticale: "centro" });
}

// ─── Esportazione ────────────────────────────────────────────────────────────

export async function esportaPdf(vista: VistaPianta, cartiglio: DatiCartiglio, opzioni: OpzioniPdf = {}): Promise<RisultatoPdf> {
  const piano = pianificaPdf(vista, opzioni);
  const lib = await import("pdf-lib");
  const doc = await lib.PDFDocument.create();
  doc.setTitle(`${vista.titolo} — ${vista.livello ?? "Pianta"} (1:${piano.scala})`);
  doc.setAuthor(cartiglio.azienda.nome);
  doc.setCreator("Edilizia in Cloud — Planimetrie");
  doc.setProducer("Edilizia in Cloud");
  doc.setSubject("Pianta in scala");
  const { foglio, cornice, disegno, informazioni, cartiglio: boxCartiglio } = piano.impaginazione;
  const pagina = doc.addPage([pt(foglio.larghezza), pt(foglio.altezza)]);
  const d = new Disegnatore(lib, pagina, await doc.embedFont(lib.StandardFonts.Helvetica), await doc.embedFont(lib.StandardFonts.HelveticaBold));

  // Cornice e riquadro del disegno
  d.rettangolo(cornice, { tratto: { colore: "#111111", spessore: 0.5 } });
  d.rettangolo(disegno, { tratto: { colore: "#111111", spessore: 0.25 } });

  // La pianta
  d.ritaglia(disegno, () => {
    for (const layer of ORDINE_LAYER) {
      for (const p of piano.scena.primitive) if (p.layer === layer) disegnaPrimitiva(d, p, piano);
    }
  });
  d.scrivi(`PIANTA — ${(vista.livello ?? vista.titolo).toUpperCase()}`, { x: disegno.x + 4, y: disegno.y + 6.5 }, 9, {
    forte: true, massimoMm: disegno.larghezza - 24,
  });
  if (vista.nord !== undefined) disegnaNord(d, { x: disegno.x + disegno.larghezza - 10, y: disegno.y + 12 }, vista.nord);

  // Legenda, locali, scala
  const pad = 4;
  const orizzontale = piano.orientamento === "orizzontale";
  const divisione = 0.62;
  const colX = informazioni.x + pad, colL = orizzontale ? informazioni.larghezza - 2 * pad : informazioni.larghezza * divisione - 2 * pad;
  let y = informazioni.y + pad;
  if (orizzontale) {
    y += disegnaLegenda(d, colX, y, colL, vista) + 3;
    if (opzioni.tabellaLocali ?? true) {
      const spazio = informazioni.y + informazioni.altezza - y - 30;
      y += disegnaTabellaLocali(d, colX, y, colL, spazio, vista) + 3;
    }
    disegnaBarraScala(d, colX, informazioni.y + informazioni.altezza - 26, colL, piano.scala);
  } else {
    if (opzioni.tabellaLocali ?? true) disegnaTabellaLocali(d, colX, y, colL, informazioni.altezza - 2 * pad, vista);
    const x2 = informazioni.x + informazioni.larghezza * divisione + pad, l2 = informazioni.larghezza * (1 - divisione) - 2 * pad;
    d.linea({ x: informazioni.x + informazioni.larghezza * divisione, y: informazioni.y }, { x: informazioni.x + informazioni.larghezza * divisione, y: informazioni.y + informazioni.altezza }, FILETTO, 0.15);
    const hLeg = disegnaLegenda(d, x2, y, l2, vista);
    disegnaBarraScala(d, x2, y + hLeg + 4, l2, piano.scala);
  }
  d.linea({ x: informazioni.x, y: informazioni.y }, { x: informazioni.x, y: informazioni.y + informazioni.altezza }, "#111111", 0.25);
  if (!orizzontale) d.linea({ x: informazioni.x, y: informazioni.y }, { x: cornice.x + cornice.larghezza, y: informazioni.y }, "#111111", 0.25);

  await disegnaCartiglio(d, boxCartiglio, cartiglio, vista, piano);

  const dati = await doc.save();
  return {
    dati, scala: piano.scala, formato: piano.formato, orientamento: piano.orientamento,
    larghezzaPt: pagina.getWidth(), altezzaPt: pagina.getHeight(),
  };
}

