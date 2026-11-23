import { CostruttoreMesh } from "./costruttore";
import type { V3 } from "./tipi";

type Centro = { x: number; z: number };
type Fabbrica = (materiale: string) => CostruttoreMesh;
type Anello = { rx: number; rz: number; quota: number; forma?: number };

function scolpisciBacino(c: CostruttoreMesh, centro: Centro, rotazione: number, anelli: Anello[], offset = 0) {
  const cos = Math.cos(rotazione), sin = Math.sin(rotazione);
  const passi = 32;
  const trasformato = (x: number, z: number, y: number): V3 => [centro.x + x * cos - z * sin, y, centro.z + x * sin + z * cos];
  const arrotonda = (v: number, forma = 1) => Math.sign(v) * Math.abs(v) ** forma;
  const angolo = (i: number) => i * 2 * Math.PI / passi;
  const punti = anelli.map(a => Array.from({ length: passi }, (_, i) => {
    const t = angolo(i);
    return trasformato(a.rx * arrotonda(Math.cos(t), a.forma), offset + a.rz * arrotonda(Math.sin(t), a.forma), a.quota);
  }));
  const normali = punti.map((fascia, k) => fascia.map((_, i): V3 => {
    const a = fascia[(i + passi - 1) % passi], b = fascia[(i + 1) % passi];
    const da = punti[Math.max(0, k - 1)][i], a2 = punti[Math.min(punti.length - 1, k + 1)][i];
    const [tx, ty, tz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const [px, py, pz] = [a2[0] - da[0], a2[1] - da[1], a2[2] - da[2]];
    const n: V3 = [py * tz - pz * ty, pz * tx - px * tz, px * ty - py * tx];
    const mag = Math.hypot(...n) || 1;
    return [n[0] / mag, n[1] / mag, n[2] / mag];
  }));
  for (let k = 0; k < anelli.length - 1; k++) {
    for (let i = 0; i < passi; i++) {
      const j = (i + 1) % passi;
      c.quadLiscio([punti[k][i], punti[k][j], punti[k + 1][j], punti[k + 1][i]],
        [normali[k][i], normali[k][j], normali[k + 1][j], normali[k + 1][i]]);
    }
  }
  c.poligono(punti[0], [0, -1, 0]);
  c.poligono(punti[punti.length - 1], [0, 1, 0]);
}

export function costruisciSanitario(tipo: "wc" | "bidet", centro: Centro, r: number, l: number, p: number, h: number, fabbrica: Fabbrica, modello?: string) {
  const compatto = modello === "sospeso_soft";
  const c = fabbrica(compatto ? "ceramica_satinata" : "ceramica");
  const sospeso = modello === "sospeso" || compatto, filoMuro = modello === "filo_muro";
  const wc = tipo === "wc";
  const ry = h * (sospeso ? .38 : .16);
  const zc = wc ? p * .06 : 0;
  const rx = l * (wc ? .465 : .5), rz = p * (wc ? .44 : .5);
  scolpisciBacino(c, centro, r, [
    { rx: l * (filoMuro ? .38 : .29), rz: p * (filoMuro ? .40 : .29), quota: sospeso ? ry : 0 },
    { rx: rx * .88, rz: rz * .88, quota: h * .67 },
    { rx, rz, quota: h * .94 },
    { rx: rx * .97, rz: rz * .97, quota: h },
    { rx: l * .345, rz: p * .305, quota: h },
    { rx: l * .218, rz: p * .19, quota: h * .57 },
  ], zc);
  if (wc && (!modello || modello === "cassetta_vista")) {
    const profondita = Math.min(.16, p * .44);
    c.scatola(centro.x, centro.z, h, l, profondita, .38, r, 0, -p / 2 + profondita / 2, 0, .021);
    fabbrica("metallo").scatola(centro.x, centro.z, h + .38, l * .16, profondita * .26, .005, r, 0, -p / 2 + profondita / 2, 0, .002);
  } else if (sospeso || filoMuro) {
    const aggancio = sospeso ? h * .44 : 0;
    c.scatola(centro.x, centro.z, aggancio, l * .72, p * .25, h * .89 - aggancio, r, 0, -p * .375, 0, .018);
  }
  if (compatto && wc) {
    const bordo = Math.min(.018, h * .057);
    scolpisciBacino(fabbrica("ceramica_smalto"), centro, r, [
      { rx: rx * .95, rz: rz * .95, quota: h - bordo * .32 },
      { rx: rx * .97, rz: rz * .97, quota: h + bordo * .62 },
      { rx: rx * .92, rz: rz * .93, quota: h + bordo },
      { rx: l * .347, rz: p * .308, quota: h + bordo },
      { rx: l * .345, rz: p * .305, quota: h - bordo * .34 },
    ], zc);
    const placca = fabbrica("grafite");
    const y = Math.max(1.03, h * 2.24), larghezza = Math.min(.23, l * .68);
    const z = -p / 2 + .008;
    placca.scatola(centro.x, centro.z, y, larghezza, .014, .142, r, 0, z, 0, .006);
    for (const [i, x] of [-.18, .18].entries()) fabbrica("inox").scatola(centro.x, centro.z, y + .047,
      larghezza * .238, .007, i ? .035 : .044, r, larghezza * x, z + .009, 0, .004);
  }
  if (!wc) rubinetto(fabbrica("metallo"), centro, r, p, h);
}

function rubinetto(c: CostruttoreMesh, centro: Centro, r: number, p: number, base: number) {
  c.scatola(centro.x, centro.z, base, .034, .038, .136, r, 0, -p * .39, 0, .012);
  c.scatola(centro.x, centro.z, base + .115, .033, p * .19, .024, r, 0, -p * .31, 0, .01);
}

export function costruisciLavabo(centro: Centro, r: number, l: number, p: number, h: number, fabbrica: Fabbrica, modello: string) {
  const appoggio = modello === "appoggio", sospeso = modello === "sospeso";
  const piano = appoggio ? h - Math.min(.16, h * .18) : h;
  const bordo = Math.min(.016, h * .035);
  const spessore = Math.min(appoggio ? .044 : .115, h * .29);
  const fondo = appoggio ? piano + (h - piano) * .13 : h - spessore * .81;
  const ceramica = fabbrica("ceramica");
  if (!sospeso) {
    const legno = fabbrica(modello === "incasso_rovere" ? "rovere_chiaro" : "legno");
    const base = h * .31;
    const frontale = p * .46;
    const sottopiano = piano - spessore;
    const cassetto = (sottopiano - base) / 2;
    legno.scatola(centro.x, centro.z, base, l * .945, p * .9, sottopiano - base, r, 0, -p * .035, 0, .009);
    for (const y of [base, base + cassetto]) {
      const fuga = Math.min(.003, cassetto * .1);
      legno.scatola(centro.x, centro.z, y + fuga, l * .945, p * .035, cassetto - fuga * 2,
        r, 0, frontale, 0, .006);
    }
    if (modello === "incasso_rovere") fabbrica("grafite").scatola(centro.x, centro.z, base + cassetto - .002,
      l * .88, p * .022, .005, r, 0, frontale - p * .020, 0, .001);
  }
  if (appoggio) {
    ceramica.scatola(centro.x, centro.z, piano - spessore, l, p, spessore, r, 0, 0, 0, .011);
    scolpisciBacino(ceramica, centro, r, [
      { rx: l * .34, rz: p * .29, quota: piano },
      { rx: l * .42, rz: p * .38, quota: h - bordo },
      { rx: l * .41, rz: p * .376, quota: h },
      { rx: l * .376, rz: p * .335, quota: h },
      { rx: l * .24, rz: p * .22, quota: fondo },
    ], p * .035);
  } else {
    scolpisciBacino(ceramica, centro, r, [
      { rx: l * .475, rz: p * .475, quota: h - spessore, forma: .23 },
      { rx: l * .5, rz: p * .5, quota: h - bordo, forma: .22 },
      { rx: l * .495, rz: p * .495, quota: h, forma: .22 },
      { rx: l * .359, rz: p * .344, quota: h, forma: .65 },
      { rx: l * .22, rz: p * .22, quota: fondo },
    ]);
  }
  fabbrica("metallo").scatola(centro.x, centro.z, fondo, .042, .042, .004, r, 0, appoggio ? p * .035 : 0, 0, .0018);
  rubinetto(fabbrica("metallo"), centro, r, p, piano);
}

export function costruisciVasca(centro: Centro, r: number, l: number, p: number, h: number, fabbrica: Fabbrica, modello: string) {
  const incasso = modello === "incasso", forma = incasso ? .22 : 1;
  const spa = modello === "spa_freestanding" && l >= 1.20 && p >= .52 && h >= .32;
  const c = Math.cos(r), s = Math.sin(r);
  const punto = (x: number, quota: number, z: number): V3 => [centro.x + x * c - z * s, quota, centro.z + x * s + z * c];
  const asse = spa ? l * .043 : 0, larghezza = l * (spa ? .914 : 1);
  const [x0, , z0] = punto(asse, 0, 0);
  scolpisciBacino(fabbrica("ceramica"), { x: x0, z: z0 }, r, [
    { rx: larghezza * (incasso ? .5 : .392), rz: p * (incasso ? .5 : .357), quota: 0, forma },
    { rx: larghezza * .5, rz: p * .5, quota: h - Math.min(.034, h * .1), forma },
    { rx: larghezza * .491, rz: p * .488, quota: h, forma },
    { rx: larghezza * (spa ? .459 : .433), rz: p * (spa ? .448 : .401), quota: h, forma: incasso ? .4 : .85 },
    { rx: larghezza * .337, rz: p * .301, quota: h * .21, forma: incasso ? .57 : .95 },
  ]);
  if (!spa) return;
  const acciaio = fabbrica("inox"), x = -l * .464, y = h + .165, bocca = -l * .295;
  acciaio.tubo([punto(x, .001, 0), punto(x, .015, 0)], Math.min(.038, l * .034), 18);
  acciaio.tubo([punto(x, .014, 0), punto(x, y - .058, 0),
    punto(x + .010, y - .017, 0), punto(x + .045, y, 0), punto(bocca - .022, y, 0),
    punto(bocca, y - .013, 0), punto(bocca, y - .036, 0)], .015, 14);
  acciaio.tubo([punto(x, h + .017, 0), punto(x, h + .017, .076), punto(x, h + .056, .080)], .008, 12);
  acciaio.tubo([punto(asse - l * .16, h * .21, 0), punto(asse - l * .16, h * .21 + .005, 0)], .024, 20);
  const troppoPieno = -l * .365;
  acciaio.tubo([punto(troppoPieno, h * .83, 0), punto(troppoPieno + .012, h * .83, 0)], .021, 18);
}
