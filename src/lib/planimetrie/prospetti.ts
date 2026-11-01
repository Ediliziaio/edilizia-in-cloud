/**
 * Prospetti e sezioni dalla pianta (fase 6 del piano di completamento, 1/11/2026).
 *
 * Non serve un modello nuovo: muri (asse, spessore, altezza) e aperture (offset, larghezza,
 * altezza, davanzale) bastano per disegnare le facciate e una sezione verticale, in scala.
 *
 * - Prospetto: si guarda l'edificio da un lato (nord, sud, est, ovest). Si disegnano le pareti la cui
 *   faccia esterna guarda chi osserva, dalla più lontana alla più vicina (la vicina copre la lontana),
 *   con porte e finestre al loro posto.
 * - Sezione: un piano verticale taglia la pianta lungo una linea orizzontale o verticale. Le pareti
 *   tagliate sono campite; quelle oltre il taglio si vedono in alzato, più chiare.
 *
 * Uscita: primitive in cm (u = orizzontale da sinistra a destra di chi guarda, z = altezza dal
 * pavimento del piano), poi SVG in scala e DXF a layer.
 */
import type { Apertura, Locale, Muro, StatoPianta } from "../../../shared/planimetrie/modello.ts";
import { puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { MotoreDxfR12 } from "./esporta/dxf/r12";

export type Lato = "sud" | "nord" | "est" | "ovest";
export interface Taglio { asse: "orizzontale" | "verticale"; valore: number }

interface P { x: number; y: number }
export type Primitiva =
  | { tipo: "rett"; u1: number; u2: number; z1: number; z2: number; stile: "muro" | "muro_lontano" | "taglio" | "vano" | "vetro" | "porta" }
  | { tipo: "linea"; a: { u: number; z: number }; b: { u: number; z: number }; stile: "terra" | "quota" | "solaio" }
  | { tipo: "testo"; u: number; z: number; testo: string; stile: "titolo" | "quota" };

export interface Disegno2D {
  titolo: string;
  primitive: Primitiva[];
  /** Estensione in cm. */
  minU: number; maxU: number; minZ: number; maxZ: number;
}

// Da dove si guarda: direzione dello sguardo (nel modello, y verso l'alto = nord).
const SGUARDO: Record<Lato, P> = { sud: { x: 0, y: 1 }, nord: { x: 0, y: -1 }, est: { x: -1, y: 0 }, ovest: { x: 1, y: 0 } };
export const NOMI_LATO: Record<Lato, string> = { sud: "Prospetto sud", nord: "Prospetto nord", est: "Prospetto est", ovest: "Prospetto ovest" };

/** La destra di chi guarda: l'asse u del disegno. */
const destra = (v: P): P => ({ x: v.y, y: -v.x });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y;

function versoEsterno(m: Muro, locali: Locale[]): P | null {
  const l = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
  if (l < 1) return null;
  const n = { x: -(m.p2.y - m.p1.y) / l, y: (m.p2.x - m.p1.x) / l };
  const c = { x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 };
  const prova = (s: number) => ({ x: c.x + n.x * s * (m.spessore / 2 + 15), y: c.y + n.y * s * (m.spessore / 2 + 15) });
  const dentro = (p: P) => locali.some((loc) => puntoNelPoligono(p, loc.contorno));
  const a = dentro(prova(1)), b = dentro(prova(-1));
  if (a && !b) return { x: -n.x, y: -n.y };
  if (b && !a) return n;
  return null; // interno (stanze da tutte e due le parti) o isolato
}

function vaniDelMuro(m: Muro, aperture: Apertura[]): Array<{ a: Apertura; da: P; a2: P }> {
  const l = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) || 1;
  const d = { x: (m.p2.x - m.p1.x) / l, y: (m.p2.y - m.p1.y) / l };
  return aperture.filter((x) => x.muroId === m.id && x.stato !== "da_demolire").map((a) => ({
    a,
    da: { x: m.p1.x + d.x * a.offset, y: m.p1.y + d.y * a.offset },
    a2: { x: m.p1.x + d.x * (a.offset + a.larghezza), y: m.p1.y + d.y * (a.offset + a.larghezza) },
  }));
}

function estensione(titolo: string, primitive: Primitiva[]): Disegno2D {
  const us: number[] = [], zs: number[] = [];
  for (const p of primitive) {
    if (p.tipo === "rett") { us.push(p.u1, p.u2); zs.push(p.z1, p.z2); }
    else if (p.tipo === "linea") { us.push(p.a.u, p.b.u); zs.push(p.a.z, p.b.z); }
    else { us.push(p.u); zs.push(p.z); }
  }
  return { titolo, primitive, minU: Math.min(0, ...us), maxU: Math.max(1, ...us), minZ: Math.min(0, ...zs), maxZ: Math.max(1, ...zs) };
}

function vani(primitive: Primitiva[], m: Muro, aperture: Apertura[], asse: P, stileMuro: "muro" | "muro_lontano") {
  for (const v of vaniDelMuro(m, aperture)) {
    const u1 = dot(v.da, asse), u2 = dot(v.a2, asse);
    const z1 = v.a.davanzale, z2 = v.a.davanzale + v.a.altezza;
    const lo = Math.min(u1, u2), hi = Math.max(u1, u2);
    if (hi - lo < 1) continue;
    const stile = v.a.tipo === "finestra" || v.a.tipo === "portafinestra" ? "vetro" : v.a.tipo === "porta" ? "porta" : "vano";
    primitive.push({ tipo: "rett", u1: lo, u2: hi, z1, z2: Math.min(z2, m.altezza), stile: stileMuro === "muro_lontano" ? "vano" : stile });
  }
}

/** Un prospetto: le pareti esterne viste da un lato, con porte e finestre. */
export function prospetto(stato: StatoPianta, lato: Lato): Disegno2D {
  const v = SGUARDO[lato];
  const asse = destra(v);
  const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
  const visibili = muri
    .map((m) => ({ m, n: versoEsterno(m, stato.locali) }))
    // senza stanze (pianta di sole pareti) si prendono tutte le pareti che guardano verso chi osserva
    .filter(({ m, n }) => (n ? dot(n, v) < -0.2 : stato.locali.length === 0 && Math.abs(dot({ x: -(m.p2.y - m.p1.y), y: m.p2.x - m.p1.x }, v)) > 0.2))
    .map(({ m }) => ({ m, profondita: dot({ x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 }, v) }))
    .sort((a, b) => b.profondita - a.profondita);
  const primitive: Primitiva[] = [];
  for (const { m } of visibili) {
    const u1 = dot(m.p1, asse), u2 = dot(m.p2, asse);
    const lo = Math.min(u1, u2) - m.spessore / 2, hi = Math.max(u1, u2) + m.spessore / 2;
    primitive.push({ tipo: "rett", u1: lo, u2: hi, z1: 0, z2: m.altezza, stile: "muro" });
    vani(primitive, m, stato.aperture, asse, "muro");
  }
  return conTerraEQuote(NOMI_LATO[lato], primitive);
}

/** Sezione verticale lungo una linea: pareti tagliate campite, quelle oltre in alzato. */
export function sezione(stato: StatoPianta, taglio: Taglio, nome = "Sezione A-A"): Disegno2D {
  // Linea orizzontale (y = valore): si guarda verso nord. Verticale (x = valore): si guarda verso est.
  const v: P = taglio.asse === "orizzontale" ? { x: 0, y: 1 } : { x: 1, y: 0 };
  const asse = destra(v);
  const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
  const primitive: Primitiva[] = [];
  const coord = (p: P) => (taglio.asse === "orizzontale" ? p.y : p.x);
  const oltre: Array<{ m: Muro; profondita: number }> = [];
  const tagliati: Muro[] = [];
  for (const m of muri) {
    const c1 = coord(m.p1) - taglio.valore, c2 = coord(m.p2) - taglio.valore;
    const meta = m.spessore / 2;
    const parallelo = Math.abs(c1 - c2) < 1;
    if ((parallelo && Math.abs(c1) <= meta) || (!parallelo && c1 * c2 <= 0)) tagliati.push(m);
    else if (Math.min(c1, c2) > 0) oltre.push({ m, profondita: (c1 + c2) / 2 });
  }
  // prima ciò che sta oltre (dal più lontano), poi il taglio sopra
  for (const { m } of oltre.sort((a, b) => b.profondita - a.profondita)) {
    const u1 = dot(m.p1, asse), u2 = dot(m.p2, asse);
    if (Math.abs(u1 - u2) < 2) continue; // vista di taglio: niente da mostrare
    primitive.push({ tipo: "rett", u1: Math.min(u1, u2), u2: Math.max(u1, u2), z1: 0, z2: m.altezza, stile: "muro_lontano" });
    vani(primitive, m, stato.aperture, asse, "muro_lontano");
  }
  for (const m of tagliati) {
    const l = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) || 1;
    const d = { x: (m.p2.x - m.p1.x) / l, y: (m.p2.y - m.p1.y) / l };
    const parallelo = Math.abs(coord(m.p1) - coord(m.p2)) < 1;
    if (parallelo) {
      const u1 = dot(m.p1, asse), u2 = dot(m.p2, asse);
      primitive.push({ tipo: "rett", u1: Math.min(u1, u2), u2: Math.max(u1, u2), z1: 0, z2: m.altezza, stile: "taglio" });
      continue;
    }
    // punto d'incrocio dell'asse del muro con la linea di taglio
    const t = (taglio.valore - coord(m.p1)) / ((coord(m.p2) - coord(m.p1)) || 1);
    const x = { x: m.p1.x + (m.p2.x - m.p1.x) * t, y: m.p1.y + (m.p2.y - m.p1.y) * t };
    const sen = Math.abs(dot(d, v)) || 1;
    const meta = m.spessore / 2 / sen;
    const u = dot(x, asse);
    // un vano tagliato apre il muro fra davanzale e architrave
    const lungo = t * l;
    const vano = stato.aperture.find((a) => a.muroId === m.id && a.stato !== "da_demolire" && lungo >= a.offset && lungo <= a.offset + a.larghezza);
    if (vano) {
      if (vano.davanzale > 0) primitive.push({ tipo: "rett", u1: u - meta, u2: u + meta, z1: 0, z2: vano.davanzale, stile: "taglio" });
      primitive.push({ tipo: "rett", u1: u - meta, u2: u + meta, z1: vano.davanzale + vano.altezza, z2: m.altezza, stile: "taglio" });
    } else {
      primitive.push({ tipo: "rett", u1: u - meta, u2: u + meta, z1: 0, z2: m.altezza, stile: "taglio" });
    }
  }
  // pavimento e soffitto fra le pareti tagliate
  const us = primitive.filter((p): p is Extract<Primitiva, { tipo: "rett" }> => p.tipo === "rett").flatMap((p) => [p.u1, p.u2]);
  if (us.length) {
    const h = Math.max(...muri.map((m) => m.altezza), 270);
    primitive.push({ tipo: "linea", a: { u: Math.min(...us), z: h }, b: { u: Math.max(...us), z: h }, stile: "solaio" });
  }
  return conTerraEQuote(nome, primitive);
}

function conTerraEQuote(titolo: string, primitive: Primitiva[]): Disegno2D {
  const d = estensione(titolo, primitive);
  if (!primitive.length) return d;
  const out = [...primitive];
  out.push({ tipo: "linea", a: { u: d.minU - 50, z: 0 }, b: { u: d.maxU + 50, z: 0 }, stile: "terra" });
  // quota d'altezza a sinistra e larghezza sotto
  const qu = d.minU - 60;
  out.push({ tipo: "linea", a: { u: qu, z: 0 }, b: { u: qu, z: d.maxZ }, stile: "quota" });
  out.push({ tipo: "testo", u: qu - 32, z: d.maxZ / 2, testo: `${(d.maxZ / 100).toFixed(2).replace(".", ",")} m`, stile: "quota" });
  out.push({ tipo: "linea", a: { u: d.minU, z: -45 }, b: { u: d.maxU, z: -45 }, stile: "quota" });
  out.push({ tipo: "testo", u: (d.minU + d.maxU) / 2, z: -70, testo: `${((d.maxU - d.minU) / 100).toFixed(2).replace(".", ",")} m`, stile: "quota" });
  out.push({ tipo: "testo", u: d.minU, z: d.maxZ + 50, testo: titolo, stile: "titolo" });
  return estensione(titolo, out);
}

// ─── Uscite ──────────────────────────────────────────────────────────────────

const STILE_SVG: Record<string, { fill: string; stroke: string; width: number; dash?: string }> = {
  muro: { fill: "#ffffff", stroke: "#0f172a", width: 0.5 },
  muro_lontano: { fill: "#f8fafc", stroke: "#94a3b8", width: 0.3 },
  taglio: { fill: "#1e293b", stroke: "#0f172a", width: 0.5 },
  vano: { fill: "#ffffff", stroke: "#64748b", width: 0.3 },
  vetro: { fill: "#e0f2fe", stroke: "#0f172a", width: 0.35 },
  porta: { fill: "#f1f5f9", stroke: "#0f172a", width: 0.35 },
  terra: { fill: "none", stroke: "#0f172a", width: 0.7 },
  quota: { fill: "none", stroke: "#0f766e", width: 0.25 },
  solaio: { fill: "none", stroke: "#475569", width: 0.35, dash: "2 1.5" },
};

/** SVG in scala (1:scala), con larghezza e altezza in mm veri. */
export function disegnoInSvg(d: Disegno2D, scala = 50): { svg: string; larghezzaMm: number; altezzaMm: number } {
  const k = 10 / scala; // cm → mm
  const margine = 12;
  const w = (d.maxU - d.minU) * k + margine * 2;
  const h = (d.maxZ - d.minZ) * k + margine * 2;
  const X = (u: number) => (u - d.minU) * k + margine;
  const Y = (z: number) => (d.maxZ - z) * k + margine;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const parti: string[] = [`<rect width="${w}" height="${h}" fill="#ffffff"/>`];
  for (const p of d.primitive) {
    const st = STILE_SVG[p.stile] ?? STILE_SVG.muro;
    if (p.tipo === "rett") {
      parti.push(`<rect x="${X(p.u1).toFixed(2)}" y="${Y(p.z2).toFixed(2)}" width="${((p.u2 - p.u1) * k).toFixed(2)}" height="${((p.z2 - p.z1) * k).toFixed(2)}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.width}"/>`);
      if (p.stile === "porta") parti.push(`<line x1="${X(p.u1)}" y1="${Y(p.z2)}" x2="${X((p.u1 + p.u2) / 2)}" y2="${Y(p.z1)}" stroke="#94a3b8" stroke-width="0.2"/>`);
    } else if (p.tipo === "linea") {
      parti.push(`<line x1="${X(p.a.u).toFixed(2)}" y1="${Y(p.a.z).toFixed(2)}" x2="${X(p.b.u).toFixed(2)}" y2="${Y(p.b.z).toFixed(2)}" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`);
    } else {
      const titolo = p.stile === "titolo";
      parti.push(`<text x="${X(p.u).toFixed(2)}" y="${Y(p.z).toFixed(2)}" font-family="Helvetica, Arial, sans-serif" font-size="${titolo ? 4.2 : 2.6}" font-weight="${titolo ? 700 : 500}" fill="${titolo ? "#0f172a" : "#0f766e"}" text-anchor="${titolo ? "start" : "middle"}">${esc(p.testo)}</text>`);
    }
  }
  parti.push(`<text x="${w - margine}" y="${h - 4}" font-family="Helvetica, Arial, sans-serif" font-size="2.6" fill="#64748b" text-anchor="end">Scala 1:${scala}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">${parti.join("")}</svg>`;
  return { svg, larghezzaMm: w, altezzaMm: h };
}

/** DXF in centimetri, a layer (PROSPETTO, TAGLIO, APERTURE, QUOTE, TESTI). */
export function disegnoInDxf(d: Disegno2D): Uint8Array {
  const m = new MotoreDxfR12();
  const LAYER: Record<string, string> = { muro: "PROSPETTO", muro_lontano: "OLTRE", taglio: "TAGLIO", vano: "APERTURE", vetro: "APERTURE", porta: "APERTURE", terra: "PROSPETTO", quota: "QUOTE", solaio: "OLTRE" };
  m.layer({ nome: "PROSPETTO", colore: 7 });
  m.layer({ nome: "OLTRE", colore: 8 });
  m.layer({ nome: "TAGLIO", colore: 7 });
  m.layer({ nome: "APERTURE", colore: 4 });
  m.layer({ nome: "QUOTE", colore: 3 });
  m.layer({ nome: "TESTI", colore: 7 });
  for (const p of d.primitive) {
    if (p.tipo === "rett") {
      const pts = [{ x: p.u1, y: p.z1 }, { x: p.u2, y: p.z1 }, { x: p.u2, y: p.z2 }, { x: p.u1, y: p.z2 }];
      if (p.stile === "taglio") m.pieno(LAYER.taglio, pts);
      m.polilinea(LAYER[p.stile] ?? "PROSPETTO", pts, true);
    } else if (p.tipo === "linea") {
      m.linea(LAYER[p.stile] ?? "PROSPETTO", { x: p.a.u, y: p.a.z }, { x: p.b.u, y: p.b.z });
    } else {
      m.testo("TESTI", { x: p.u, y: p.z }, p.testo, p.stile === "titolo" ? 25 : 15, { orizzontale: p.stile === "titolo" ? "sinistra" : "centro" });
    }
  }
  return m.chiudi();
}
