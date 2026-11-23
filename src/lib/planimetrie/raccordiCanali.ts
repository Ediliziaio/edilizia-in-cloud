import type { PuntoTavola } from "../../../shared/planimetrie/letturaAssistita";
import type { ReteAria } from "./tavolaTecnica";

export type RamoRaccordo = { trattoId: string; asse: "x" | "y"; verso: -1 | 1 };
export type RaccordoCanale = {
  id: string;
  tipo: "curva" | "derivazione";
  rete: ReteAria;
  punto: PuntoTavola;
  rami: RamoRaccordo[];
  trattoCoperto: boolean;
};
export type IncrocioCanali = {
  id: string;
  punto: PuntoTavola;
  tratti: [string, string];
  reti: "distinte" | "stessa";
  trattoCoperto: boolean;
};
export type AsseRaccordo = {
  id: string;
  rete: ReteAria;
  verticale: boolean;
  asse: number;
  inizio: number;
  fine: number;
  spessoreGrafico: number;
};
type RasterCanali = { colori: Uint8Array; larghezza: number; altezza: number; codiceMandata: number };
type Direzione = { x: number; y: number };

export const NOMI_RACCORDI = { curva: "Curva a 90°", derivazione: "Derivazione a T" } as const;

const fuori = (asse: AsseRaccordo, p: number) => Math.max(asse.inizio - p, p - asse.fine, 0);
const versoVicino = (asse: AsseRaccordo, p: number): -1 | 1 => p - asse.inizio > asse.fine - p ? -1 : 1;
const continua = (asse: AsseRaccordo, p: number, margine: number) => p > asse.inizio + margine && p < asse.fine - margine;
const ramo = (t: AsseRaccordo, verso: -1 | 1): RamoRaccordo => ({ trattoId: t.id, asse: t.verticale ? "y" : "x", verso });
const direzione = (r: RamoRaccordo): Direzione => r.asse === "x" ? { x: r.verso, y: 0 } : { x: 0, y: r.verso };
const codiceDi = (rete: ReteAria, raster: RasterCanali) => rete === "mandata" ? raster.codiceMandata : 3 - raster.codiceMandata;
const tinta = (x: number, y: number, r: RasterCanali) => x >= 0 && x < r.larghezza && y >= 0 && y < r.altezza && r.colori[y * r.larghezza + x];

/** Cerca una sola campitura connessa che tocca tutti i bracci del nodo nel foglio. */
function campituraContinua(p: Direzione, rami: RamoRaccordo[], raggio: number, codice: number, raster: RasterCanali) {
  const cx = Math.round(p.x), cy = Math.round(p.y), lato = 2 * raggio + 1;
  const visitati = new Uint8Array(lato * lato);
  const direzioni = rami.map(direzione);
  const soglia = Math.round(raggio * .62), semilarghezza = Math.max(3, Math.round(raggio * .42));
  const tutti = (1 << rami.length) - 1;
  for (let indice = 0; indice < visitati.length; indice++) {
    if (visitati[indice]) continue;
    const coda = [indice];
    let bracci = 0;
    visitati[indice] = 1;
    for (let j = 0; j < coda.length; j++) {
      const i = coda[j], x = i % lato - raggio, y = Math.floor(i / lato) - raggio;
      if (tinta(cx + x, cy + y, raster) !== codice) continue;
      direzioni.forEach((d, n) => {
        if (x * d.x + y * d.y >= soglia && Math.abs(x * d.y - y * d.x) <= semilarghezza) bracci |= 1 << n;
      });
      if (bracci === tutti) return true;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (Math.abs(x + dx) > raggio || Math.abs(y + dy) > raggio) continue;
        const prossimo = i + dy * lato + dx;
        if (visitati[prossimo]) continue;
        visitati[prossimo] = 1;
        coda.push(prossimo);
      }
    }
  }
  return false;
}

function riappareOltreIncrocio(t: AsseRaccordo, s: AsseRaccordo, raster: RasterCanali, scala: number) {
  const s1 = versoVicino(t, s.asse);
  const codice = codiceDi(t.rete, raster);
  const da = Math.max(3, Math.round(s.spessoreGrafico / 2));
  const lato = Math.min(16 * scala, Math.max(4 * scala, t.spessoreGrafico / 2));
  let campioniConTinta = 0;
  for (let a = da; a <= da + 32 * scala; a += 2) {
    const lungo = s.asse - s1 * a;
    for (let b = -lato; b <= lato; b += 2) {
      const traverso = t.asse + b;
      if (tinta(Math.round(t.verticale ? traverso : lungo), Math.round(t.verticale ? lungo : traverso), raster) !== codice) continue;
      campioniConTinta++;
      break;
    }
    if (campioniConTinta >= 4) return true;
  }
  return false;
}

/** Ricollega visivamente il breve lembo visibile oltre una sovrapposizione di colore. */
function trattoOltreCopertura(t: AsseRaccordo, p: number, raster: RasterCanali, scala: number) {
  const gap = fuori(t, p);
  if (!gap || gap > 58 * scala) return false;
  const verso = versoVicino(t, p), c = codiceDi(t.rete, raster);
  let diAltraRete = 0, dellaRete = 0, campioni = 0;
  for (let d = 2; d < gap; d += 2) {
    const lungo = Math.round(p + d * verso);
    const asse = Math.round(t.asse);
    const pixel = tinta(t.verticale ? asse : lungo, t.verticale ? lungo : asse, raster);
    if (pixel === c) dellaRete++;
    if (pixel === 3 - c) diAltraRete++;
    campioni++;
  }
  return campioni > 0 && dellaRete >= 3 && diAltraRete >= 3 && (dellaRete + diAltraRete) / campioni >= .7;
}

/** Le connessioni in pianta dipendono dalla campitura, le quote di posa non sono dedotte. */
export function rilevaRaccordiCanali(assi: AsseRaccordo[], raster: RasterCanali) {
  const raccordi: RaccordoCanale[] = [], incroci: IncrocioCanali[] = [];
  const { larghezza: w, altezza: h } = raster;
  const scala = Math.max(w, h) / 1280;
  const vicini = (a: PuntoTavola, b: PuntoTavola) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h) <= 10 * scala;
  const verticali = assi.filter(t => t.verticale);
  for (const o of assi.filter(t => !t.verticale)) {
    for (const v of verticali) {
      const x = v.asse, y = o.asse;
      const punto = { x: x / w, y: y / h };
      const gapX = fuori(o, x), gapY = fuori(v, y);
      const margineX = Math.min(24 * scala, Math.max(7 * scala, v.spessoreGrafico * .68));
      const margineY = Math.min(24 * scala, Math.max(7 * scala, o.spessoreGrafico * .68));
      if (o.rete !== v.rete) {
        if (gapX > margineX || gapY > margineY) continue;
        const passaO = continua(o, x, margineX), passaV = continua(v, y, margineY);
        const traversa = (passaO || riappareOltreIncrocio(o, v, raster, scala)) && (passaV || riappareOltreIncrocio(v, o, raster, scala));
        if ((!passaO && !passaV) || !traversa || incroci.some(i => i.reti === "distinte" && vicini(punto, i.punto))) continue;
        incroci.push({ id: `incrocio-${incroci.length + 1}`, punto, tratti: [o.id, v.id], reti: "distinte", trattoCoperto: !passaO || !passaV });
        continue;
      }
      const coperto = gapX > margineX || gapY > margineY;
      if ((gapX > margineX && !trattoOltreCopertura(o, x, raster, scala)) || (gapY > margineY && !trattoOltreCopertura(v, y, raster, scala))) continue;
      const oPassa = continua(o, x, margineX), vPassa = continua(v, y, margineY);
      let rami = [
        ...(oPassa ? [ramo(o, -1), ramo(o, 1)] : [ramo(o, versoVicino(o, x))]),
        ...(vPassa ? [ramo(v, -1), ramo(v, 1)] : [ramo(v, versoVicino(v, y))]),
      ];
      const raggio = Math.round(Math.min(35 * scala, Math.max(12 * scala, Math.max(o.spessoreGrafico, v.spessoreGrafico) * 1.1)));
      if (raggio < 2) continue;
      const copreIrami = (bracci: RamoRaccordo[]) => campituraContinua({ x, y }, bracci, raggio, codiceDi(o.rete, raster), raster);
      if (!copreIrami(rami)) {
        // Un tratto corto oltre l'asse può essere il bordo della curva, non un braccio.
        const codaCorta = (t: AsseRaccordo, lungo: number) => Math.min(lungo - t.inizio, t.fine - lungo) <= raggio * .8;
        const minimi = rami.filter(r => {
          const orizzontale = r.asse === "x";
          const t = orizzontale ? o : v, lungo = orizzontale ? x : y;
          return !codaCorta(t, lungo) || r.verso === versoVicino(t, lungo);
        });
        if (minimi.length === rami.length || !copreIrami(minimi)) continue;
        rami = minimi;
      }
      if (rami.length === 4) {
        if (!incroci.some(i => i.reti === "stessa" && vicini(punto, i.punto))) {
          incroci.push({ id: `incrocio-${incroci.length + 1}`, punto, tratti: [o.id, v.id], reti: "stessa", trattoCoperto: false });
        }
        continue;
      }
      if (raccordi.some(r => r.rete === o.rete && vicini(r.punto, punto))) continue;
      raccordi.push({ id: `raccordo-${raccordi.length + 1}`, rete: o.rete, punto, tipo: rami.length === 2 ? "curva" : "derivazione", rami, trattoCoperto: coperto });
    }
  }
  return { raccordi, incroci };
}
