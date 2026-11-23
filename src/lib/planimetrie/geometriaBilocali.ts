import { assiDelMuro, puntoNelPoligono } from "../../../shared/planimetrie/geometria.ts";
import type { Muro, Punto } from "../../../shared/planimetrie/modello.ts";

export type PuntoPianta = { u: number; v: number };
export type Intervallo = { da: number; a: number };
const PRECISIONE_CM = 0.01;

/** Coordinate locali della distribuzione, con la profondità verso l'interno dalla porta. */
export function assiRispettoIngresso(contorno: Punto[], muro: Muro, ingresso: Punto) {
  const { dir, normale } = assiDelMuro(muro);
  const verso = Math.abs(dir.x) >= Math.abs(dir.y) ? Math.sign(dir.x) : Math.sign(dir.y);
  const lungo = { x: dir.x * verso, y: dir.y * verso };
  const prova = (segno: number) => puntoNelPoligono({
    x: ingresso.x + normale.x * segno * 4,
    y: ingresso.y + normale.y * segno * 4,
  }, contorno);
  const sinistra = prova(1), destra = prova(-1);
  if (sinistra === destra) return null;
  const dentro = sinistra ? normale : { x: -normale.x, y: -normale.y };
  const coordinate = (p: Punto): PuntoPianta => ({
    u: (p.x - ingresso.x) * lungo.x + (p.y - ingresso.y) * lungo.y,
    v: (p.x - ingresso.x) * dentro.x + (p.y - ingresso.y) * dentro.y,
  });
  const profilo = contorno.map(coordinate);
  const u0 = Math.min(...profilo.map(p => p.u)), v0 = Math.min(...profilo.map(p => p.v));
  const proietta = (p: Punto) => {
    const { u, v } = coordinate(p);
    return { u: u - u0, v: v - v0 };
  };
  return {
    proietta,
    punto: (u: number, v: number): Punto => ({
      x: ingresso.x + (u + u0) * lungo.x + (v + v0) * dentro.x,
      y: ingresso.y + (u + u0) * lungo.y + (v + v0) * dentro.y,
    }),
    larghezza: Math.max(...profilo.map(p => p.u)) - u0,
    profondita: Math.max(...profilo.map(p => p.v)) - v0,
    quotaIngresso: -v0,
    contorno: contorno.map(proietta),
  };
}

/** Ritaglia un tramezzo sul perimetro. Una rientranza può produrre più tratti. */
export function intervalliInterni(contorno: PuntoPianta[], fisso: "u" | "v", quota: number, da: number, a: number): Intervallo[] {
  const libero = fisso === "u" ? "v" : "u";
  const tagli = [da, a];
  const bordi: Intervallo[] = [];
  for (let i = 0; i < contorno.length; i++) {
    const p = contorno[i], q = contorno[(i + 1) % contorno.length];
    const z0 = p[fisso] - quota, z1 = q[fisso] - quota;
    if (Math.abs(z0) < PRECISIONE_CM && Math.abs(z1) < PRECISIONE_CM) {
      bordi.push({ da: Math.min(p[libero], q[libero]), a: Math.max(p[libero], q[libero]) });
      tagli.push(p[libero], q[libero]);
    } else if ((z0 > 0) !== (z1 > 0)) {
      tagli.push(p[libero] + (q[libero] - p[libero]) * z0 / (z0 - z1));
    }
  }
  const poligono = contorno.map(p => ({ x: p.u, y: p.v }));
  const ordinati = tagli.filter(n => n >= da && n <= a).sort((x, y) => x - y);
  const risultato: Intervallo[] = [];
  for (let i = 1; i < ordinati.length; i++) {
    const da = ordinati[i - 1], a = ordinati[i];
    if (a - da <= PRECISIONE_CM) continue;
    const c = (da + a) / 2;
    if (bordi.some(b => c > b.da && c < b.a)) continue;
    if (!puntoNelPoligono(fisso === "u" ? { x: quota, y: c } : { x: c, y: quota }, poligono)) continue;
    const precedente = risultato.at(-1);
    if (precedente && da - precedente.a <= PRECISIONE_CM) precedente.a = a;
    else risultato.push({ da, a });
  }
  return risultato;
}
