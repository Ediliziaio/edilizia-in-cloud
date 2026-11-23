import { CostruttoreMesh } from "./costruttore";
import type { MuroCalc } from "./muri";
import type { AperturaPer3D, LocalePer3D, Mesh3D } from "./tipi";

/** Misure correnti di un battiscopa, in metri. */
export const BATTISCOPA = { altezza: .07, spessore: .012 };

/**
 * Battiscopa lungo i muri della stanza, sul filo interno. Si interrompe dove c'è un passaggio a pavimento
 * (porte, portefinestre, varchi) e non c'è dove il lato della stanza non ha un muro dietro (zone aperte).
 * Dove le piastrelle del rivestimento arrivano a terra non si mette: è la regola di cantiere, ed è la stessa
 * del fabbisogno dei materiali.
 */
export function battiscopaLocale(locale: LocalePer3D, muri: MuroCalc[], aperture: AperturaPer3D[], materiale: string): Mesh3D[] {
  if (locale.contorno.length < 3 || locale.finiture?.rivestimento) return [];
  const contorno = locale.contorno.map((p) => ({ x: p.x / 100, y: p.y / 100 }));
  const area = contorno.reduce((s, a, i) => { const b = contorno[(i + 1) % contorno.length]; return s + a.x * b.y - b.x * a.y; }, 0);
  const c = new CostruttoreMesh();
  const { altezza, spessore } = BATTISCOPA;
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i], b = contorno[(i + 1) % contorno.length];
    const lunghezza = Math.hypot(b.x - a.x, b.y - a.y);
    if (lunghezza < .05) continue;
    const dx = (b.x - a.x) / lunghezza, dz = (b.y - a.y) / lunghezza;
    const segno = area >= 0 ? 1 : -1;
    const nx = -dz * segno, nz = dx * segno;
    const proietta = (p: { x: number; y: number }) => (p.x - a.x) * dx + (p.y - a.y) * dz;
    // i tratti del lato che hanno davvero un muro dietro
    const tratti: Array<[number, number]> = [];
    const vuoti: Array<[number, number]> = [];
    for (const m of muri) {
      if (m.stato === "demolire" || Math.abs(m.d.x * dx + m.d.y * dz) < .98) continue;
      const distanza = Math.abs((a.x - m.a.x) * m.n.x + (a.y - m.a.y) * m.n.y);
      if (Math.abs(distanza - m.spessore / 2) > .03) continue;
      const s0 = Math.max(0, Math.min(proietta(m.a), proietta(m.b)));
      const s1 = Math.min(lunghezza, Math.max(proietta(m.a), proietta(m.b)));
      if (s1 - s0 < .02) continue;
      tratti.push([s0, s1]);
      for (const v of aperture) {
        if (v.muroId !== m.id || v.davanzale > 12) continue;
        const centro = proietta({ x: m.a.x + m.d.x * v.posizione / 100, y: m.a.y + m.d.y * v.posizione / 100 });
        // lo stipite copre qualche centimetro oltre il vano
        vuoti.push([centro - v.larghezza / 200 - .06, centro + v.larghezza / 200 + .06]);
      }
    }
    tratti.sort((x, y) => x[0] - y[0]);
    const uniti: Array<[number, number]> = [];
    for (const t of tratti) {
      const ultimo = uniti[uniti.length - 1];
      if (ultimo && t[0] <= ultimo[1] + .005) ultimo[1] = Math.max(ultimo[1], t[1]);
      else uniti.push([t[0], t[1]]);
    }
    for (const [inizio, fine] of uniti) {
      const tagli = [inizio, fine, ...vuoti.flat().filter((s) => s > inizio && s < fine)].sort((x, y) => x - y);
      for (let k = 0; k < tagli.length - 1; k++) {
        const s0 = tagli[k], s1 = tagli[k + 1], centro = (s0 + s1) / 2;
        if (s1 - s0 < .03 || vuoti.some(([v0, v1]) => centro > v0 && centro < v1)) continue;
        c.scatola(a.x + dx * centro + nx * spessore / 2, a.y + dz * centro + nz * spessore / 2, 0, s1 - s0, spessore, altezza, Math.atan2(dz, dx), 0, 0, 0, .002);
      }
    }
  }
  return c.vuoto() ? [] : [c.mesh({ id: `battiscopa:${locale.id}`, nome: `Battiscopa ${locale.nome}`, genere: "nodo", materiale, riferimento: locale.id, stratoEsploso: "pareti" })];
}
