/**
 * Forme da disegnare (in cm, coordinate della pianta): il corpo delle pareti,
 * il simbolo delle porte e delle finestre, il centro delle stanze.
 */
import type { Apertura, Muro, Pianta, Punto, StatoElemento } from "./adattatore";
import { direzione, lunghezzaMuro, puntoSulMuro, uguali } from "./geometria";
import type { Vista } from "./comandi";
import { anteDi, eAvvolgibile, misureOscurante, misureZanzariera, sistemaDi } from "../../../../shared/planimetrie/serramenti.ts";

/** Poligono del corpo della parete; si allunga di mezzo spessore dove tocca un'altra parete, così gli angoli si chiudono. */
export function corpoParete(muro: Muro, pianta: Pianta): Punto[] {
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const h = muro.spessore / 2;
  const tocca = (p: Punto) => pianta.muri.some((m) => m.id !== muro.id && (uguali(m.p1, p) || uguali(m.p2, p)));
  const e1 = tocca(muro.p1) ? h : 0;
  const e2 = tocca(muro.p2) ? h : 0;
  const a = { x: muro.p1.x - u.x * e1, y: muro.p1.y - u.y * e1 };
  const b = { x: muro.p2.x + u.x * e2, y: muro.p2.y + u.y * e2 };
  return [
    { x: a.x + n.x * h, y: a.y + n.y * h },
    { x: b.x + n.x * h, y: b.y + n.y * h },
    { x: b.x - n.x * h, y: b.y - n.y * h },
    { x: a.x - n.x * h, y: a.y - n.y * h },
  ];
}

export const punti = (ps: Punto[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");

/** Il buco nella parete dove sta l'apertura (un po' più spesso, per coprire il bordo). */
export function vanoApertura(a: Apertura, muro: Muro): Punto[] {
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza / 2;
  const h = muro.spessore / 2 + 0.6;
  return [
    { x: c.x - u.x * w + n.x * h, y: c.y - u.y * w + n.y * h },
    { x: c.x + u.x * w + n.x * h, y: c.y + u.y * w + n.y * h },
    { x: c.x + u.x * w - n.x * h, y: c.y + u.y * w - n.y * h },
    { x: c.x - u.x * w - n.x * h, y: c.y - u.y * w - n.y * h },
  ];
}

/**
 * Simbolo della porta: l'anta aperta a 90° e l'arco che fa aprendosi.
 * `lato` sinistra = a sinistra guardando da p1 verso p2.
 */
export function simboloPorta(a: Apertura, muro: Muro): { anta: [Punto, Punto]; arco: string } {
  const u = direzione(muro);
  const sinistra = { x: u.y, y: -u.x };
  const n = a.verso.lato === "sinistra" ? sinistra : { x: -sinistra.x, y: -sinistra.y };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza;
  const segno = a.verso.cerniera === "inizio" ? -1 : 1;
  const faccia = muro.spessore / 2;
  const cerniera = { x: c.x + u.x * (segno * w) / 2 + n.x * faccia, y: c.y + u.y * (segno * w) / 2 + n.y * faccia };
  const punta = { x: cerniera.x + n.x * w, y: cerniera.y + n.y * w };
  const battuta = { x: cerniera.x - u.x * segno * w, y: cerniera.y - u.y * segno * w };
  // verso dell'arco: da punta a battuta attorno alla cerniera
  const cross = (punta.x - cerniera.x) * (battuta.y - cerniera.y) - (punta.y - cerniera.y) * (battuta.x - cerniera.x);
  const sweep = cross > 0 ? 1 : 0;
  return { anta: [cerniera, punta], arco: `M ${punta.x} ${punta.y} A ${w} ${w} 0 0 ${sweep} ${battuta.x} ${battuta.y}` };
}

/** Simbolo della finestra: due linee del vetro dentro il vano. */
export function simboloFinestra(a: Apertura, muro: Muro): Array<[Punto, Punto]> {
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza / 2;
  const linea = (off: number): [Punto, Punto] => [
    { x: c.x - u.x * w + n.x * off, y: c.y - u.y * w + n.y * off },
    { x: c.x + u.x * w + n.x * off, y: c.y + u.y * w + n.y * off },
  ];
  const h = muro.spessore / 2;
  return [linea(-h), linea(-2), linea(2), linea(h)];
}

/** Un segno del simbolo: linea piena, linea tratteggiata o arco (path SVG). */
export type SegnoSerramento =
  | { tipo: "linea"; p: Punto; q: Punto; spesso?: boolean; tratteggio?: boolean }
  | { tipo: "arco"; d: string; tratteggio?: boolean };

/**
 * Il simbolo di una porta o finestra secondo il sistema e le ante:
 * ante a battente (un arco per anta), scorrevole (anta sul binario e posizione aperta tratteggiata),
 * scorrevole a scomparsa (la tasca dentro il muro), a libro (zig-zag), finestre con i montanti fra le ante.
 */
export function segniSerramento(a: Apertura, muro: Muro, fuori: 1 | -1 = 1): SegnoSerramento[] {
  return [...segniSistema(a, muro), ...segniOscurante(a, muro, fuori), ...segniZanzariera(a, muro, fuori)];
}

/**
 * La zanzariera sta sul filo interno (dalla parte opposta all'esterno): una linea a punti lungo il vano;
 * il plissé ha uno zig-zag a un capo, il rullo una piccola cassetta in alto, il battente un'anta aperta di 45°.
 */
export function segniZanzariera(a: Apertura, muro: Muro, fuori: 1 | -1 = 1): SegnoSerramento[] {
  const z = misureZanzariera(a);
  if (!z) return [];
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza;
  const h = muro.spessore / 2;
  const al = (s: number, off: number): Punto => ({ x: c.x + u.x * s + n.x * off * -fuori, y: c.y + u.y * s + n.y * off * -fuori });
  const out: SegnoSerramento[] = [];
  const y = h + 2;
  out.push({ tipo: "linea", p: al(-w / 2, y), q: al(w / 2, y), tratteggio: true });
  if (z.tipo === "plisse") {
    const pt: Punto[] = [];
    for (let i = 0; i <= 8; i++) pt.push(al(w / 2 - (Math.min(w / 3, 30) * i) / 8, y + (i % 2 ? 2 : -2)));
    for (let i = 0; i < pt.length - 1; i++) out.push({ tipo: "linea", p: pt[i], q: pt[i + 1] });
  } else if (z.tipo === "verticale") {
    out.push({ tipo: "linea", p: al(-w / 2, y - 3), q: al(w / 2, y - 3), spesso: true }, { tipo: "linea", p: al(-w / 2, y + 3), q: al(w / 2, y + 3), spesso: true });
  } else if (z.tipo === "battente") {
    out.push({ tipo: "linea", p: al(-w / 2, y), q: al(-w / 2 + w * 0.7, y + w * 0.7), spesso: false });
  } else {
    for (const s of [-w / 2, w / 2]) out.push({ tipo: "linea", p: al(s, y - 2), q: al(s, y + 2), spesso: true });
  }
  return out;
}

/**
 * L'oscurante in pianta (`fuori` = da che parte della normale sta l'esterno):
 * il cassonetto è un rettangolo tratteggiato sopra il vano (dentro il muro, o sul prospetto se è esterno),
 * persiane e scuri sono ante aperte a 90° fuori o dentro, tapparelle e veneziane due piccole guide ai lati.
 */
export function segniOscurante(a: Apertura, muro: Muro, fuori: 1 | -1 = 1): SegnoSerramento[] {
  const mo = misureOscurante(a);
  if (!mo) return [];
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza;
  const h = muro.spessore / 2;
  const al = (s: number, off: number): Punto => ({ x: c.x + u.x * s + n.x * off * fuori, y: c.y + u.y * s + n.y * off * fuori });
  const out: SegnoSerramento[] = [];
  const tratt = (p: Punto, q: Punto) => out.push({ tipo: "linea", p, q, tratteggio: true });
  if (mo.cassonetto) {
    const k = mo.cassonetto;
    const [da, a2] = k.tipo === "esterno" ? [h, h + k.altezza] : [-(h - 1), Math.min(h - 1, -(h - 1) + k.profondita)];
    tratt(al(-w / 2, da), al(w / 2, da));
    tratt(al(-w / 2, a2), al(w / 2, a2));
    tratt(al(-w / 2, da), al(-w / 2, a2));
    tratt(al(w / 2, da), al(w / 2, a2));
  }
  if (eAvvolgibile(mo.tipo)) {
    // guide laterali, sul filo esterno
    for (const s of [-w / 2, w / 2]) out.push({ tipo: "linea", p: al(s, h), q: al(s, h + 4), spesso: true });
    return out;
  }
  // persiana (fuori) e scuri (dentro): ante aperte a 90° ai lati del vano
  const verso = mo.tipo === "persiana" ? 1 : -1;
  const foglia = w / mo.ante;
  const sinistra = Math.ceil(mo.ante / 2), destra = mo.ante - sinistra;
  for (let i = 0; i < sinistra; i++) out.push({ tipo: "linea", p: al(-w / 2 - i * 2, verso * h), q: al(-w / 2 - i * 2, verso * (h + foglia)) });
  for (let i = 0; i < destra; i++) out.push({ tipo: "linea", p: al(w / 2 + i * 2, verso * h), q: al(w / 2 + i * 2, verso * (h + foglia)) });
  return out;
}

function segniSistema(a: Apertura, muro: Muro): SegnoSerramento[] {
  const u = direzione(muro);
  const n = { x: -u.y, y: u.x };
  const c = puntoSulMuro(muro, a.posizione);
  const w = a.larghezza;
  const sistema = sistemaDi(a);
  const ante = Math.max(1, anteDi(a));
  const al = (s: number, off: number): Punto => ({ x: c.x + u.x * s + n.x * off, y: c.y + u.y * s + n.y * off });
  const h = muro.spessore / 2;
  const out: SegnoSerramento[] = [];
  const x0 = -w / 2;
  if (a.versoDaVerificare && ["battente", "anta_ribalta", "vasistas"].includes(sistema)) {
    if (a.tipo === "porta") return [{ tipo: "linea", p: al(x0, 0), q: al(w / 2, 0), tratteggio: true }];
    return simboloFinestra(a, muro).map(([p, q]) => ({ tipo: "linea" as const, p, q, tratteggio: true }));
  }
  if (a.tipo === "finestra") {
    for (const [p, q] of simboloFinestra(a, muro)) out.push({ tipo: "linea", p, q });
    // montanti fra le ante
    for (let i = 1; i < ante; i++) out.push({ tipo: "linea", p: al(x0 + (w * i) / ante, -2), q: al(x0 + (w * i) / ante, 2), spesso: true });
    if (sistema === "scorrevole") for (let i = 0; i < ante; i++) out.push({ tipo: "linea", p: al(x0 + (w * i) / ante + 3, i % 2 ? 4 : -4), q: al(x0 + (w * (i + 1)) / ante - 3, i % 2 ? 4 : -4), spesso: true });
    return out;
  }
  if (sistema === "fisso") return simboloFinestra(a, muro).slice(1, 3).map(([p, q]) => ({ tipo: "linea" as const, p, q }));
  if (sistema === "scorrevole_scomparsa") {
    // la tasca: un rettangolo tratteggiato dentro il muro, a lato del vano (dalla parte dove c'è più muro), con l'anta aperta
    const lungo = lunghezzaMuro(muro);
    const dopo = lungo - (a.posizione + w / 2) >= a.posizione - w / 2;
    const dir = dopo ? 1 : -1, s0 = dir * (w / 2), s1 = dir * (w / 2 + w + 5);
    const k = h - 1;
    out.push({ tipo: "linea", p: al(s0, k), q: al(s1, k), tratteggio: true }, { tipo: "linea", p: al(s0, -k), q: al(s1, -k), tratteggio: true }, { tipo: "linea", p: al(s1, k), q: al(s1, -k), tratteggio: true });
    out.push({ tipo: "linea", p: al(-w / 2, 0), q: al(w / 2, 0), spesso: true });
    out.push({ tipo: "linea", p: al(dir * (w / 2 + 5), 0), q: al(dir * (w / 2 + w), 0), spesso: true, tratteggio: true });
    return out;
  }
  if (sistema === "scorrevole" || sistema === "alzante_scorrevole") {
    const n2 = sistema === "alzante_scorrevole" ? Math.max(2, ante) : ante;
    const passo = w / n2;
    for (let i = 0; i < n2; i++) {
      // le ante scorrono su binari diversi: una davanti e una dietro, un po' sovrapposte
      const off = i % 2 ? h + 3 : -(h + 3);
      out.push({ tipo: "linea", p: al(x0 + passo * i + 1, off), q: al(x0 + passo * (i + 1) + (i < n2 - 1 ? 6 : -1), off), spesso: true });
    }
    // posizione aperta: la prima anta tratteggiata oltre il vano, e una freccia
    out.push({ tipo: "linea", p: al(w / 2 + 2, -(h + 3)), q: al(w / 2 + passo, -(h + 3)), spesso: true, tratteggio: true });
    out.push({ tipo: "linea", p: al(w / 2 - 6, -(h + 9)), q: al(w / 2 + 14, -(h + 9)) });
    out.push({ tipo: "linea", p: al(w / 2 + 14, -(h + 9)), q: al(w / 2 + 8, -(h + 12)) }, { tipo: "linea", p: al(w / 2 + 14, -(h + 9)), q: al(w / 2 + 8, -(h + 6)) });
    return out;
  }
  if (sistema === "libro") {
    // ante ripiegate: zig-zag fra le due facce
    const passo = w / Math.max(2, ante * 2);
    const pts: Punto[] = [];
    for (let i = 0; i <= Math.max(2, ante * 2); i++) pts.push(al(x0 + passo * i, i % 2 ? h * 0.9 : -h * 0.9));
    for (let i = 0; i < pts.length - 1; i++) out.push({ tipo: "linea", p: pts[i], q: pts[i + 1], spesso: true });
    return out;
  }
  // battente, anta-ribalta, vasistas: un arco per ogni anta
  const base = { ...a, tipo: a.tipo };
  const foglie = ante;
  for (let i = 0; i < foglie; i++) {
    const parte = w / foglie;
    const cerniera: "inizio" | "fine" = foglie === 1 ? a.verso.cerniera : i < foglie / 2 ? "inizio" : "fine";
    const f: Apertura = { ...base, posizione: a.posizione - w / 2 + parte * (i + 0.5), larghezza: parte, verso: { cerniera, lato: a.verso.lato } };
    const { anta, arco } = simboloPorta(f, muro);
    out.push({ tipo: "linea", p: anta[0], q: anta[1], spesso: true }, { tipo: "arco", d: arco, tratteggio: a.tipo === "portafinestra" });
  }
  return out;
}

export function baricentro(poligono: Punto[]): Punto {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poligono.length; i++) {
    const p = poligono[i];
    const q = poligono[(i + 1) % poligono.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return { x: poligono.reduce((s, p) => s + p.x, 0) / poligono.length, y: poligono.reduce((s, p) => s + p.y, 0) / poligono.length };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

/** Colori: nero l'esistente; nel progetto giallo le demolizioni e rosso il nuovo. */
export function colorePareti(stato: StatoElemento, vista: Vista): { riempimento: string; bordo: string } {
  if (vista === "progetto" && stato === "da_demolire") return { riempimento: "#facc15", bordo: "#a16207" };
  if (stato === "nuovo") return { riempimento: "#dc2626", bordo: "#991b1b" };
  return { riempimento: "#334155", bordo: "#1e293b" };
}

export const COLORE_STANZA: Record<string, string> = {
  soggiorno: "#fef3c7",
  cucina: "#ffedd5",
  camera: "#e0e7ff",
  bagno: "#cffafe",
  disimpegno: "#f1f5f9",
  ripostiglio: "#f5f5f4",
  ingresso: "#f1f5f9",
  studio: "#ede9fe",
  lavanderia: "#e0f2fe",
  balcone: "#dcfce7",
  giardino: "#d9f99d",
  altro: "#f8fafc",
};

/** Lotto e aree esterne sulla tela: colore, bordo e motivo (definito nella tela). */
export const STILE_AREA: Record<string, { fill: string; bordo: string; motivo?: string }> = {
  lotto: { fill: "none", bordo: "#dc2626" },
  prato: { fill: "#d9f0c4", bordo: "#86b56b", motivo: "pl-prato" },
  pavimentato: { fill: "#ece6dc", bordo: "#b8ad9c", motivo: "pl-lastre" },
  vialetto: { fill: "#e7e2d8", bordo: "#a8a090", motivo: "pl-lastre" },
  ghiaia: { fill: "#e5e5e0", bordo: "#a3a39a", motivo: "pl-ghiaia" },
  parcheggio: { fill: "#d6d6d6", bordo: "#8c8c8c" },
  aiuola: { fill: "#b9dc9b", bordo: "#6a9a4f", motivo: "pl-prato" },
  orto: { fill: "#e3d2b4", bordo: "#a0835a", motivo: "pl-orto" },
};

/** Il punto a metà parete, spostato di `off` cm a sinistra (guardando da p1 a p2). */
export function metaParete(m: Pick<Muro, "p1" | "p2">, off = 0): Punto {
  const u = direzione(m);
  const c = puntoSulMuro(m, lunghezzaMuro(m as Muro) / 2);
  return { x: c.x + u.y * off, y: c.y - u.x * off };
}

/** Angolo in gradi per scrivere un testo lungo la parete senza che venga capovolto. */
export function angoloTesto(a: Punto, b: Punto): number {
  let g = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (g > 90) g -= 180;
  if (g <= -90) g += 180;
  return g;
}
