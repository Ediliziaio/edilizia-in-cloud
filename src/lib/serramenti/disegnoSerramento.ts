/**
 * Il disegno di un serramento, generato dalle sue misure e dalle sue aperture.
 *
 * Una finestra a 2 ante 1200×1400 con l'anta destra a ribalta si disegna da
 * sola, in proporzione, invece di scegliere una fra decine di immagini: telaio,
 * ante, vetro, maniglia e i simboli rossi di apertura.
 *
 * Questo file produce solo la scena: forme in millimetri, senza colori. Chi
 * disegna (pagina web, PDF) le riempie con la finitura scelta. Così il disegno
 * ha una sola definizione.
 *
 * Convenzioni:
 *  - destra/sinistra sono sempre VISTE DALL'INTERNO (dal lato maniglia);
 *  - il simbolo segue i disegni che l'azienda usava: la punta del triangolo sta
 *    dal lato in cui l'anta si apre (battente: lato maniglia; ribalta: in alto).
 *    Se serve la convenzione opposta (punta sulle cerniere) basta cambiare
 *    PUNTA_SUL_LATO_CERNIERA;
 *  - vista dall'esterno il disegno si specchia, maniglie e cerniere spariscono e i
 *    simboli diventano tratteggiati (l'anta si apre verso l'interno).
 */

import type { VetroDisegno } from "./vetroSerramento";
import { ALETTA_DI_SERIE_MM, type TelaioDisegno } from "./telaioSerramento";

export type TipoAnta = "battente" | "anta_ribalta" | "vasistas" | "scorrevole" | "alzante_scorrevole" | "fisso" | "libro";
export type Lato = "dx" | "sx";

export interface AntaDisegno {
  tipo: TipoAnta;
  /** Battente e anta-ribalta: il lato delle CERNIERE. Scorrevoli: il verso in cui scorre. */
  lato?: Lato;
  /**
   * Se l'anta porta la maniglia. Non indicato: sì per ogni anta apribile, ma in un sistema a battente con
   * due ante che si incontrano la maniglia è una sola (vedi `maniglieDiSerie`).
   */
  maniglia?: boolean;
  /**
   * Nelle ante a battente che si incontrano al centro, l'anta principale è quella con la maniglia. Non indicata:
   * è quella di destra (vista dall'interno), salvo che l'altra sia un'anta-ribalta.
   */
  principale?: boolean;
  /** Larghezza dell'anta in mm. Non indicata: le ante senza misura si dividono lo spazio che resta. */
  larghezzaMm?: number;
  /** Fisso nel telaio: il vetro sta direttamente nel telaio, senza il profilo dell'anta (scorrevoli). */
  nelTelaio?: boolean;
  /** Scorrevole che prima si ribalta (scorri-ribalta, PSK): oltre alla freccia ha il simbolo della ribalta. */
  conRibalta?: boolean;
}

/** Dove va l'anta scorrevole quando si apre fuori dal vano: dentro il muro (scomparsa) o davanti alla parete. */
export interface ScorrimentoDisegno {
  tipo: "scomparsa" | "su_parete";
  /** Da che parte, visto dall'interno. */
  lato: Lato;
}

/**
 * La sagoma del serramento. Tutte le sagome non rettangolari hanno un solo campo (una sola anta o un fisso):
 * sopraluce e più ante valgono solo sulla sagoma rettangolare. Arco e trapezio possono avere l'anta apribile;
 * lunetta (semicerchio), tonda (cerchio o ovale), triangolo e ogiva (arco a punta) si disegnano come fissi.
 */
export type FormaSerramento = "rettangolare" | "arco" | "trapezio" | "lunetta" | "tonda" | "triangolo" | "ogiva";

/** Le sagome che hanno la loro misura in più o la loro forma da raccontare nel preventivo. */
export const FORME_SAGOMATE: FormaSerramento[] = ["arco", "trapezio", "lunetta", "tonda", "triangolo", "ogiva"];

/**
 * Il monoblocco: il serramento con il cassonetto sopra (controtelaio, cassonetto e spallette in un
 * corpo solo). L'altezza totale comprende il cassonetto: 1000 mm con cassonetto da 200 sono 200 di
 * cassonetto e 800 di serramento.
 */
export interface MonoblocoDisegno {
  /** Altezza del cassonetto in mm; di solito 200. */
  cassonettoMm?: number;
  /** La tapparella: motorizzata o a cintino, e di quanto è abbassata (0–100) per vederla nel disegno. */
  tapparella?: { motore?: boolean; abbassataPct?: number } | false;
  zanzariera?: boolean;
}

export interface SerramentoDisegno {
  larghezzaMm: number;
  /** L'altezza totale; nel trapezio è quella del lato più alto. */
  altezzaMm: number;
  ante: AntaDisegno[];
  forma?: FormaSerramento;
  monoblocco?: MonoblocoDisegno;
  /** Scorrevoli: l'anta esce dal vano e va nel muro (scomparsa) o davanti alla parete (su parete). */
  scorrimento?: ScorrimentoDisegno;
  /** Scorrevoli «in linea»: le ante stanno sullo stesso piano, senza accavallarsi. */
  inLinea?: boolean;
  /** Telaio a L o a Z (con l'aletta); l'aletta si vede dall'interno, sulle sagomature non si disegna. */
  telaio?: TelaioDisegno;
  vetro?: VetroDisegno;
  /** Arco: altezza dell'arco. Non indicata = a tutto sesto (metà della larghezza); più bassa = arco ribassato. */
  frecciaMm?: number;
  /** Trapezio: altezza del lato più basso e quale lato è. */
  altezzaMinoreMm?: number;
  latoMinore?: Lato;
  /**
   * Traversi orizzontali (divisori del vetro, di solito sulle porte finestre e su alcune finestre): la
   * distanza dal BASSO del serramento al centro del traverso. Il traverso è un po' più largo del profilo dell'anta.
   */
  traversi?: Array<{ daBassoMm: number }>;
  /** Inglesine (false astine): colonne e righe di riquadri dentro ogni vetro. */
  inglesine?: { colonne: number; righe: number };
  /** Una fascia di vetro sopra le ante, fissa o apribile a vasistas; fissa può essere divisa in più sezioni. */
  sopraluce?: { altezzaMm: number; apribile?: boolean; sezioni?: number };
  /** Una fascia di vetro fisso sotto le ante (sottoluce). */
  sottoluce?: { altezzaMm: number };
  /** Soglia a terra (porte finestre, portoncini). */
  soglia?: boolean;
  vista?: "interna" | "esterna";
}

export type Ruolo =
  | "telaio" | "anta" | "vetro" | "maniglia" | "cerniera" | "simbolo" | "soglia"
  | "aletta" | "distanziatore" | "cassonetto" | "ispezione" | "tapparella" | "cintino" | "motore"
  | "inglesina" | "binario"
  | "lamella" | "asta" | "pannello" | "pannelloRilievo" | "fondo" | "lamellaLinea" | "pannelloLinea"
  | "parete" | "davanzale" | "sbarra" | "cappello" | "campo";

export type Punto = [number, number];

export type Forma =
  | { kind: "rect"; ruolo: Ruolo; x: number; y: number; w: number; h: number }
  /** Una figura qualsiasi, piena; con `buco` è un anello (il telaio di un arco). */
  | { kind: "sagoma"; ruolo: Ruolo; punti: Punto[]; buco?: Punto[] }
  | {
      kind: "poly";
      ruolo: Ruolo;
      punti: Array<[number, number]>;
      tratteggio?: boolean;
      /** Una barra di profilo con le testate a 45°: è piena (non una linea) e ha un verso per le venature. */
      barra?: "h" | "v";
    };

/** Una quota da disegnare fuori dal serramento. `da` e `a` sono coordinate lungo l'asse della quota. */
export interface Quota {
  orientamento: "h" | "v";
  lato: "sotto" | "sx" | "dx";
  da: number;
  a: number;
  testo: string;
  /** Legata a un lato della sagoma (il trapezio): dall'esterno, specchiando, cambia lato. */
  segue?: boolean;
  /** Le quote si impilano: 0 la più vicina al serramento, 1 quella oltre. */
  livello?: number;
}

export interface ScenaSerramento {
  /** Larghezza e altezza del serramento, in mm: le forme stanno in questo riquadro. */
  larghezza: number;
  altezza: number;
  forme: Forma[];
  quote: Quota[];
  /** Quanto il disegno esce dal riquadro (l'aletta del telaio a Z), in mm, su ogni lato. Le quote stanno oltre questo margine. */
  sporgenza: number;
  /** Quanto si estende lo sfondo (la parete attorno al vano), in mm: allarga l'immagine ma non sposta le quote. */
  sfondo?: number;
  /**
   * Lo stile con cui si colora la scena. «scheda»: disegno tecnico piatto, grigi chiari, lamelle a coppie di fili
   * (come le immagini delle schede del listino); assente: l'aspetto realistico con volume e ombre.
   */
  stile?: "scheda";
}

/** false: la punta del triangolo sta dal lato maniglia (come nei disegni dell'azienda). true: sulle cerniere. */
export const PUNTA_SUL_LATO_CERNIERA = false;

const lato = (a: AntaDisegno): Lato => a.lato ?? "dx";

/**
 * Profili standard, uguali per ogni modello e ogni linea (Salamander, Euroall…):
 * sottili, come nei disegni da catalogo. Solo sulle misure molto piccole si
 * riducono, perché il disegno non si riempia di telaio.
 */
export const PROFILI_STANDARD = { telaioMm: 46, antaMm: 41, fermaMm: 12 } as const;

function spessori(l: number, h: number) {
  const k = Math.min(1, (Math.min(l, h) * 0.075) / PROFILI_STANDARD.telaioMm);
  return {
    telaio: PROFILI_STANDARD.telaioMm * k,
    anta: PROFILI_STANDARD.antaMm * k,
    ferma: Math.max(8, PROFILI_STANDARD.fermaMm * k),
  };
}

/** Una cornice di spessore t: quattro barre con le testate a 45°, come un serramento vero. */
export function cornice(x: number, y: number, w: number, h: number, t: number, ruolo: Ruolo): Forma[] {
  const barra = (punti: Array<[number, number]>, verso: "h" | "v"): Forma => ({ kind: "poly", ruolo, punti, barra: verso });
  return [
    barra([[x, y], [x + w, y], [x + w - t, y + t], [x + t, y + t]], "h"),
    barra([[x + t, y + h - t], [x + w - t, y + h - t], [x + w, y + h], [x, y + h]], "h"),
    barra([[x, y], [x + t, y + t], [x + t, y + h - t], [x, y + h]], "v"),
    barra([[x + w, y], [x + w, y + h], [x + w - t, y + h - t], [x + w - t, y + t]], "v"),
  ];
}

/**
 * Le larghezze delle ante in mm, dentro la larghezza interna. Le ante con una misura la tengono; le altre si
 * dividono il resto in parti uguali. Se le misure non entrano, si riducono tutte in proporzione.
 */
export function larghezzeAnte(ante: AntaDisegno[], totale: number): number[] {
  const n = Math.max(1, ante.length);
  const esplicite = ante.map((a) => (a.larghezzaMm && a.larghezzaMm > 0 ? a.larghezzaMm : 0));
  const somma = esplicite.reduce((x, y) => x + y, 0);
  const senza = esplicite.filter((v) => v === 0).length;
  if (somma === 0) return Array.from({ length: n }, () => totale / n);
  const resto = senza > 0 ? Math.max(totale - somma, senza * 100) : 0;
  const misure = esplicite.map((v) => (v > 0 ? v : resto / senza));
  const tot = misure.reduce((x, y) => x + y, 0);
  return misure.map((v) => (v * totale) / tot);
}

const apribileABattente = (a: AntaDisegno) => a.tipo === "battente" || a.tipo === "anta_ribalta";

/**
 * Quali ante hanno la maniglia, secondo la regola standard del preventivo: ogni anta apribile ha la sua,
 * ma quando due ante a battente si incontrano al centro la maniglia è UNA SOLA, sull'anta principale.
 *  - battente + anta-ribalta: la maniglia sta sull'anta-ribalta (che ne ha bisogno per ribaltare);
 *  - due battenti: sull'anta principale (quella di destra, o quella indicata `principale`);
 *  - due ante-ribalta: una maniglia per anta.
 * Una maniglia indicata a mano (`maniglia: true/false`) vince sempre.
 */
export function maniglieDiSerie(ante: AntaDisegno[]): boolean[] {
  const risultato = ante.map(
    (a) => a.maniglia ?? (a.tipo === "battente" || a.tipo === "anta_ribalta" || a.tipo === "alzante_scorrevole" || a.tipo === "scorrevole"),
  );
  for (let i = 0; i < ante.length - 1; i++) {
    const sx = ante[i];
    const dx = ante[i + 1];
    if (!apribileABattente(sx) || !apribileABattente(dx)) continue;
    if (lato(sx) !== "sx" || lato(dx) !== "dx") continue; // si incontrano al centro: cerniere fuori, lati liberi vicini
    let secondaria: number | null = null;
    if (sx.tipo === "battente" && dx.tipo === "anta_ribalta") secondaria = i;
    else if (dx.tipo === "battente" && sx.tipo === "anta_ribalta") secondaria = i + 1;
    else if (sx.tipo === "battente" && dx.tipo === "battente") secondaria = sx.principale && !dx.principale ? i + 1 : i;
    if (secondaria !== null && ante[secondaria].maniglia === undefined) risultato[secondaria] = false;
  }
  return risultato;
}

const rettangoloPunti = (x: number, y: number, w: number, h: number): Punto[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** I distanziatori fra le lastre, visibili lungo il bordo del vetro: uno per il doppio vetro, due per il triplo. */
function distanziatori(x: number, y: number, w: number, h: number, lastre: number | undefined): Forma[] {
  const out: Forma[] = [];
  for (let k = 1; k < (lastre ?? 0); k++) {
    const dentro = 16 * k;
    const sp = 6;
    if (w - 2 * (dentro + sp) < 20 || h - 2 * (dentro + sp) < 20) break;
    out.push({
      kind: "sagoma",
      ruolo: "distanziatore",
      punti: rettangoloPunti(x + dentro, y + dentro, w - 2 * dentro, h - 2 * dentro),
      buco: rettangoloPunti(x + dentro + sp, y + dentro + sp, w - 2 * (dentro + sp), h - 2 * (dentro + sp)),
    });
  }
  return out;
}

export interface Angoli { tl: Punto; tr: Punto; br: Punto; bl: Punto }

const medio = (a: Punto, b: Punto): Punto => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** I simboli di apertura di un'anta, dai quattro angoli del suo vetro: valgono per il rettangolo e per le sagome. */
export function simboliDaAngoli(anta: AntaDisegno, ang: Angoli, cima: Punto, tratteggio: boolean): Forma[] {
  const out: Forma[] = [];
  const poly = (punti: Punto[]): Forma => ({ kind: "poly", ruolo: "simbolo", punti, tratteggio });
  const cernieraDx = lato(anta) === "dx";

  if (anta.tipo === "battente" || anta.tipo === "anta_ribalta" || anta.tipo === "libro") {
    // Dalle cerniere: due spigoli che convergono a metà altezza sul lato opposto (o, con la convenzione opposta, il contrario).
    const cerniera: [Punto, Punto] = cernieraDx ? [ang.tr, ang.br] : [ang.tl, ang.bl];
    const libero: [Punto, Punto] = cernieraDx ? [ang.tl, ang.bl] : [ang.tr, ang.br];
    const base = PUNTA_SUL_LATO_CERNIERA ? libero : cerniera;
    const punta = medio(...(PUNTA_SUL_LATO_CERNIERA ? cerniera : libero));
    out.push(poly([base[0], punta, base[1]]));
  }
  if (anta.tipo === "vasistas" || anta.tipo === "anta_ribalta" || (anta.conRibalta && (anta.tipo === "scorrevole" || anta.tipo === "alzante_scorrevole"))) {
    if (PUNTA_SUL_LATO_CERNIERA) out.push(poly([ang.tl, medio(ang.bl, ang.br), ang.tr]));
    else out.push(poly([ang.bl, cima, ang.br]));
  }
  if (anta.tipo === "scorrevole" || anta.tipo === "alzante_scorrevole") {
    // Una freccia nel verso in cui scorre.
    const verso = lato(anta) === "dx" ? 1 : -1;
    const w = (ang.tr[0] - ang.tl[0] + (ang.br[0] - ang.bl[0])) / 2;
    const h = (ang.bl[1] - ang.tl[1] + (ang.br[1] - ang.tr[1])) / 2;
    const cx = (ang.tl[0] + ang.tr[0] + ang.bl[0] + ang.br[0]) / 4;
    const yMed = (ang.tl[1] + ang.tr[1] + ang.bl[1] + ang.br[1]) / 4;
    const lung = w * 0.3;
    const testa = Math.min(w, h) * 0.08;
    const punta = cx + verso * lung;
    out.push(poly([[cx - verso * lung, yMed], [punta, yMed]]));
    out.push(poly([[punta - verso * testa, yMed - testa], [punta, yMed], [punta - verso * testa, yMed + testa]]));
  }
  return out;
}

/** Traversi e inglesine dentro un vetro (x, y, w, h): barre di profilo sopra il vetro. `altezza` è quella del serramento. */
function suddivisioni(d: SerramentoDisegno, vx: number, vy: number, vw: number, vh: number, altezza: number, spessoreTraverso: number): Forma[] {
  const out: Forma[] = [];
  for (const t of d.traversi ?? []) {
    const y = altezza - t.daBassoMm;
    if (y > vy + 60 && y < vy + vh - 60) {
      out.push({ kind: "rect", ruolo: "anta", x: vx, y: y - spessoreTraverso / 2, w: vw, h: spessoreTraverso });
    }
  }
  const g = d.inglesine;
  if (g && (g.colonne > 1 || g.righe > 1)) {
    const largBarra = Math.max(14, Math.min(26, Math.min(vw, vh) * 0.03));
    for (let k = 1; k < g.colonne; k++) {
      out.push({ kind: "rect", ruolo: "inglesina", x: vx + (vw * k) / g.colonne - largBarra / 2, y: vy, w: largBarra, h: vh });
    }
    for (let k = 1; k < g.righe; k++) {
      out.push({ kind: "rect", ruolo: "inglesina", x: vx, y: vy + (vh * k) / g.righe - largBarra / 2, w: vw, h: largBarra });
    }
  }
  return out;
}

function simboli(anta: AntaDisegno, x: number, y: number, w: number, h: number, tratteggio: boolean): Forma[] {
  return simboliDaAngoli(anta, { tl: [x, y], tr: [x + w, y], br: [x + w, y + h], bl: [x, y + h] }, [x + w / 2, y], tratteggio);
}

// ---- Sagome non rettangolari

export interface Contorno { punti: Punto[]; angoli: Angoli; cima: Punto }

/** I dati che descrivono una sagoma non rettangolare. */
export type DatiSagoma = Pick<SerramentoDisegno, "forma" | "frecciaMm" | "altezzaMinoreMm" | "latoMinore">;

/** Spinge verso l'interno di d un poligono convesso (vertici in senso orario sullo schermo). */
export function insetConvesso(p: Punto[], d: number): Punto[] {
  const n = p.length;
  const rette = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return { x: a[0] - (dy / len) * d, y: a[1] + (dx / len) * d, dx, dy };
  });
  return p.map((_, i) => {
    const r1 = rette[(i + n - 1) % n];
    const r2 = rette[i];
    const det = r1.dx * r2.dy - r1.dy * r2.dx || 1e-9;
    const t = ((r2.x - r1.x) * r2.dy - (r2.y - r1.y) * r2.dx) / det;
    return [r1.x + r1.dx * t, r1.y + r1.dy * t] as Punto;
  });
}

export function frecciaArco(d: DatiSagoma, W: number, H: number): number {
  return Math.min(Math.max(d.frecciaMm ?? W / 2, W * 0.12), Math.min(W / 2, H * 0.6));
}

export function altezzeTrapezio(d: DatiSagoma, H: number): { sx: number; dx: number } {
  const minore = Math.min(Math.max(d.altezzaMinoreMm ?? H * 0.6, 150), H - 100);
  return d.latoMinore === "sx" ? { sx: minore, dx: H } : { sx: H, dx: minore };
}

/** Il poligono con i vertici in senso orario sullo schermo, come lo vuole `insetConvesso`. */
function orarioDi(p: Punto[]): Punto[] {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a >= 0 ? p : [...p].reverse();
}

/**
 * Il contorno esterno delle sagome «a curva»: la lunetta (semicerchio), la tonda (cerchio o ovale), il triangolo
 * e l'ogiva (arco a punta: due archi che si incontrano in cima, di serie a triangolo equilatero).
 */
function poligonoBase(d: DatiSagoma, W: number, H: number): Punto[] {
  const passi = 40;
  if (d.forma === "triangolo") return [[W / 2, 0], [W, H], [0, H]];
  if (d.forma === "tonda") {
    return Array.from({ length: 72 }, (_, i) => {
      const t = (2 * Math.PI * i) / 72;
      return [W / 2 + (W / 2) * Math.cos(t), H / 2 + (H / 2) * Math.sin(t)] as Punto;
    });
  }
  if (d.forma === "lunetta") {
    const arco: Punto[] = [];
    for (let i = 1; i < passi; i++) {
      const t = (Math.PI * i) / passi;
      arco.push([W / 2 + (W / 2) * Math.cos(t), H - H * Math.sin(t)]);
    }
    return [[0, H], [W, H], ...arco];
  }
  // ogiva: altezza dell'arco `a` dalla cima all'imposta (di serie 0,866 della larghezza, il triangolo equilatero)
  const a = Math.min(Math.max(d.frecciaMm ?? W * 0.866, W * 0.3), H * 0.85);
  const xc = (W * W / 4 + a * a) / W; // centro dell'arco sinistro: sta sulla linea dell'imposta
  const R = xc;
  const aApice = Math.atan2(-a, W / 2 - xc);
  // L'arco sinistro: dall'imposta (angolo π) fino a un passo prima della cima.
  const sinistra: Punto[] = [];
  for (let i = 0; i < passi; i++) {
    const t = Math.PI + ((aApice + Math.PI) * i) / passi;
    sinistra.push([xc + R * Math.cos(t), a + R * Math.sin(t)]);
  }
  const destra: Punto[] = sinistra.map(([x, y]) => [W - x, y] as Punto); // dall'imposta destra in su
  return [[0, H], [W, H], ...destra, [W / 2, 0], ...[...sinistra].reverse()];
}

/** Il contorno della sagoma, spinto verso l'interno di `inset` mm: da qui si fanno telaio, anta e vetro. */
export function contornoForma(d: DatiSagoma, W: number, H: number, inset: number): Contorno {
  if (d.forma === "arco") {
    const f = frecciaArco(d, W, H);
    const R = (W * W / 4 + f * f) / (2 * f);
    const r = R - inset;
    const meta = W / 2 - inset;
    const yS = R - Math.sqrt(Math.max(0, r * r - meta * meta));
    const bl: Punto = [inset, H - inset];
    const br: Punto = [W - inset, H - inset];
    // L'arco passa per la cima (angolo −90°): parte dall'imposta destra (fra −90° e 0°) e arriva a quella sinistra, simmetrica.
    const aR = Math.min(0, Math.atan2(yS - R, meta));
    const aL = -Math.PI - aR;
    const arco: Punto[] = [];
    const passi = 48;
    for (let i = 0; i <= passi; i++) {
      const a = aR + ((aL - aR) * i) / passi;
      arco.push([W / 2 + r * Math.cos(a), R + r * Math.sin(a)]);
    }
    return { punti: [bl, br, ...arco], angoli: { tl: arco[passi], tr: arco[0], br, bl }, cima: [W / 2, inset] };
  }
  if (d.forma === "lunetta" || d.forma === "tonda" || d.forma === "triangolo" || d.forma === "ogiva") {
    const base = orarioDi(poligonoBase(d, W, H));
    const p = inset > 0 ? insetConvesso(base, inset) : base;
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { punti: p, angoli: { tl: [x0, y0], tr: [x1, y0], br: [x1, y1], bl: [x0, y1] }, cima: [W / 2, y0] };
  }
  // trapezio: TL, TR, BR, BL
  const h = altezzeTrapezio(d, H);
  const base: Punto[] = [[0, H - h.sx], [W, H - h.dx], [W, H], [0, H]];
  const p = inset > 0 ? insetConvesso(base, inset) : base;
  return { punti: p, angoli: { tl: p[0], tr: p[1], br: p[2], bl: p[3] }, cima: medio(p[0], p[1]) };
}

function disegnaSagomato(d: SerramentoDisegno, W: number, H: number, s: ReturnType<typeof spessori>, esterna: boolean): ScenaSerramento {
  // Solo arco e trapezio hanno l'anta apribile; le altre sagome si disegnano come fissi.
  const apribileForma = d.forma === "arco" || d.forma === "trapezio";
  const anta: AntaDisegno = apribileForma ? (d.ante[0] ?? { tipo: "fisso" }) : { tipo: "fisso" };
  const forme: Forma[] = [];
  const c0 = contornoForma(d, W, H, 0);
  const cT = contornoForma(d, W, H, s.telaio);
  const fisso = anta.tipo === "fisso";
  const cA = contornoForma(d, W, H, s.telaio + (fisso ? s.ferma : s.anta));

  forme.push({ kind: "sagoma", ruolo: "telaio", punti: c0.punti, buco: cT.punti });
  forme.push({ kind: "sagoma", ruolo: "anta", punti: cT.punti, buco: cA.punti });
  forme.push({ kind: "sagoma", ruolo: "vetro", punti: cA.punti });
  for (let k = 1; k < (d.vetro?.lastre ?? 0); k++) {
    const dentro = s.telaio + (fisso ? s.ferma : s.anta) + 16 * k;
    forme.push({ kind: "sagoma", ruolo: "distanziatore", punti: contornoForma(d, W, H, dentro).punti, buco: contornoForma(d, W, H, dentro + 6).punti });
  }

  const cernieraDx = lato(anta) === "dx";
  if (anta.tipo === "battente" || anta.tipo === "anta_ribalta") {
    const [a, b] = cernieraDx ? [cT.angoli.tr, cT.angoli.br] : [cT.angoli.tl, cT.angoli.bl];
    const wc = Math.min(18, s.anta * 0.32);
    const hc = Math.min(110, (b[1] - a[1]) * 0.09);
    const xc = cernieraDx ? a[0] - wc * 0.6 : a[0] - wc * 0.4;
    for (const quota of [1 / 6, 5 / 6]) {
      forme.push({ kind: "rect", ruolo: "cerniera", x: xc, y: a[1] + (b[1] - a[1]) * quota - hc / 2, w: wc, h: hc });
    }
  }

  forme.push(...simboliDaAngoli(anta, cA.angoli, cA.cima, esterna));

  const apribile = anta.tipo !== "fisso" && anta.tipo !== "vasistas";
  if ((anta.maniglia ?? apribile) && apribile && !esterna) {
    const liberoASinistra = anta.tipo === "battente" || anta.tipo === "anta_ribalta" ? cernieraDx : lato(anta) === "sx";
    const [a, b] = liberoASinistra ? [cT.angoli.tl, cT.angoli.bl] : [cT.angoli.tr, cT.angoli.br];
    const hm = Math.min(170, (b[1] - a[1]) * 0.17);
    const wm = Math.min(16, s.anta * 0.38);
    const cx = liberoASinistra ? a[0] + s.anta / 2 : a[0] - s.anta / 2;
    const yCentro = (a[1] + b[1]) / 2;
    forme.push({ kind: "rect", ruolo: "maniglia", x: cx - wm / 2, y: yCentro - hm / 2, w: wm, h: hm });
  }

  if (d.soglia) forme.push({ kind: "rect", ruolo: "soglia", x: 0, y: H - s.telaio * 0.55, w: W, h: s.telaio * 0.55 });

  const quote: Quota[] = [{ orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)) }];
  if (d.forma === "arco") {
    quote.push({ orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) });
    // la freccia: dalla cima dell'arco all'imposta, dove l'arco incontra i lati dritti
    quote.push({ orientamento: "v", lato: "sx", da: 0, a: c0.angoli.tl[1], testo: `f ${Math.round(frecciaArco(d, W, H))}` });
  } else if (d.forma === "trapezio") {
    const h = altezzeTrapezio(d, H);
    quote.push({ orientamento: "v", lato: "sx", da: H - h.sx, a: H, testo: String(Math.round(h.sx)), segue: true });
    quote.push({ orientamento: "v", lato: "dx", da: H - h.dx, a: H, testo: String(Math.round(h.dx)), segue: true });
  } else {
    quote.push({ orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) });
  }

  const scena: ScenaSerramento = { larghezza: W, altezza: H, forme, quote, sporgenza: 0 };
  return esterna ? specchiaScena(scena) : scena;
}

/** Vista dall'esterno: tutto specchiato in orizzontale, senza maniglie né cerniere (`tieni`: le lascia). */
export function specchiaScena(scena: ScenaSerramento, tieni = false): ScenaSerramento {
  const W = scena.larghezza;
  const pt = ([x, y]: Punto): Punto => [W - x, y];
  const specchia = (f: Forma): Forma => {
    if (f.kind === "rect") return { ...f, x: W - f.x - f.w };
    if (f.kind === "sagoma") return { ...f, punti: f.punti.map(pt), buco: f.buco?.map(pt) };
    return { ...f, punti: f.punti.map(pt) };
  };
  const quote = scena.quote.map((q): Quota => {
    if (q.orientamento === "h") return { ...q, da: W - q.a, a: W - q.da };
    return q.segue ? { ...q, lato: q.lato === "sx" ? "dx" : "sx" } : q;
  });
  return { ...scena, forme: (tieni ? scena.forme : scena.forme.filter((f) => f.ruolo !== "maniglia" && f.ruolo !== "cerniera")).map(specchia), quote };
}

export function disegnaSerramento(d: SerramentoDisegno): ScenaSerramento {
  const W = Math.max(200, d.larghezzaMm);
  const H = Math.max(200, d.altezzaMm);
  const esterna = d.vista === "esterna";
  const s = spessori(W, H);
  if (d.forma && d.forma !== "rettangolare") return disegnaSagomato(d, W, H, s, esterna);
  if (d.monoblocco) return disegnaMonoblocco(d, W, H, esterna);
  if (d.ante.some((a) => a.tipo === "scorrevole" || a.tipo === "alzante_scorrevole")) return disegnaScorrevole(d, W, H, s, esterna);
  const forme: Forma[] = [];

  // Telaio a Z: l'aletta si vede dall'interno come una cornice attorno al serramento. Senza la misura
  // (ancora «da decidere») se ne disegna una di serie: se no, scelto «a Z» il disegno non cambia.
  const aletta = d.telaio?.tipo === "Z" && !esterna ? Math.max(0, d.telaio.alettaMm ?? ALETTA_DI_SERIE_MM) : 0;
  if (aletta > 0) {
    forme.push({ kind: "sagoma", ruolo: "aletta", punti: rettangoloPunti(-aletta, -aletta, W + 2 * aletta, H + 2 * aletta), buco: rettangoloPunti(0, 0, W, H) });
  }
  const nAnte = Math.max(1, d.ante.length);

  forme.push(...cornice(0, 0, W, H, s.telaio, "telaio"));

  const x0 = s.telaio;
  const larghezzaInterna = W - 2 * s.telaio;
  let yTop = s.telaio;
  const yBottom = H - s.telaio;

  // Sopraluce: una fascia in alto, separata dalle ante da un traverso.
  if (d.sopraluce && d.sopraluce.altezzaMm > 0 && d.sopraluce.altezzaMm < H - 3 * s.telaio) {
    const altezzaSopraluce = d.sopraluce.altezzaMm;
    if (d.sopraluce.apribile) {
      forme.push(...cornice(x0, yTop, larghezzaInterna, altezzaSopraluce, s.anta, "anta"));
      const vx = x0 + s.anta, vy = yTop + s.anta, vw = larghezzaInterna - 2 * s.anta, vh = altezzaSopraluce - 2 * s.anta;
      forme.push({ kind: "rect", ruolo: "vetro", x: vx, y: vy, w: vw, h: vh });
      forme.push(...distanziatori(vx, vy, vw, vh, d.vetro?.lastre));
      forme.push(...simboli({ tipo: "vasistas" }, vx, vy, vw, vh, esterna));
    } else {
      // Fisso: una o più sezioni affiancate, separate da un montante.
      const sezioni = Math.min(4, Math.max(1, Math.round(d.sopraluce.sezioni ?? 1)));
      const montante = s.telaio * 0.8;
      const wSez = (larghezzaInterna - (sezioni - 1) * montante) / sezioni;
      for (let k = 0; k < sezioni; k++) {
        const xs = x0 + k * (wSez + montante);
        forme.push(...cornice(xs, yTop, wSez, altezzaSopraluce, s.ferma, "anta"));
        forme.push({ kind: "rect", ruolo: "vetro", x: xs + s.ferma, y: yTop + s.ferma, w: wSez - 2 * s.ferma, h: altezzaSopraluce - 2 * s.ferma });
        forme.push(...distanziatori(xs + s.ferma, yTop + s.ferma, wSez - 2 * s.ferma, altezzaSopraluce - 2 * s.ferma, d.vetro?.lastre));
        if (k > 0) forme.push({ kind: "rect", ruolo: "telaio", x: xs - montante, y: yTop, w: montante, h: altezzaSopraluce });
      }
    }
    yTop += altezzaSopraluce;
    forme.push({ kind: "rect", ruolo: "telaio", x: x0, y: yTop, w: larghezzaInterna, h: s.telaio * 0.8 });
    yTop += s.telaio * 0.8;
  }

  // Sottoluce: una fascia di vetro fisso sotto le ante, separata da un traverso.
  let yBottomAnte = yBottom;
  let altezzaSottoluce = 0;
  if (d.sottoluce && d.sottoluce.altezzaMm > 0 && d.sottoluce.altezzaMm < yBottom - yTop - 3 * s.telaio) {
    altezzaSottoluce = d.sottoluce.altezzaMm;
    const yFascia = yBottom - altezzaSottoluce;
    forme.push({ kind: "rect", ruolo: "telaio", x: x0, y: yFascia - s.telaio * 0.8, w: larghezzaInterna, h: s.telaio * 0.8 });
    forme.push(...cornice(x0, yFascia, larghezzaInterna, altezzaSottoluce, s.ferma, "anta"));
    forme.push({ kind: "rect", ruolo: "vetro", x: x0 + s.ferma, y: yFascia + s.ferma, w: larghezzaInterna - 2 * s.ferma, h: altezzaSottoluce - 2 * s.ferma });
    forme.push(...distanziatori(x0 + s.ferma, yFascia + s.ferma, larghezzaInterna - 2 * s.ferma, altezzaSottoluce - 2 * s.ferma, d.vetro?.lastre));
    yBottomAnte = yFascia - s.telaio * 0.8;
  }
  const altezzaAnte = yBottomAnte - yTop;
  const manigliePerAnta = maniglieDiSerie(d.ante);
  const larghezze = larghezzeAnte(d.ante, larghezzaInterna);
  const xAnte = larghezze.map((_, i) => x0 + larghezze.slice(0, i).reduce((a, b) => a + b, 0));

  // Prima i profili delle ante e i fissi, poi vetri, montanti, maniglie e simboli: l'ordine è quello di sovrapposizione.
  const vetri: Forma[] = [];
  const maniglie: Forma[] = [];
  const simbolo: Forma[] = [];
  const montanti: Forma[] = [];
  const cerniere: Forma[] = [];

  d.ante.forEach((anta, i) => {
    const x = xAnte[i];
    const larghezzaAnta = larghezze[i];
    if (anta.tipo === "fisso") {
      // undefined conserva la rappresentazione dei vecchi preventivi. L'anta fissa
      // esplicita ha il profilo d'anta, il vetro nel telaio solo il fermavetro.
      const profilo = anta.nelTelaio === false ? s.anta : s.ferma;
      forme.push(...cornice(x, yTop, larghezzaAnta, altezzaAnte, profilo, "anta"));
      vetri.push({ kind: "rect", ruolo: "vetro", x: x + profilo, y: yTop + profilo, w: larghezzaAnta - 2 * profilo, h: altezzaAnte - 2 * profilo });
      vetri.push(...distanziatori(x + profilo, yTop + profilo, larghezzaAnta - 2 * profilo, altezzaAnte - 2 * profilo, d.vetro?.lastre));
      vetri.push(...suddivisioni(d, x + profilo, yTop + profilo, larghezzaAnta - 2 * profilo, altezzaAnte - 2 * profilo, H, s.anta * 1.4));
      return;
    }
    forme.push(...cornice(x, yTop, larghezzaAnta, altezzaAnte, s.anta, "anta"));
    const vx = x + s.anta, vy = yTop + s.anta, vw = larghezzaAnta - 2 * s.anta, vh = altezzaAnte - 2 * s.anta;
    vetri.push({ kind: "rect", ruolo: "vetro", x: vx, y: vy, w: vw, h: vh });
    vetri.push(...distanziatori(vx, vy, vw, vh, d.vetro?.lastre));
    vetri.push(...suddivisioni(d, vx, vy, vw, vh, H, s.anta * 1.4));
    simbolo.push(...simboli(anta, vx, vy, vw, vh, esterna));

    if (anta.tipo === "battente" || anta.tipo === "anta_ribalta" || anta.tipo === "libro") {
      // Due cerniere sul lato delle cerniere, a un sesto e a cinque seste dell'altezza: sullo spessore del profilo.
      const wc = Math.min(18, s.anta * 0.32);
      const hc = Math.min(110, altezzaAnte * 0.09);
      const xc = lato(anta) === "dx" ? x + larghezzaAnta - wc * 0.6 : x - wc * 0.4;
      for (const quota of [1 / 6, 5 / 6]) {
        cerniere.push({ kind: "rect", ruolo: "cerniera", x: xc, y: yTop + altezzaAnte * quota - hc / 2, w: wc, h: hc });
      }
    }

    const apribile = anta.tipo === "battente" || anta.tipo === "anta_ribalta" || anta.tipo === "alzante_scorrevole" || anta.tipo === "scorrevole" || anta.tipo === "libro";
    const conManiglia = manigliePerAnta[i];
    if (conManiglia && apribile && !esterna) {
      // Sul lato libero: per un battente è l'opposto delle cerniere; per uno scorrevole il bordo che avanza.
      const liberoASinistra = anta.tipo === "battente" || anta.tipo === "anta_ribalta" || anta.tipo === "libro" ? lato(anta) === "dx" : lato(anta) === "sx";
      // Di serie a metà altezza dell'anta, come sulla maggior parte dei serramenti.
      const hm = Math.min(170, altezzaAnte * 0.17);
      const wm = Math.min(16, s.anta * 0.38);
      const cx = liberoASinistra ? x + s.anta / 2 : x + larghezzaAnta - s.anta / 2;
      const yCentro = yTop + altezzaAnte / 2;
      maniglie.push({ kind: "rect", ruolo: "maniglia", x: cx - wm / 2, y: yCentro - hm / 2, w: wm, h: hm });
    }
  });

  // Montante fra due campi se almeno uno dei due è fisso: le ante vicine hanno già i loro profili.
  for (let i = 1; i < nAnte; i++) {
    if (d.ante[i - 1].tipo === "fisso" || d.ante[i].tipo === "fisso") {
      const w = s.telaio * 0.8;
      montanti.push({ kind: "rect", ruolo: "telaio", x: xAnte[i] - w / 2, y: yTop, w, h: altezzaAnte });
    }
  }

  forme.push(...montanti, ...vetri, ...cerniere, ...maniglie, ...simbolo);

  if (d.soglia) {
    forme.push({ kind: "rect", ruolo: "soglia", x: 0, y: H - s.telaio * 0.55, w: W, h: s.telaio * 0.55 });
  }

  // Se le ante hanno misure diverse si quotano una per una, sotto la quota totale.
  const antePerMisura = nAnte > 1 && d.ante.some((a) => a.larghezzaMm && a.larghezzaMm > 0);
  const quote: Quota[] = [
    { orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)), livello: antePerMisura ? 1 : 0 },
    { orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) },
  ];
  if (d.sopraluce && d.sopraluce.altezzaMm > 0 && d.sopraluce.altezzaMm < H - 3 * s.telaio) {
    quote.push({ orientamento: "v", lato: "sx", da: 0, a: s.telaio + d.sopraluce.altezzaMm + s.telaio * 0.4, testo: String(Math.round(d.sopraluce.altezzaMm)) });
  }
  if (altezzaSottoluce > 0) quote.push({ orientamento: "v", lato: "sx", da: H - s.telaio - altezzaSottoluce - s.telaio * 0.4, a: H, testo: String(Math.round(altezzaSottoluce)) });
  // La quota del traverso: dal basso fino al suo centro.
  for (const t of d.traversi ?? []) {
    if (t.daBassoMm > 120 && t.daBassoMm < H - 120) quote.push({ orientamento: "v", lato: "sx", da: H - t.daBassoMm, a: H, testo: String(Math.round(t.daBassoMm)) });
  }
  if (antePerMisura) {
    larghezze.forEach((l, i) => quote.push({ orientamento: "h", lato: "sotto", da: xAnte[i], a: xAnte[i] + l, testo: String(Math.round(l)), livello: 0 }));
  }
  const scena: ScenaSerramento = { larghezza: W, altezza: H, forme, quote, sporgenza: aletta };
  return esterna ? specchiaScena(scena) : scena;
}

/**
 * Gli scorrevoli (traslante, alzante, scorrevole parallelo): le ante corrono su due binari e si sovrappongono
 * dove si incrociano. Le ante dei binari davanti stanno sopra quelle di dietro; i fissi stanno dietro.
 */
function disegnaScorrevole(d: SerramentoDisegno, W: number, H: number, s: ReturnType<typeof spessori>, esterna: boolean): ScenaSerramento {
  const forme: Forma[] = [];
  forme.push(...cornice(0, 0, W, H, s.telaio, "telaio"));
  const n = d.ante.length;
  const x0 = s.telaio;
  const interna = W - 2 * s.telaio;
  const binario = Math.min(16, s.telaio * 0.4);
  const yTop = s.telaio + binario;
  const altezza = H - 2 * s.telaio - 2 * binario;
  // Le ante si accavallano di due profili: dove una passa davanti all'altra.
  const sovrapposizione = d.inLinea ? 0 : Math.min(s.anta * 2, interna / n * 0.3);
  const larghezzaAnta = (interna + (n - 1) * sovrapposizione) / n;

  // I due binari, in alto e in basso.
  forme.push({ kind: "rect", ruolo: "binario", x: x0, y: s.telaio, w: interna, h: binario });
  forme.push({ kind: "rect", ruolo: "binario", x: x0, y: H - s.telaio - binario, w: interna, h: binario });

  // Prima le ante del binario di dietro (indici pari), poi quelle davanti (dispari).
  const ordine = [...d.ante.keys()].sort((a, b) => (a % 2) - (b % 2) || a - b);
  for (const i of ordine) {
    const anta = d.ante[i];
    const x = x0 + i * (larghezzaAnta - sovrapposizione);
    if (anta.nelTelaio) {
      // Vetro direttamente nel telaio: niente profilo d'anta, solo il vetro fra i binari.
      forme.push({ kind: "rect", ruolo: "vetro", x, y: yTop, w: larghezzaAnta, h: altezza });
      forme.push(...distanziatori(x, yTop, larghezzaAnta, altezza, d.vetro?.lastre));
      continue;
    }
    forme.push(...cornice(x, yTop, larghezzaAnta, altezza, s.anta, "anta"));
    const vx = x + s.anta, vy = yTop + s.anta, vw = larghezzaAnta - 2 * s.anta, vh = altezza - 2 * s.anta;
    forme.push({ kind: "rect", ruolo: "vetro", x: vx, y: vy, w: vw, h: vh });
    forme.push(...distanziatori(vx, vy, vw, vh, d.vetro?.lastre));
    forme.push(...suddivisioni(d, vx, vy, vw, vh, H, s.anta * 1.4));
    if (anta.tipo === "fisso") continue;
    forme.push(...simboli(anta, vx, vy, vw, vh, esterna));
    if ((anta.maniglia ?? true) && !esterna) {
      // Sul bordo che avanza.
      const liberoASinistra = lato(anta) === "sx";
      const hm = Math.min(170, altezza * 0.17);
      const wm = Math.min(16, s.anta * 0.38);
      const cx = liberoASinistra ? x + s.anta / 2 : x + larghezzaAnta - s.anta / 2;
      forme.push({ kind: "rect", ruolo: "maniglia", x: cx - wm / 2, y: yTop + altezza / 2 - hm / 2, w: wm, h: hm });
    }
  }

  if (d.soglia) forme.push({ kind: "rect", ruolo: "soglia", x: 0, y: H - s.telaio * 0.55, w: W, h: s.telaio * 0.55 });

  // Scomparsa o su parete: accanto al vano il muro dove va l'anta aperta, con il suo contorno tratteggiato.
  let sfondo = 0;
  if (d.scorrimento) {
    const P = larghezzaAnta;
    const xp = d.scorrimento.lato === "dx" ? W : -P;
    forme.push({ kind: "rect", ruolo: "parete", x: xp, y: -s.telaio, w: P, h: H + 2 * s.telaio });
    if (d.scorrimento.tipo === "su_parete") {
      // Davanti alla parete corre il binario, e l'anta aperta resta in vista.
      forme.push({ kind: "rect", ruolo: "binario", x: xp, y: s.telaio * 0.4, w: P, h: binario });
      forme.push({ kind: "rect", ruolo: "binario", x: xp, y: H - s.telaio * 0.4 - binario, w: P, h: binario });
    }
    const x1 = xp + P * 0.04, x2 = xp + P * 0.96;
    forme.push({ kind: "poly", ruolo: "simbolo", tratteggio: true, punti: [[x1, yTop], [x2, yTop], [x2, yTop + altezza], [x1, yTop + altezza], [x1, yTop]] });
    sfondo = P;
  }
  const quote: Quota[] = [
    { orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)) },
    { orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) },
  ];
  const scena: ScenaSerramento = { larghezza: W, altezza: H, forme, quote, sporgenza: 0, ...(sfondo > 0 ? { sfondo } : {}) };
  return esterna ? specchiaScena(scena) : scena;
}

/** Il monoblocco: cassonetto sopra, serramento sotto; l'altezza totale comprende il cassonetto. */
function disegnaMonoblocco(d: SerramentoDisegno, W: number, H: number, esterna: boolean): ScenaSerramento {
  const mono = d.monoblocco ?? {};
  const cassonetto = Math.min(Math.max(mono.cassonettoMm ?? 200, 120), Math.max(120, H - 300));
  const hFinestra = H - cassonetto;
  const finestra = disegnaSerramento({ ...d, monoblocco: undefined, telaio: undefined, altezzaMm: hFinestra });
  const s = spessori(W, hFinestra);

  const sposta = (f: Forma): Forma => {
    const su = ([x, y]: Punto): Punto => [x, y + cassonetto];
    if (f.kind === "rect") return { ...f, y: f.y + cassonetto };
    if (f.kind === "sagoma") return { ...f, punti: f.punti.map(su), buco: f.buco?.map(su) };
    return { ...f, punti: f.punti.map(su) };
  };

  const forme: Forma[] = [{ kind: "rect", ruolo: "cassonetto", x: 0, y: 0, w: W, h: cassonetto }];
  const tapparella = mono.tapparella === false || mono.tapparella === undefined ? null : mono.tapparella;
  if (!esterna) {
    // Il pannello d'ispezione sul davanti del cassonetto.
    forme.push({ kind: "rect", ruolo: "ispezione", x: W * 0.05, y: cassonetto * 0.2, w: W * 0.9, h: cassonetto * 0.6 });
    if (tapparella) {
      if (tapparella.motore) {
        const dm = cassonetto * 0.36;
        forme.push({ kind: "rect", ruolo: "motore", x: W * 0.05 + dm * 0.4, y: cassonetto / 2 - dm / 2, w: dm, h: dm });
      } else {
        // Il cintino: la cinghia che scende di lato.
        forme.push({ kind: "rect", ruolo: "cintino", x: s.telaio * 0.35, y: cassonetto * 0.5, w: Math.min(16, s.telaio * 0.4), h: cassonetto * 0.5 + 260 });
      }
    }
  }
  forme.push(...finestra.forme.map(sposta));

  const pct = tapparella ? Math.min(100, Math.max(0, tapparella.abbassataPct ?? 0)) : 0;
  if (tapparella && pct > 0) {
    forme.push({ kind: "rect", ruolo: "tapparella", x: s.telaio, y: cassonetto + s.telaio, w: W - 2 * s.telaio, h: ((hFinestra - 2 * s.telaio) * pct) / 100 });
  }

  const quote: Quota[] = [
    { orientamento: "h", lato: "sotto", da: 0, a: W, testo: String(Math.round(W)) },
    { orientamento: "v", lato: "dx", da: 0, a: H, testo: String(Math.round(H)) },
    { orientamento: "v", lato: "sx", da: 0, a: cassonetto, testo: String(Math.round(cassonetto)) },
    { orientamento: "v", lato: "sx", da: cassonetto, a: H, testo: String(Math.round(hFinestra)) },
  ];
  return { larghezza: W, altezza: H, forme, quote, sporgenza: 0 };
}

/** Le tipologie del listino con la loro composizione di partenza: da qui si cambia apertura e misure. */
export interface TipologiaDisegno {
  id: string;
  nome: string;
  larghezzaMm: number;
  altezzaMm: number;
  ante: AntaDisegno[];
  soglia?: boolean;
  forma?: FormaSerramento;
  frecciaMm?: number;
  altezzaMinoreMm?: number;
  latoMinore?: Lato;
  monoblocco?: MonoblocoDisegno;
  scorrimento?: ScorrimentoDisegno;
  inLinea?: boolean;
  /** Sopraluce e sottoluce di partenza; senza altezza si prende un quarto (sopraluce) o un quinto (sottoluce) dell'altezza. */
  sopraluce?: { altezzaMm?: number; sezioni?: number; apribile?: boolean };
  sottoluce?: { altezzaMm?: number };
  traversi?: SerramentoDisegno["traversi"];
  inglesine?: SerramentoDisegno["inglesine"];
}

/** Un tipo di disegno composto a mano (articolo con «Personalizzata»): misure di partenza e ante. */
export interface DefinizioneDisegno {
  larghezzaMm?: number;
  altezzaMm?: number;
  ante: AntaDisegno[];
  soglia?: boolean;
  scorrimento?: ScorrimentoDisegno;
  inLinea?: boolean;
  sopraluce?: { altezzaMm?: number; sezioni?: number; apribile?: boolean };
  sottoluce?: { altezzaMm?: number };
  traversi?: SerramentoDisegno["traversi"];
  inglesine?: SerramentoDisegno["inglesine"];
}

export const TIPOLOGIE_DISEGNO: TipologiaDisegno[] = [
  { id: "finestra_1_anta", nome: "Finestra 1 Anta", larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo: "anta_ribalta", lato: "dx" }] },
  { id: "finestra_2_ante", nome: "Finestra 2 Ante", larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }] },
  { id: "finestra_3_ante", nome: "Finestra 3 Ante", larghezzaMm: 1800, altezzaMm: 1400, ante: [{ tipo: "anta_ribalta", lato: "sx", maniglia: true }, { tipo: "battente", lato: "dx", maniglia: true }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }] },
  { id: "finestra_wasistas", nome: "Finestra Wasistas", larghezzaMm: 800, altezzaMm: 600, ante: [{ tipo: "vasistas" }] },
  { id: "fisso", nome: "Fisso nel telaio", larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo: "fisso" }] },
  { id: "porta_finestra_1_anta", nome: "Porta Finestra 1 Anta", larghezzaMm: 900, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "dx" }], soglia: true },
  { id: "porta_finestra_2_ante", nome: "Porta Finestra 2 Ante", larghezzaMm: 1300, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], soglia: true },
  { id: "porta_finestra_3_ante", nome: "Porta Finestra 3 Ante", larghezzaMm: 2100, altezzaMm: 2200, ante: [{ tipo: "anta_ribalta", lato: "sx", maniglia: true }, { tipo: "battente", lato: "dx", maniglia: true }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], soglia: true },
  { id: "traslante_4_ante", nome: "Traslante scorrevole 4 ante", larghezzaMm: 3200, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true }, { tipo: "scorrevole", lato: "dx", maniglia: true }, { tipo: "fisso" }], soglia: true },
  { id: "alzante_as_fa", nome: "Alzante scorrevole AS + FA", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "alzante_scorrevole", lato: "dx", maniglia: true }, { tipo: "fisso" }], soglia: true },
  { id: "portoncino_2_ante", nome: "Portoncino 2 Ante", larghezzaMm: 1300, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "battente", lato: "dx", maniglia: true }], soglia: true },
  { id: "portoncino_1_anta", nome: "Portoncino 1 Anta", larghezzaMm: 1000, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "dx", maniglia: true }], soglia: true },
  { id: "alzante_fa_as_as_fa", nome: "Alzante scorrevole FA + AS + AS + FA", larghezzaMm: 4000, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "alzante_scorrevole", lato: "sx", maniglia: true }, { tipo: "alzante_scorrevole", lato: "dx", maniglia: true }, { tipo: "fisso" }], soglia: true },
  { id: "finestra_arco", nome: "Finestra ad arco (tutto sesto)", larghezzaMm: 900, altezzaMm: 1600, ante: [{ tipo: "anta_ribalta", lato: "dx" }], forma: "arco" },
  { id: "finestra_arco_ribassato", nome: "Finestra ad arco ribassato", larghezzaMm: 1200, altezzaMm: 1500, ante: [{ tipo: "fisso" }], forma: "arco", frecciaMm: 300 },
  { id: "finestra_trapezio", nome: "Finestra trapezio", larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "fisso" }], forma: "trapezio", altezzaMinoreMm: 800, latoMinore: "dx" },
  { id: "finestra_1_anta_sopraluce", nome: "Finestra 1 anta con sopraluce", larghezzaMm: 800, altezzaMm: 1800, ante: [{ tipo: "anta_ribalta", lato: "dx" }], sopraluce: {} },
  { id: "finestra_2_ante_sopraluce", nome: "Finestra 2 ante con sopraluce", larghezzaMm: 1200, altezzaMm: 1800, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], sopraluce: {} },
  { id: "finestra_2_ante_sopraluce_2_sezioni", nome: "Finestra 2 ante con sopraluce a due sezioni", larghezzaMm: 1400, altezzaMm: 1800, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], sopraluce: { sezioni: 2 } },
  { id: "finestra_3_ante_sopraluce", nome: "Finestra 3 ante con sopraluce", larghezzaMm: 1800, altezzaMm: 1800, ante: [{ tipo: "anta_ribalta", lato: "sx", maniglia: true }, { tipo: "battente", lato: "dx", maniglia: true }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], sopraluce: {} },
  { id: "porta_finestra_2_ante_sopraluce", nome: "Porta finestra 2 ante con sopraluce", larghezzaMm: 1300, altezzaMm: 2600, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], soglia: true, sopraluce: {} },
  { id: "finestra_1_anta_sottoluce", nome: "Finestra 1 anta con sottoluce", larghezzaMm: 800, altezzaMm: 1800, ante: [{ tipo: "anta_ribalta", lato: "dx" }], sottoluce: {} },
  { id: "finestra_2_ante_sottoluce", nome: "Finestra 2 ante con sottoluce", larghezzaMm: 1200, altezzaMm: 1800, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], sottoluce: {} },
  { id: "porta_finestra_libro_3_ante", nome: "Porta finestra a libro 3 ante", larghezzaMm: 3000, altezzaMm: 2200, ante: [{ tipo: "libro", lato: "sx" }, { tipo: "libro", lato: "dx" }, { tipo: "libro", lato: "sx", maniglia: true }], soglia: true },
  { id: "porta_finestra_libro_4_ante", nome: "Porta finestra a libro 4 ante", larghezzaMm: 4000, altezzaMm: 2200, ante: [{ tipo: "libro", lato: "sx" }, { tipo: "libro", lato: "dx", maniglia: true }, { tipo: "libro", lato: "sx" }, { tipo: "libro", lato: "dx" }], soglia: true },
  { id: "scorri_ribalta_patio", nome: "Scorri-ribalta PATIO", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true, conRibalta: true }], soglia: true },
  { id: "finestra_scorrevole_2_ante", nome: "Finestra scorrevole 2 ante", larghezzaMm: 1600, altezzaMm: 1200, ante: [{ tipo: "scorrevole", lato: "sx", maniglia: true }, { tipo: "scorrevole", lato: "dx", maniglia: true }] },
  { id: "porta_finestra_scorrevole_2_ante", nome: "Porta finestra scorrevole 2 ante", larghezzaMm: 1600, altezzaMm: 2200, soglia: true, ante: [{ tipo: "scorrevole", lato: "sx", maniglia: true }, { tipo: "scorrevole", lato: "dx", maniglia: true }] },
  { id: "alzante_scomparsa", nome: "Alzante scorrevole a scomparsa", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "alzante_scorrevole", lato: "dx", maniglia: true }], soglia: true, scorrimento: { tipo: "scomparsa", lato: "dx" } },
  { id: "traslante_fisso_telaio", nome: "Traslante scorrevole con fisso nel telaio", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "fisso", nelTelaio: true }, { tipo: "scorrevole", lato: "sx", maniglia: true }], soglia: true },
  { id: "traslante_fisso_anta", nome: "Traslante scorrevole con fisso nell'anta", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true }], soglia: true },
  { id: "traslante_su_parete", nome: "Traslante scorrevole su parete", larghezzaMm: 1800, altezzaMm: 2200, ante: [{ tipo: "scorrevole", lato: "dx", maniglia: true }], soglia: true, scorrimento: { tipo: "su_parete", lato: "dx" } },
  { id: "slide", nome: "Slide (fisso + anta scorrevole)", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true }], soglia: true },
  { id: "slide_plus", nome: "Slide Plus (fisso + 2 ante scorrevoli)", larghezzaMm: 3600, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true }, { tipo: "scorrevole", lato: "dx", maniglia: true }], soglia: true },
  { id: "smart_slide", nome: "Smart Slide (in linea: fisso + anta scorrevole)", larghezzaMm: 2400, altezzaMm: 2200, ante: [{ tipo: "fisso" }, { tipo: "scorrevole", lato: "sx", maniglia: true }], soglia: true, inLinea: true },
  { id: "finestra_lunetta", nome: "Finestra a lunetta (semicerchio)", larghezzaMm: 1200, altezzaMm: 600, ante: [{ tipo: "fisso" }], forma: "lunetta" },
  { id: "finestra_tonda", nome: "Finestra tonda / ovale", larghezzaMm: 900, altezzaMm: 900, ante: [{ tipo: "fisso" }], forma: "tonda" },
  { id: "finestra_triangolo", nome: "Finestra triangolare", larghezzaMm: 1200, altezzaMm: 1000, ante: [{ tipo: "fisso" }], forma: "triangolo" },
  { id: "finestra_ogiva", nome: "Finestra ogivale (arco a punta)", larghezzaMm: 800, altezzaMm: 1600, ante: [{ tipo: "fisso" }], forma: "ogiva" },
  { id: "monoblocco_2_ante", nome: "Monoblocco 2 ante", larghezzaMm: 1200, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx", maniglia: true }], monoblocco: { cassonettoMm: 200, tapparella: { motore: false } } },
  { id: "monoblocco_1_anta", nome: "Monoblocco 1 anta", larghezzaMm: 900, altezzaMm: 1500, ante: [{ tipo: "anta_ribalta", lato: "dx" }], monoblocco: { cassonettoMm: 200, tapparella: { motore: true } } },
  { id: "finestra_4_ante", nome: "Finestra 4 ante (2+2)", larghezzaMm: 2400, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }, { tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }] },
  { id: "porta_finestra_4_ante", nome: "Porta finestra 4 ante (2+2)", larghezzaMm: 2600, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }, { tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }], soglia: true },
  { id: "finestra_2_ante_fisso_sx", nome: "Finestra 2 ante con fisso laterale SX", larghezzaMm: 1800, altezzaMm: 1400, ante: [{ tipo: "fisso", nelTelaio: true }, { tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }] },
  { id: "finestra_2_ante_fisso_dx", nome: "Finestra 2 ante con fisso laterale DX", larghezzaMm: 1800, altezzaMm: 1400, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }, { tipo: "fisso", nelTelaio: true }] },
  { id: "finestra_fisso_centrale", nome: "Finestra con fisso centrale e 2 ante laterali", larghezzaMm: 1800, altezzaMm: 1400, ante: [{ tipo: "anta_ribalta", lato: "sx" }, { tipo: "fisso", nelTelaio: true }, { tipo: "anta_ribalta", lato: "dx" }] },
  { id: "porta_finestra_2_ante_fisso_sx", nome: "Porta finestra 2 ante con fisso laterale SX", larghezzaMm: 2100, altezzaMm: 2200, ante: [{ tipo: "fisso", nelTelaio: true }, { tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }], soglia: true },
  { id: "porta_finestra_2_ante_fisso_dx", nome: "Porta finestra 2 ante con fisso laterale DX", larghezzaMm: 2100, altezzaMm: 2200, ante: [{ tipo: "battente", lato: "sx" }, { tipo: "anta_ribalta", lato: "dx" }, { tipo: "fisso", nelTelaio: true }], soglia: true },
  { id: "fisso_anta", nome: "Fisso nell'anta", larghezzaMm: 800, altezzaMm: 1400, ante: [{ tipo: "fisso", nelTelaio: false }] },
];
