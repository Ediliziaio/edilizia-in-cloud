/**
 * Forme da disegnare (in cm, coordinate della pianta): il corpo delle pareti,
 * il simbolo delle porte e delle finestre, il centro delle stanze.
 */
import type { Apertura, Muro, Pianta, Punto, StatoElemento } from "./adattatore";
import { direzione, lunghezzaMuro, puntoSulMuro, uguali } from "./geometria";
import type { Vista } from "./comandi";

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
  altro: "#f8fafc",
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
