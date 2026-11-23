import type { CostruttoreMesh } from "./costruttore";
import type { V3 } from "./tipi";

const potenza = (v: number, e: number) => Math.abs(v) < 1e-9 ? 0 : Math.sign(v) * Math.abs(v) ** e;
const VERTICI = 20;

/** Il profilo imbottito mantiene il volume del rivestimento anche sui raccordi. */
function imbottitura(
  mesh: CostruttoreMesh, mondo: (x: number, y: number, z: number) => V3,
  rotazione: number, centro: V3, dimensioni: V3, cucitura = false,
) {
  const [cx, cy, cz] = centro;
  const [l, h, p] = dimensioni.map(v => v / 2);
  const c = Math.cos(rotazione), s = Math.sin(rotazione);
  const eAlt = .54, eLato = .37;
  const passo = 2 * Math.PI / VERTICI;
  const anello = (lat: number, bordo = 0) => {
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    return Array.from({ length: VERTICI }, (_, i) => {
      const cos = Math.cos(i * passo), sin = Math.sin(i * passo);
      const nx = potenza(cosLat, 2 - eAlt) * potenza(cos, 2 - eLato) / l;
      const nz = potenza(cosLat, 2 - eAlt) * potenza(sin, 2 - eLato) / p;
      const ny = potenza(sinLat, 2 - eAlt) / h;
      const norma = Math.hypot(nx, ny, nz) || 1;
      return {
        p: mondo(
          cx + l * potenza(cosLat, eAlt) * potenza(cos, eLato) + bordo * nx / norma,
          cy + h * potenza(sinLat, eAlt) + bordo * ny / norma,
          cz + p * potenza(cosLat, eAlt) * potenza(sin, eLato) + bordo * nz / norma,
        ),
        n: [(nx * c - nz * s) / norma, ny / norma, (nx * s + nz * c) / norma] as V3,
      };
    });
  };
  const fasce = 10;
  let prima = anello(-Math.PI / 2);
  for (let f = 1; f <= fasce; f++) {
    const dopo = anello(-Math.PI / 2 + f * Math.PI / fasce);
    for (let i = 0; i < VERTICI; i++) {
      const j = (i + 1) % VERTICI;
      const [a, b, c, d] = [prima[i], prima[j], dopo[j], dopo[i]];
      if (f === 1) mesh.poligono([a.p, c.p, d.p], c.n);
      else if (f === fasce) mesh.poligono([a.p, b.p, c.p], a.n);
      else mesh.quadLiscio([a.p, b.p, c.p, d.p], [a.n, b.n, c.n, d.n]);
    }
    prima = dopo;
  }
  if (cucitura) {
    const bordo = Math.min(.0019, l * .028, h * .085, p * .028);
    const punti = anello(-.33, bordo * .58).map(v => v.p);
    mesh.tubo([...punti, punti[0]], bordo, 6);
  }
}

export function costruisciDivanoLino(
  l: number, p: number, h: number, centro: { x: number; z: number }, rotazione: number,
  materiale: (id: string) => CostruttoreMesh,
) {
  const cos = Math.cos(rotazione), sin = Math.sin(rotazione);
  const mondo = (x: number, y: number, z: number): V3 => [
    centro.x + x * cos - z * sin, y, centro.z + x * sin + z * cos,
  ];
  const scatola = (id: string, x: number, z: number, y: number, larg: number, prof: number, alt: number, raggio: number) =>
    materiale(id).scatola(centro.x, centro.z, y, larg, prof, alt, rotazione, x, z, 0, raggio);
  const base = Math.min(.075, h * .126);
  const sotto = Math.min(.026, h * .035);
  const seduta = Math.min(.43, h * .53);
  const spessore = Math.min(.165, seduta * .44);
  const braccio = Math.min(.145, l * .10, p * .25);
  const passo = (l - 2 * braccio) / Math.max(1, Math.min(7, Math.round(l / .90)));
  const moduli = Math.round((l - 2 * braccio) / passo);
  const tessuto = materiale("tessuto");

  scatola("guarnizione", 0, 0, 0, l * .89, p * .86, sotto, .006);
  scatola("rovere_chiaro", 0, 0, sotto, l, p, base - sotto, .016);
  scatola("tessuto", 0, -p * .068, base, l, p * .86, seduta - spessore - base + .012, .036);
  scatola("tessuto", 0, -p * .424, base, l - braccio * .6, p * .15, h - base, .039);
  for (const lato of [-1, 1]) {
    imbottitura(tessuto, mondo, rotazione, [lato * (l - braccio) / 2, h * .425, -p * .04],
      [braccio, h * .64, p * .915]);
  }
  for (let i = 0; i < moduli; i++) {
    const x = (i + .5 - moduli / 2) * passo;
    const fuga = Math.min(.012, passo * .08);
    imbottitura(tessuto, mondo, rotazione, [x, seduta - spessore / 2, p * .122],
      [passo - fuga, spessore, p * .745], true);
    imbottitura(tessuto, mondo, rotazione, [x, seduta + (h - seduta) * .49, -p * .296],
      [passo - fuga * 1.6, (h - seduta) * .98, p * .23]);
  }
  imbottitura(materiale("lino_avorio"), mondo, rotazione, [-l * .235, h * .715, -p * .193],
    [Math.min(.35, passo * .64), h * .435, p * .19]);
  imbottitura(materiale("tessuto_cuscino"), mondo, rotazione, [l * .24, h * .64, -p * .136],
    [Math.min(.37, passo * .66), h * .295, p * .22]);
}
