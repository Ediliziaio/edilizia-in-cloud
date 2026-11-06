import { CostruttoreMesh } from "./costruttore";
import { materialeFinitura } from "./materiali";
import type { MuroCalc } from "./muri";
import type { AperturaPer3D, LocalePer3D, Mesh3D, V3 } from "./tipi";

/** Pelle interna della stanza, senza cambiare muri, spallette o facciata.
 * I vani vengono ritagliati: una finitura non deve mai coprire una porta o finestra.
 */
export function finiturePareti(locale: LocalePer3D, muri: MuroCalc[], aperture: AperturaPer3D[], altezzaFalda?: (x: number, z: number) => number): Mesh3D[] {
  if (!locale.finiture || locale.contorno.length < 3) return [];
  const contorno = locale.contorno.map((p) => ({ x: p.x / 100, y: p.y / 100 }));
  const area = contorno.reduce((s, a, i) => { const b = contorno[(i + 1) % contorno.length]; return s + a.x * b.y - b.x * a.y; }, 0);
  const strati = [
    { nome: "pareti", testo: locale.finiture.pareti, altezza: locale.altezza / 100, superficie: "pareti" as const },
    { nome: "rivestimento", testo: locale.finiture.rivestimento?.materiale, altezza: (locale.finiture.rivestimento?.altezza ?? 0) / 100, superficie: "pavimento" as const },
  ];
  return strati.flatMap((strato) => {
    const materiale = materialeFinitura(strato.testo, strato.superficie, "");
    if (!materiale || strato.altezza <= 0) return [];
    const c = new CostruttoreMesh();
    for (let i = 0; i < contorno.length; i++) {
      const a = contorno[i], b = contorno[(i + 1) % contorno.length];
      const lunghezza = Math.hypot(b.x - a.x, b.y - a.y);
      if (lunghezza < 0.01) continue;
      const dx = (b.x - a.x) / lunghezza, dz = (b.y - a.y) / lunghezza;
      const segno = area >= 0 ? 1 : -1;
      const nx = -dz * segno, nz = dx * segno;
      const proietta = (p: { x: number; y: number }) => (p.x - a.x) * dx + (p.y - a.y) * dz;
      for (const m of muri) {
        if (Math.abs(m.d.x * dx + m.d.y * dz) < 0.98) continue;
        const distanza = Math.abs((a.x - m.a.x) * m.n.x + (a.y - m.a.y) * m.n.y);
        if (Math.abs(distanza - m.spessore / 2) > 0.025) continue;
        const s0 = Math.max(0, Math.min(proietta(m.a), proietta(m.b)));
        const s1 = Math.min(lunghezza, Math.max(proietta(m.a), proietta(m.b)));
        if (s1 - s0 < 0.005) continue;
        const vani = aperture.filter((v) => v.muroId === m.id).map((v) => {
          const centro = proietta({ x: m.a.x + m.d.x * v.posizione / 100, y: m.a.y + m.d.y * v.posizione / 100 });
          return { s0: Math.max(s0, centro - v.larghezza / 200), s1: Math.min(s1, centro + v.larghezza / 200), y0: v.davanzale / 100, y1: (v.davanzale + v.altezza) / 100 };
        }).filter((v) => v.s1 > v.s0);
        const tagli = [...new Set([s0, s1, ...vani.flatMap((v) => [v.s0, v.s1])])].sort((x, y) => x - y);
        const altezza = Math.min(strato.altezza, altezzaFalda ? locale.altezza / 100 : m.altezza);
        const punto = (s: number, y: number): V3 => [a.x + dx * s + nx * (strato.nome === "rivestimento" ? 0.004 : 0.002), y, a.y + dz * s + nz * (strato.nome === "rivestimento" ? 0.004 : 0.002)];
        const tetto = (s: number) => altezzaFalda ? Math.min(strato.altezza, altezzaFalda(a.x + dx * s, a.y + dz * s)) : altezza;
        for (let j = 0; j < tagli.length - 1; j++) {
          const x0 = tagli[j], x1 = tagli[j + 1], centro = (x0 + x1) / 2;
          const aperti = vani.filter((v) => centro > v.s0 && centro < v.s1);
          const livelli = [...new Set([0, Math.max(tetto(x0), tetto(x1)), ...aperti.flatMap((v) => [v.y0, v.y1])])].filter((y) => y >= 0).sort((x, y) => x - y);
          for (let k = 0; k < livelli.length - 1; k++) {
            const y0 = livelli[k], y1 = livelli[k + 1];
            if (aperti.some((v) => (y0 + y1) / 2 > v.y0 && (y0 + y1) / 2 < v.y1)) continue;
            const h0 = Math.min(y1, tetto(x0)), h1 = Math.min(y1, tetto(x1));
            if (Math.min(h0, h1) <= y0) continue;
            c.quad(punto(x0, y0), punto(x1, y0), punto(x1, h1), punto(x0, h0), [nx, 0, nz]);
          }
        }
      }
    }
    return c.vuoto() ? [] : [c.mesh({ id: `finitura:${strato.nome}:${locale.id}`, nome: `${strato.nome === "pareti" ? "Finitura pareti" : "Rivestimento"} ${locale.nome}`, genere: "muro", materiale, riferimento: locale.id })];
  });
}
