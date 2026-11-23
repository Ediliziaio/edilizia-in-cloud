import type { CostruttoreMesh } from "./costruttore";
import type { V3 } from "./tipi";

/** Le foglie sono scandite lungo rami secondari con rotazioni e lunghezze ripetibili. */
export function costruisciOlivo(l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number,
  fabbrica: (materiale: string) => CostruttoreMesh) {
  if (Math.min(l, p, h) <= 0) return;
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const punto = (x: number, y: number, z: number): V3 => [centro.x + x * c - z * s, y, centro.z + x * s + z * c];
  const corteccia = fabbrica("corteccia_olivo"), foglie = fabbrica("foglie_olivo"), chiare = fabbrica("foglie_olivo_chiare");
  let seme = (Math.round(l * 127 + p * 389 + h * 631) >>> 0) || 13;
  const casuale = () => ((seme = (Math.imul(seme, 1664525) + 1013904223) >>> 0) / 4294967296);
  const raggio = Math.min(l, p) * .058;
  corteccia.tubo([punto(0, 0, 0), punto(-l * .022, h * .20, p * .016), punto(l * .021, h * .42, 0),
    punto(-l * .008, h * .57, -p * .021)], raggio, 13);
  for (let ramo = 0; ramo < 7; ramo++) {
    const theta = ramo * 2.399 + .45, sx = Math.cos(theta), sz = Math.sin(theta);
    const dir = .21 + casuale() * .09, y = h * (.68 + casuale() * .16);
    const x = sx * l * dir, z = sz * p * dir;
    corteccia.tubo([punto(l * .005, h * (.36 + casuale() * .12), 0), punto(x * .51, y * .82, z * .48),
      punto(x, y, z)], raggio * (.22 + casuale() * .15), 8);
    for (let rametto = 0; rametto < 12; rametto++) {
      const a = theta + (casuale() - .5) * 2.4;
      const r = .09 + casuale() * .12;
      const tx = Math.max(-l * .46, Math.min(l * .46, x + Math.cos(a) * l * r));
      const tz = Math.max(-p * .46, Math.min(p * .46, z + Math.sin(a) * p * r));
      const yFine = Math.min(h * .97, y + h * (.04 + (casuale() - .36) * .21));
      corteccia.tubo([punto(x * .70, y * .91, z * .7), punto(tx, yFine, tz)], raggio * .061, 5);
      for (let i = 0; i < 30; i++) {
        const t = .34 + casuale() * .67;
        const px = x * .7 + t * (tx - x * .7) + (casuale() - .5) * l * .17;
        const py = y * .91 + t * (yFine - y * .91) + (casuale() - .5) * h * .10;
        const pz = z * .7 + t * (tz - z * .7) + (casuale() - .5) * p * .17;
        const angolo = casuale() * Math.PI * 2;
        const naso = Math.min(.10, Math.min(l, p) * .044) * (.63 + casuale() * .43);
        const ux = Math.cos(angolo) * naso, uz = Math.sin(angolo) * naso;
        const ll = (casuale() - .48) * naso;
        const mesh = i % 4 === 0 ? chiare : foglie;
        mesh.quad(punto(px - ux, py - ll, pz - uz), punto(px - uz * .255, py + naso * .16, pz + ux * .255),
          punto(px + ux, py + ll, pz + uz), punto(px + uz * .255, py, pz - ux * .255), [0, 1, 0]);
      }
    }
  }
}
