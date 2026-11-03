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
import type { Apertura, Locale, Muro, Planimetria, StatoPianta, Tetto } from "../../../shared/planimetrie/modello.ts";
import { anteDi, eAvvolgibile, misureOscurante, sistemaDi } from "../../../shared/planimetrie/serramenti.ts";
import { statoPerAmbito } from "../../../shared/render-planimetria/vincoli.ts";
import { abacoSerramenti } from "./abachi";
import { baseTetto, facceTetto, quotaFalde, rettangoloTetto, type Faccia } from "../../../shared/planimetrie/tetto.ts";
import { puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import { MotoreDxfR12 } from "./esporta/dxf/r12";

export type Lato = "sud" | "nord" | "est" | "ovest";
export interface Taglio { asse: "orizzontale" | "verticale"; valore: number }

interface P { x: number; y: number }
export type Primitiva =
  | { tipo: "rett"; u1: number; u2: number; z1: number; z2: number; stile: "muro" | "muro_lontano" | "taglio" | "vano" | "vetro" | "porta" | "porta_chiusa" | "cassonetto" | "cassonetto_nascosto" | "persiana" }
  | { tipo: "linea"; a: { u: number; z: number }; b: { u: number; z: number }; stile: "terra" | "quota" | "solaio" | "richiamo" | "montante" | "apertura" | "lamella" }
  | { tipo: "testo"; u: number; z: number; testo: string; stile: "titolo" | "quota" | "etichetta"; ruota?: boolean; ancora?: "fine" }
  | { tipo: "poligono"; punti: Array<{ u: number; z: number }>; stile: "falda" | "timpano" | "falda_lontana" | "taglio_tetto" };

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
    else if (p.tipo === "poligono") for (const q of p.punti) { us.push(q.u); zs.push(q.z); }
    else { us.push(p.u); if (p.ancora === "fine") us.push(p.u - p.testo.length * 11); zs.push(p.z); }
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

/**
 * Le facce del tetto nelle coordinate della pianta (y verso nord). tetto.ts lavora con y verso il
 * basso (come il 3D): si ribalta all'andata e al ritorno. Il tetto parte dalla cima dei muri.
 */
function facceDelTetto(stato: StatoPianta, tetto: Tetto | null | undefined): Faccia[] {
  const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
  if (!tetto || !muri.length) return [];
  const r = rettangoloTetto(muri.map((m) => ({ a: { x: m.p1.x, y: -m.p1.y }, b: { x: m.p2.x, y: -m.p2.y }, spessore: m.spessore })), tetto.sporto);
  if (!r) return [];
  const h = baseTetto(tetto, Math.max(...muri.map((m) => m.altezza)));
  return facceTetto(r, h, tetto).map((f) => ({ ...f, vertici: f.vertici.map((v) => ({ ...v, y: -v.y })) }));
}

/** Le facce del tetto proiettate su chi guarda, dalla più lontana (la vicina copre la lontana). */
function tettoInAlzato(facce: Faccia[], v: P, asse: P, lontano: boolean): Primitiva[] {
  return facce
    .map((f) => ({ f, profondita: f.vertici.reduce((t, q) => t + dot(q, v), 0) / f.vertici.length }))
    .sort((a, b) => b.profondita - a.profondita)
    .map(({ f }): Primitiva => ({
      tipo: "poligono",
      punti: f.vertici.map((q) => ({ u: dot(q, asse), z: q.z })),
      stile: lontano ? "falda_lontana" : f.genere === "timpano" ? "timpano" : "falda",
    }))
    // una falda vista di taglio è una linea: non aggiunge niente
    .filter((p) => p.tipo !== "poligono" || areaUZ(p.punti) > 1);
}

const areaUZ = (pts: Array<{ u: number; z: number }>) => Math.abs(pts.reduce((t, a, i) => { const b = pts[(i + 1) % pts.length]; return t + a.u * b.z - b.u * a.z; }, 0)) / 2;

/** Dove il piano di sezione taglia il tetto: per ogni falda un segmento, disegnato con lo spessore del pacchetto. */
function tettoTagliato(facce: Faccia[], coord: (p: P) => number, valore: number, asse: P): Primitiva[] {
  const out: Primitiva[] = [];
  const SPESSORE = 25;
  for (const f of facce) {
    if (f.genere === "timpano") continue;
    const tagli: Array<{ u: number; z: number }> = [];
    f.vertici.forEach((a, i) => {
      const b = f.vertici[(i + 1) % f.vertici.length];
      const ca = coord(a) - valore, cb = coord(b) - valore;
      if (ca === cb || ca * cb > 0) return;
      const t = ca / (ca - cb);
      const x = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      tagli.push({ u: dot(x, asse), z: a.z + (b.z - a.z) * t });
    });
    if (tagli.length < 2) continue;
    tagli.sort((p, q) => p.u - q.u);
    const [p, q] = [tagli[0], tagli[tagli.length - 1]];
    if (Math.hypot(q.u - p.u, q.z - p.z) < 1) continue;
    out.push({ tipo: "poligono", punti: [p, q, { u: q.u, z: q.z - SPESSORE }, { u: p.u, z: p.z - SPESSORE }], stile: "taglio_tetto" });
  }
  return out;
}

/**
 * I lucernari (finestre a tetto) visti nel prospetto: solo quelli sulle falde che scendono
 * verso chi guarda (gli altri li copre il tetto). Il vetro sulla falda inclinata si vede
 * accorciato: alto quanto la sua lunghezza per il seno della pendenza.
 */
function lucernariInAlzato(stato: StatoPianta, facce: Faccia[], v: P, asse: P): Primitiva[] {
  if (!facce.length) return [];
  const out: Primitiva[] = [];
  for (const e of stato.elementi) {
    if (e.tipo !== "lucernario" || e.stato === "da_demolire") continue;
    const { x, y } = e.posizione;
    const z = quotaFalde(facce, x, y);
    if (z === null) continue;
    // pendenza della falda nel punto: verso dove sale
    const gx = ((quotaFalde(facce, x + 5, y) ?? z) - (quotaFalde(facce, x - 5, y) ?? z)) / 10;
    const gy = ((quotaFalde(facce, x, y + 5) ?? z) - (quotaFalde(facce, x, y - 5) ?? z)) / 10;
    const pend = Math.hypot(gx, gy);
    if (pend < 0.01 || gx * v.x + gy * v.y <= 0) continue;
    const largo = e.larghezza ?? 78, lungo = e.profondita ?? 118;
    const alto = (lungo * pend) / Math.sqrt(1 + pend * pend);
    const u = dot({ x, y }, asse);
    out.push({ tipo: "rett", u1: u - largo / 2, u2: u + largo / 2, z1: z - alto / 2, z2: z + alto / 2, stile: "vetro" });
  }
  return out;
}

/** Le pareti esterne che guardano chi osserva (`v` = direzione dello sguardo), dalla più lontana alla più vicina. */
function paretiVisibili(stato: StatoPianta, v: P): Muro[] {
  const muri = stato.muri.filter((m) => m.stato !== "da_demolire");
  return muri
    .map((m) => ({ m, n: versoEsterno(m, stato.locali) }))
    // senza stanze (pianta di sole pareti) si prendono tutte le pareti che guardano verso chi osserva
    .filter(({ m, n }) => (n ? dot(n, v) < -0.2 : stato.locali.length === 0 && Math.abs(dot({ x: -(m.p2.y - m.p1.y), y: m.p2.x - m.p1.x }, v)) > 0.2))
    .map(({ m }) => ({ m, profondita: dot({ x: (m.p1.x + m.p2.x) / 2, y: (m.p1.y + m.p2.y) / 2 }, v) }))
    .sort((a, b) => b.profondita - a.profondita)
    .map(({ m }) => m);
}

/** Pareti, porte e finestre di un lato (senza tetto, terra e quote). */
function primitiveProspetto(stato: StatoPianta, v: P, asse: P): Primitiva[] {
  const primitive: Primitiva[] = [];
  for (const m of paretiVisibili(stato, v)) {
    const u1 = dot(m.p1, asse), u2 = dot(m.p2, asse);
    const lo = Math.min(u1, u2) - m.spessore / 2, hi = Math.max(u1, u2) + m.spessore / 2;
    primitive.push({ tipo: "rett", u1: lo, u2: hi, z1: 0, z2: m.altezza, stile: "muro" });
    vani(primitive, m, stato.aperture, asse, "muro");
  }
  return primitive;
}

/** Un prospetto: le pareti esterne viste da un lato, con porte e finestre. */
export function prospetto(stato: StatoPianta, lato: Lato, tetto?: Tetto | null): Disegno2D {
  const v = SGUARDO[lato];
  const asse = destra(v);
  const primitive = primitiveProspetto(stato, v, asse);
  const facce = facceDelTetto(stato, tetto);
  primitive.push(...tettoInAlzato(facce, v, asse, false));
  primitive.push(...lucernariInAlzato(stato, facce, v, asse));
  return conTerraEQuote(NOMI_LATO[lato], primitive);
}

/** Sezione verticale lungo una linea: pareti tagliate campite, quelle oltre in alzato. */
export function sezione(stato: StatoPianta, taglio: Taglio, nome = "Sezione A-A", tetto?: Tetto | null): Disegno2D {
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
  // il tetto: oltre il taglio in alzato (chiaro), tagliato campito
  const facce = facceDelTetto(stato, tetto);
  if (facce.length) {
    const oltreTetto = facce.filter((f) => f.vertici.some((q) => coord(q) > taglio.valore));
    primitive.unshift(...tettoInAlzato(oltreTetto, v, asse, true));
    primitive.push(...tettoTagliato(facce, coord, taglio.valore, asse));
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

// ─── Prospetto quotato ───────────────────────────────────────────────────────

/** Un piano dell'edificio per il prospetto: `quota` = pavimento rispetto al piano terra, cm. */
export interface PianoProspetto { id: string; nome: string; quota: number; stato: StatoPianta; tetto?: Tetto | null }

/** I piani di una planimetria per un ambito (fatto o progetto:X); dove la proposta manca resta il fatto. */
export function pianiProspetto(doc: Planimetria, ambito: string): PianoProspetto[] {
  return [...doc.livelli].sort((a, b) => a.quota - b.quota).map((l) => ({
    id: l.id, nome: l.nome, quota: l.quota, stato: statoPerAmbito(doc, l.id, ambito) ?? l.fatto, tetto: l.tetto,
  }));
}

/** I codici dell'abaco (F1, P2, PF1…) per id di apertura: il prospetto e l'abaco parlano la stessa lingua. */
function codiciAperture(stato: StatoPianta): Map<string, string> {
  const doc = { schemaVersione: 1, titolo: "", livelli: [{ id: "x", nome: "x", quota: 0, fatto: stato, proposte: [] }] } as unknown as Planimetria;
  return new Map(abacoSerramenti(doc, "x", "fatto").map((r) => [r.id, r.codice]));
}

const spostaZ = (p: Primitiva, dz: number): Primitiva => {
  if (p.tipo === "rett") return { ...p, z1: p.z1 + dz, z2: p.z2 + dz };
  if (p.tipo === "linea") return { ...p, a: { ...p.a, z: p.a.z + dz }, b: { ...p.b, z: p.b.z + dz } };
  if (p.tipo === "poligono") return { ...p, punti: p.punti.map((q) => ({ ...q, z: q.z + dz })) };
  return { ...p, z: p.z + dz };
};

const num = (cm: number) => String(Math.round(cm));
const quotaM = (cm: number) => `${cm > 0.5 ? "+" : cm < -0.5 ? "−" : "±"}${(Math.abs(cm) / 100).toFixed(2).replace(".", ",")}`;

/**
 * Segni di un serramento visto da fuori: montanti fra le ante, linee di apertura (il triangolo dei battenti,
 * il vasistas, la freccia degli scorrevoli), cassonetto sopra il vano, guide e lamelle della tapparella, persiane chiuse.
 */
function dettagliSerramento(a: Apertura, m: Muro, lo: number, hi: number, z1: number, z2: number, asse: P): Primitiva[] {
  const out: Primitiva[] = [];
  const linea = (u1: number, zz1: number, u2: number, zz2: number, stile: "montante" | "apertura" | "lamella"): void => {
    out.push({ tipo: "linea", a: { u: u1, z: zz1 }, b: { u: u2, z: zz2 }, stile });
  };
  const largo = hi - lo;
  if (a.tipo !== "varco") {
    const sistema = sistemaDi(a), ante = Math.max(1, anteDi(a));
    const passo = largo / ante;
    for (let i = 1; i < ante; i++) linea(lo + passo * i, z1, lo + passo * i, z2, "montante");
    const cerniera = a.verso?.cardine === "p2" ? (dot(m.p2, asse) >= dot(m.p1, asse) ? "destra" : "sinistra") : (dot(m.p1, asse) <= dot(m.p2, asse) ? "sinistra" : "destra");
    for (let i = 0; i < ante; i++) {
      const u0 = lo + passo * i, u1 = u0 + passo, mezzo = (z1 + z2) / 2;
      // il lato delle cerniere: le ante esterne sul loro lato, la sola anta dove dice il verso
      const asx = ante === 1 ? cerniera === "sinistra" : i < ante / 2;
      const [uc, ul] = asx ? [u0, u1] : [u1, u0];
      if (sistema === "battente" || sistema === "anta_ribalta") {
        linea(ul, z1, uc, mezzo, "apertura");
        linea(ul, z2, uc, mezzo, "apertura");
      }
      if (sistema === "anta_ribalta" || sistema === "vasistas") {
        linea(u0, z2, (u0 + u1) / 2, z1, "apertura");
        linea(u1, z2, (u0 + u1) / 2, z1, "apertura");
      }
      if (sistema === "scorrevole" || sistema === "alzante_scorrevole" || sistema === "scorrevole_scomparsa") {
        const dir = i % 2 ? -1 : 1, cx = (u0 + u1) / 2, l = Math.min(30, passo / 3);
        linea(cx - l * dir, mezzo, cx + l * dir, mezzo, "apertura");
        linea(cx + l * dir, mezzo, cx + (l - 8) * dir, mezzo + 6, "apertura");
        linea(cx + l * dir, mezzo, cx + (l - 8) * dir, mezzo - 6, "apertura");
      }
    }
  }
  const o = misureOscurante(a);
  if (o?.cassonetto) {
    const c = o.cassonetto;
    out.push(c.tipo === "esterno"
      ? { tipo: "rett", u1: lo, u2: hi, z1: z2, z2: z2 + c.altezza, stile: "cassonetto" }
      : { tipo: "rett", u1: lo, u2: hi, z1: c.tipo === "monoblocco" ? z2 - c.altezza : z2, z2: c.tipo === "monoblocco" ? z2 : z2 + c.altezza, stile: "cassonetto_nascosto" });
  }
  if (o && eAvvolgibile(o.tipo)) {
    // il telo abbassato di un terzo: lamelle, e le guide ai lati
    const top = o.cassonetto?.tipo === "monoblocco" ? z2 - o.cassonetto.altezza : z2;
    const giu = top - (top - z1) / 3, passoL = o.tipo === "veneziana" ? 9 : 6;
    for (let z = top - passoL; z > giu; z -= passoL) linea(lo + 4, z, hi - 4, z, "lamella");
    linea(lo + 4, z1, lo + 4, top, "montante");
    linea(hi - 4, z1, hi - 4, top, "montante");
  } else if (o && o.tipo === "persiana") {
    const n = Math.max(1, o.ante), pp = largo / n;
    for (let i = 0; i < n; i++) {
      out.push({ tipo: "rett", u1: lo + pp * i, u2: lo + pp * (i + 1), z1, z2, stile: "persiana" });
      for (let z = z1 + 8; z < z2 - 4; z += 8) linea(lo + pp * i + 2, z, lo + pp * (i + 1) - 2, z, "lamella");
    }
  }
  return out;
}

/** La catena di quote parziali e il totale, sotto il terreno: spalle dei vani e filo dei muri, in cm. */
function catenaOrizzontale(punti: number[], zLinea: number, minU: number, maxU: number): Primitiva[] {
  const out: Primitiva[] = [];
  const u = [...new Set([minU, maxU, ...punti].map((x) => Math.round(x)))].sort((a, b) => a - b);
  const tick = (x: number, z: number) => out.push({ tipo: "linea", a: { u: x - 4, z: z - 4 }, b: { u: x + 4, z: z + 4 }, stile: "quota" });
  out.push({ tipo: "linea", a: { u: u[0], z: zLinea }, b: { u: u[u.length - 1], z: zLinea }, stile: "quota" });
  for (const x of u) {
    out.push({ tipo: "linea", a: { u: x, z: -6 }, b: { u: x, z: zLinea - 8 }, stile: "richiamo" });
    tick(x, zLinea);
  }
  for (let i = 0; i < u.length - 1; i++) {
    const l = u[i + 1] - u[i];
    if (l >= 30) out.push({ tipo: "testo", u: (u[i] + u[i + 1]) / 2, z: zLinea + 6, testo: num(l), stile: "quota" });
  }
  // totale, un gradino più giù
  const zt = zLinea - 45;
  out.push({ tipo: "linea", a: { u: u[0], z: zt }, b: { u: u[u.length - 1], z: zt }, stile: "quota" });
  for (const x of [u[0], u[u.length - 1]]) {
    out.push({ tipo: "linea", a: { u: x, z: zLinea - 8 }, b: { u: x, z: zt - 8 }, stile: "richiamo" });
    tick(x, zt);
  }
  out.push({ tipo: "testo", u: (u[0] + u[u.length - 1]) / 2, z: zt + 6, testo: num(u[u.length - 1] - u[0]), stile: "quota" });
  return out;
}

/** Quota verticale (linea con tacche e numero ruotato) tra due altezze, a una data distanza dal disegno. */
function quotaVerticale(u: number, z1: number, z2: number, testo?: string): Primitiva[] {
  const tick = (z: number): Primitiva => ({ tipo: "linea", a: { u: u - 4, z: z - 4 }, b: { u: u + 4, z: z + 4 }, stile: "quota" });
  const out: Primitiva[] = [{ tipo: "linea", a: { u, z: z1 }, b: { u, z: z2 }, stile: "quota" }, tick(z1), tick(z2)];
  if (z2 - z1 >= 20) out.push({ tipo: "testo", u: u - 6, z: (z1 + z2) / 2, testo: testo ?? num(z2 - z1), stile: "quota", ruota: true });
  return out;
}

/**
 * Prospetto quotato di tutto l'edificio da un lato: i piani uno sopra l'altro, ogni serramento col suo codice e le
 * misure, i simboli di apertura, cassonetti e oscuranti, la catena di quote orizzontali, le quote di piano e le
 * altezze dei vani. Con un piano solo è il prospetto della pianta.
 */
export function prospettoQuotato(piani: PianoProspetto[], lato: Lato): Disegno2D {
  const v = SGUARDO[lato];
  const asse = destra(v);
  const ordinati = [...piani].sort((a, b) => a.quota - b.quota).filter((p) => p.stato.muri.some((m) => m.stato !== "da_demolire"));
  const primitive: Primitiva[] = [];
  const punti: number[] = [];
  const quoteVani: Array<{ u: number; z1: number; z2: number }> = [];
  let sopra: { top: number; lo: number; hi: number } | null = null;
  const ultimo = ordinati.length - 1;
  ordinati.forEach((piano, indice) => {
    const base = piano.quota;
    const visibili = paretiVisibili(piano.stato, v);
    const codici = codiciAperture(piano.stato);
    const locale: Primitiva[] = primitiveProspetto(piano.stato, v, asse).map((p) => (p.tipo === "rett" && p.stile === "porta" ? { ...p, stile: "porta_chiusa" as const } : p));
    for (const m of visibili) {
      const u1 = dot(m.p1, asse), u2 = dot(m.p2, asse);
      if (indice === 0) punti.push(Math.min(u1, u2) - m.spessore / 2, Math.max(u1, u2) + m.spessore / 2);
      for (const vano of vaniDelMuro(m, piano.stato.aperture)) {
        const lo = Math.min(dot(vano.da, asse), dot(vano.a2, asse)), hi = Math.max(dot(vano.da, asse), dot(vano.a2, asse));
        if (hi - lo < 1) continue;
        const z1 = vano.a.davanzale, z2 = Math.min(vano.a.davanzale + vano.a.altezza, m.altezza);
        if (indice === 0) punti.push(lo, hi);
        locale.push(...dettagliSerramento(vano.a, m, lo, hi, z1, z2, asse));
        const cod = codici.get(vano.a.id);
        if (cod && hi - lo >= 40) {
          locale.push({ tipo: "testo", u: (lo + hi) / 2, z: (z1 + z2) / 2 + 14, testo: cod, stile: "etichetta" });
          if (hi - lo >= 80 && z2 - z1 >= 60) locale.push({ tipo: "testo", u: (lo + hi) / 2, z: (z1 + z2) / 2 - 14, testo: `${num(vano.a.larghezza)}×${num(vano.a.altezza)}`, stile: "etichetta" });
        }
        if (vano.a.tipo !== "varco" && !quoteVani.some((q) => Math.abs(q.z1 - (base + z1)) < 1 && Math.abs(q.z2 - (base + z2)) < 1)) quoteVani.push({ u: hi, z1: base + z1, z2: base + z2 });
      }
    }
    // il solaio fra due piani: una fascia piena quanto il piano di sotto
    if (sopra && base > sopra.top) primitive.push({ tipo: "rett", u1: sopra.lo, u2: sopra.hi, z1: sopra.top, z2: base, stile: "muro" });
    const rett = locale.filter((p): p is Extract<Primitiva, { tipo: "rett" }> => p.tipo === "rett" && p.stile === "muro");
    const altezza = Math.max(0, ...visibili.map((m) => m.altezza));
    if (rett.length) sopra = { top: base + altezza, lo: Math.min(...rett.map((r) => r.u1)), hi: Math.max(...rett.map((r) => r.u2)) };
    primitive.push(...locale.map((p) => spostaZ(p, base)));
    if (indice === ultimo) {
      const facce = facceDelTetto(piano.stato, piano.tetto).map((f) => ({ ...f }));
      primitive.push(...[...tettoInAlzato(facce, v, asse, false), ...lucernariInAlzato(piano.stato, facce, v, asse)].map((p) => spostaZ(p, base)));
    }
  });
  if (!primitive.length) return estensione(NOMI_LATO[lato], []);

  const base = estensione(NOMI_LATO[lato], primitive);
  const out = [...primitive];
  // terreno e catena di quote
  out.push({ tipo: "linea", a: { u: base.minU - 50, z: 0 }, b: { u: base.maxU + 50, z: 0 }, stile: "terra" });
  out.push(...catenaOrizzontale(punti, -45, base.minU, base.maxU));
  // quote di piano e altezze a sinistra: una catena fra le quote dei solai e il totale
  const quotaU = base.minU - 60;
  const livelli = [...new Set([0, ...ordinati.map((p) => Math.round(p.quota)), Math.round(base.maxZ)])].sort((a, b) => a - b);
  for (let i = 0; i < livelli.length - 1; i++) out.push(...quotaVerticale(quotaU, livelli[i], livelli[i + 1]));
  out.push(...quotaVerticale(quotaU - 45, 0, Math.round(base.maxZ)));
  for (const z of livelli) {
    out.push({ tipo: "linea", a: { u: quotaU - 49, z }, b: { u: base.minU - 4, z }, stile: "richiamo" });
  }
  for (const piano of ordinati) {
    out.push({ tipo: "linea", a: { u: base.minU - 4, z: piano.quota }, b: { u: base.minU - 40, z: piano.quota }, stile: "terra" });
    out.push({ tipo: "testo", u: base.minU - 115, z: piano.quota + 6, testo: `${quotaM(piano.quota)} ${piano.nome}`.trim(), stile: "etichetta", ancora: "fine" });
  }
  out.push({ tipo: "testo", u: base.minU - 115, z: Math.round(base.maxZ) + 6, testo: quotaM(Math.round(base.maxZ)), stile: "etichetta", ancora: "fine" });
  // altezze dei vani a destra: davanzale, luce, architrave
  const quotaD = base.maxU + 60;
  const ordine = [...quoteVani].sort((a, b) => a.z1 - b.z1 || a.z2 - b.z2);
  const alte = [...new Set(ordine.flatMap((q) => [Math.round(q.z1), Math.round(q.z2)]))].sort((a, b) => a - b);
  if (alte.length) {
    const stack = [0, ...alte];
    for (let i = 0; i < stack.length - 1; i++) if (stack[i + 1] > stack[i]) out.push(...quotaVerticale(quotaD, stack[i], stack[i + 1]));
    for (const z of stack) out.push({ tipo: "linea", a: { u: base.maxU + 4, z }, b: { u: quotaD + 4, z }, stile: "richiamo" });
  }
  out.push({ tipo: "testo", u: base.minU, z: base.maxZ + 50, testo: ordinati.length > 1 ? `${NOMI_LATO[lato]} · tutto l'edificio` : NOMI_LATO[lato], stile: "titolo" });
  return estensione(NOMI_LATO[lato], out);
}

// ─── Uscite ──────────────────────────────────────────────────────────────────

const STILE_SVG: Record<string, { fill: string; stroke: string; width: number; dash?: string }> = {
  muro: { fill: "#ffffff", stroke: "#0f172a", width: 0.5 },
  muro_lontano: { fill: "#f8fafc", stroke: "#94a3b8", width: 0.3 },
  taglio: { fill: "#1e293b", stroke: "#0f172a", width: 0.5 },
  vano: { fill: "#ffffff", stroke: "#64748b", width: 0.3 },
  vetro: { fill: "#e0f2fe", stroke: "#0f172a", width: 0.35 },
  porta: { fill: "#f1f5f9", stroke: "#0f172a", width: 0.35 },
  porta_chiusa: { fill: "#f1f5f9", stroke: "#0f172a", width: 0.35 },
  terra: { fill: "none", stroke: "#0f172a", width: 0.7 },
  quota: { fill: "none", stroke: "#0f766e", width: 0.25 },
  solaio: { fill: "none", stroke: "#475569", width: 0.35, dash: "2 1.5" },
  richiamo: { fill: "none", stroke: "#0f766e", width: 0.15 },
  montante: { fill: "none", stroke: "#0f172a", width: 0.3 },
  apertura: { fill: "none", stroke: "#475569", width: 0.2, dash: "1.4 1" },
  lamella: { fill: "none", stroke: "#94a3b8", width: 0.15 },
  cassonetto: { fill: "#e5e7eb", stroke: "#0f172a", width: 0.35 },
  cassonetto_nascosto: { fill: "none", stroke: "#64748b", width: 0.25, dash: "1.6 1" },
  persiana: { fill: "#dfe6d6", stroke: "#0f172a", width: 0.3 },
  falda: { fill: "#e7d3c4", stroke: "#0f172a", width: 0.4 },
  timpano: { fill: "#ffffff", stroke: "#0f172a", width: 0.5 },
  falda_lontana: { fill: "#f8fafc", stroke: "#94a3b8", width: 0.3 },
  taglio_tetto: { fill: "#1e293b", stroke: "#0f172a", width: 0.5 },
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
    } else if (p.tipo === "poligono") {
      parti.push(`<polygon points="${p.punti.map((q) => `${X(q.u).toFixed(2)},${Y(q.z).toFixed(2)}`).join(" ")}" fill="${st.fill}" stroke="${st.stroke}" stroke-width="${st.width}"/>`);
    } else if (p.tipo === "linea") {
      parti.push(`<line x1="${X(p.a.u).toFixed(2)}" y1="${Y(p.a.z).toFixed(2)}" x2="${X(p.b.u).toFixed(2)}" y2="${Y(p.b.z).toFixed(2)}" stroke="${st.stroke}" stroke-width="${st.width}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>`);
    } else {
      const titolo = p.stile === "titolo", etichetta = p.stile === "etichetta";
      const x = X(p.u).toFixed(2), y = Y(p.z).toFixed(2);
      parti.push(`<text x="${x}" y="${y}"${p.ruota ? ` transform="rotate(-90 ${x} ${y})"` : ""} font-family="Helvetica, Arial, sans-serif" font-size="${titolo ? 4.2 : etichetta ? 2.1 : 2.6}" font-weight="${titolo ? 700 : 500}" fill="${titolo || etichetta ? "#0f172a" : "#0f766e"}" text-anchor="${titolo ? "start" : p.ancora === "fine" ? "end" : "middle"}">${esc(p.testo)}</text>`);
    }
  }
  parti.push(`<text x="${w - margine}" y="${h - 4}" font-family="Helvetica, Arial, sans-serif" font-size="2.6" fill="#64748b" text-anchor="end">Scala 1:${scala}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(1)}mm" height="${h.toFixed(1)}mm" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">${parti.join("")}</svg>`;
  return { svg, larghezzaMm: w, altezzaMm: h };
}

/** DXF in centimetri, a layer (PROSPETTO, TAGLIO, APERTURE, QUOTE, TESTI). */
export function disegnoInDxf(d: Disegno2D): Uint8Array {
  const m = new MotoreDxfR12();
  const LAYER: Record<string, string> = { muro: "PROSPETTO", muro_lontano: "OLTRE", taglio: "TAGLIO", vano: "APERTURE", vetro: "APERTURE", porta: "APERTURE", terra: "PROSPETTO", quota: "QUOTE", solaio: "OLTRE", falda: "TETTO", timpano: "TETTO", falda_lontana: "OLTRE", taglio_tetto: "TAGLIO", porta_chiusa: "APERTURE", richiamo: "QUOTE", montante: "APERTURE", apertura: "APERTURE", lamella: "APERTURE", cassonetto: "APERTURE", cassonetto_nascosto: "APERTURE", persiana: "APERTURE" };
  m.layer({ nome: "PROSPETTO", colore: 7 });
  m.layer({ nome: "OLTRE", colore: 8 });
  m.layer({ nome: "TAGLIO", colore: 7 });
  m.layer({ nome: "APERTURE", colore: 4 });
  m.layer({ nome: "QUOTE", colore: 3 });
  m.layer({ nome: "TESTI", colore: 7 });
  m.layer({ nome: "TETTO", colore: 1 });
  for (const p of d.primitive) {
    if (p.tipo === "rett") {
      const pts = [{ x: p.u1, y: p.z1 }, { x: p.u2, y: p.z1 }, { x: p.u2, y: p.z2 }, { x: p.u1, y: p.z2 }];
      if (p.stile === "taglio") m.pieno(LAYER.taglio, pts);
      m.polilinea(LAYER[p.stile] ?? "PROSPETTO", pts, true);
    } else if (p.tipo === "poligono") {
      const pts = p.punti.map((q) => ({ x: q.u, y: q.z }));
      if (p.stile === "taglio_tetto") m.pieno(LAYER.taglio, pts);
      m.polilinea(LAYER[p.stile] ?? "TETTO", pts, true);
    } else if (p.tipo === "linea") {
      m.linea(LAYER[p.stile] ?? "PROSPETTO", { x: p.a.u, y: p.a.z }, { x: p.b.u, y: p.b.z });
    } else {
      m.testo(p.stile === "quota" ? "QUOTE" : "TESTI", { x: p.u, y: p.z }, p.testo, p.stile === "titolo" ? 25 : p.stile === "etichetta" ? 11 : 15, { orizzontale: p.stile === "titolo" ? "sinistra" : p.ancora === "fine" ? "destra" : "centro", ...(p.ruota ? { rotazione: 90 } : {}) });
    }
  }
  return m.chiudi();
}
