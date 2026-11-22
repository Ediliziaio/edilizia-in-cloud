import { quotePiscina } from "../../../../shared/planimetrie/modelliArredo.ts";
import { CostruttoreMesh } from "./costruttore";
import { triangola, type V2 } from "./geometria2d";
import type { V3 } from "./tipi";

export interface ScavoPiscina {
  contorno: V2[];
  min: V2;
  max: V2;
  fondo: number;
}

const CM = .01;
export const SPESSORE_BORDO_PISCINA = .035;

export function scavoPiscina(centro: { x: number; z: number }, l: number, p: number, h: number, angolo: number, quota: number): ScavoPiscina {
  const { luce, lungo, vasca } = quotePiscina(l / CM, p / CM, h / CM);
  const c = Math.cos(angolo), s = Math.sin(angolo);
  const contorno = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: centro.x + a * luce * CM / 2 * c - b * lungo * CM / 2 * s,
    y: centro.z + a * luce * CM / 2 * s + b * lungo * CM / 2 * c,
  }));
  const xs = contorno.map(p => p.x), zs = contorno.map(p => p.y);
  return { contorno, min: { x: Math.min(...xs), y: Math.min(...zs) },
    max: { x: Math.max(...xs), y: Math.max(...zs) }, fondo: quota + SPESSORE_BORDO_PISCINA - vasca * CM };
}

/** Dividi la superficie nei semipiani esterni della vasca, conservando la quota di ogni punto del terreno. */
export function ritagliaScavi(faccia: V3[], scavi: ScavoPiscina[]): V3[][] {
  const x = faccia.map(v => v[0]), y = faccia.map(v => v[1]), z = faccia.map(v => v[2]);
  const pertinenti = scavi.filter(s => Math.max(...y) > s.fondo &&
    Math.max(...x) > s.min.x && Math.min(...x) < s.max.x && Math.max(...z) > s.min.y && Math.min(...z) < s.max.y);
  return pertinenti.reduce<V3[][]>((facce, scavo) => facce.flatMap(f => sottraiVasca(f, scavo.contorno)), [faccia]);
}

function sottraiVasca(faccia: V3[], contorno: V2[]): V3[][] {
  let interno = faccia;
  const esterno: V3[][] = [];
  for (let i = 0; i < contorno.length && interno.length >= 3; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const distanza = ([x, , z]: V3) => (b.x - a.x) * (z - a.y) - (b.y - a.y) * (x - a.x);
    const dentro: V3[] = [], fuori: V3[] = [];
    for (let j = 0; j < interno.length; j++) {
      const p = interno[j], q = interno[(j + 1) % interno.length];
      const d = distanza(p), e = distanza(q);
      (d >= 0 ? dentro : fuori).push(p);
      if ((d >= 0) !== (e >= 0)) {
        const t = d / (d - e);
        const v: V3 = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        dentro.push(v);
        fuori.push(v);
      }
    }
    if (fuori.length >= 3) esterno.push(fuori);
    interno = dentro;
  }
  return esterno;
}

export function superficieConScavi(mesh: CostruttoreMesh, contorno: V2[], quota: number, scavi: ScavoPiscina[]): void {
  if (!scavi.length) {
    mesh.orizzontale(contorno, quota, true);
    return;
  }
  for (const ids of triangola(contorno)) {
    const faccia = ids.map(i => [contorno[i].x, quota, contorno[i].y] as V3);
    for (const parte of ritagliaScavi(faccia, scavi)) mesh.poligono(parte, [0, 1, 0]);
  }
}

export function costruisciPiscina(l: number, p: number, h: number, centro: { x: number; z: number }, r: number,
  variante: string | undefined, quota: number, fabbrica: (chiave: string) => CostruttoreMesh) {
  if (Math.min(l, p) <= 0) return;
  const q = quotePiscina(l / CM, p / CM, h / CM);
  const lato = q.luce * CM, lungo = q.lungo * CM, s = q.bordo * CM, d = q.vasca * CM;
  const bordo = variante === "turchese" ? "bordo_travertino" : variante === "ardesia" ? "bordo_ardesia" : "pietra";
  const rivestimento = variante === "ardesia" ? "piscina_mosaico_scuro" : variante === "turchese" ? "piscina_mosaico_chiaro" : "piscina_mosaico";
  const acqua = variante === "turchese" ? "acqua_turchese" : variante === "ardesia" ? "acqua_profonda" : "acqua";
  const cima = quota + SPESSORE_BORDO_PISCINA, fondo = cima - d;
  const specchio = cima - q.livello * CM;
  const blocco = (mat: string, x: number, z: number, y: number, w: number, len: number, a: number, smusso = 0) =>
    fabbrica(mat).scatola(centro.x, centro.z, y, w, len, a, r, x, z, 0, smusso);
  const guscio = Math.min(s, .08);
  for (const segno of [-1, 1]) {
    blocco(bordo, 0, segno * (p / 2 - s / 2), quota, l, s, SPESSORE_BORDO_PISCINA, .003);
    blocco(bordo, segno * (l / 2 - s / 2), 0, quota, s, lungo, SPESSORE_BORDO_PISCINA, .003);
    blocco(rivestimento, 0, segno * (lungo + guscio) / 2, fondo, lato + guscio * 2, guscio, Math.max(.002, quota - fondo));
    blocco(rivestimento, segno * (lato + guscio) / 2, 0, fondo, guscio, lungo, Math.max(.002, quota - fondo));
  }
  blocco(rivestimento, 0, 0, fondo - .036, lato, lungo, .036);
  const numeroPedate = Math.min(4, Math.floor(d / .22) - 1);
  if (numeroPedate > 0 && lato >= 1.45 && lungo >= 2.5) {
    const pedata = Math.min(.32, lungo * .26 / numeroPedate);
    for (let i = 0; i < numeroPedate; i++) {
      const alzata = d / (numeroPedate + 1);
      const z = -lungo / 2 + (i + .5) * pedata;
      blocco(rivestimento, -lato / 2 + .56, z, fondo, 1.12, pedata, d - (i + 1) * alzata, .006);
    }
  }
  const c = Math.cos(r), s1 = Math.sin(r);
  const superficie = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]): V3 => [
    centro.x + x * lato / 2 * c - z * lungo / 2 * s1, specchio, centro.z + x * lato / 2 * s1 + z * lungo / 2 * c,
  ]);
  fabbrica(acqua).poligono(superficie, [0, 1, 0]);
}
