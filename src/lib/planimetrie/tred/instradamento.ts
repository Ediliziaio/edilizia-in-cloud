/**
 * Dove passa un tubo tra due punti: invece di tagliare la stanza sempre «x poi z», prova le due «L» e,
 * quando serve, un percorso che costeggia un muro, e sceglie quello che buca meno muri (ogni muro bucato
 * è una carotatura in più) e, a parità, quello che resta più vicino ai muri (tubi in traccia, non in mezzo).
 * Percorso a segmenti ortogonali, in cm. La lunghezza stimata per il computo resta quella di shared.
 */
import type { MuroPer3D } from "./tipi";

type P = { x: number; y: number };
const FUORI_PUNTA = 12; // cm: un muro toccato solo in testa al tubo (il simbolo è addossato) non conta come attraversato

function incrocia(a: P, b: P, m: MuroPer3D): boolean {
  const ex = m.b.x - m.a.x, ey = m.b.y - m.a.y;
  const dx = b.x - a.x, dy = b.y - a.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return false;
  const t = ((m.a.x - a.x) * ey - (m.a.y - a.y) * ex) / den;
  const u = ((m.a.x - a.x) * dy - (m.a.y - a.y) * dx) / den;
  const lung = Math.hypot(dx, dy);
  if (lung < 1) return false;
  const margine = FUORI_PUNTA / lung;
  return t > margine && t < 1 - margine && u >= 0 && u <= 1;
}

function distanzaDalMuro(p: P, m: MuroPer3D): number {
  const ex = m.b.x - m.a.x, ey = m.b.y - m.a.y;
  const l2 = ex * ex + ey * ey;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - m.a.x) * ex + (p.y - m.a.y) * ey) / l2));
  return Math.hypot(p.x - (m.a.x + t * ex), p.y - (m.a.y + t * ey));
}

function valuta(percorso: P[], muri: readonly MuroPer3D[]): number {
  let bucati = 0, lontano = 0, lunghezza = 0;
  for (let i = 0; i < percorso.length - 1; i++) {
    const a = percorso[i], b = percorso[i + 1];
    const l = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    lunghezza += l;
    for (const m of muri) if (incrocia(a, b, m)) bucati++;
    if (muri.length && l > 1) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      lontano += l * Math.min(...muri.map((m) => distanzaDalMuro(mid, m)));
    }
  }
  // i muri bucati pesano più di qualsiasi giro; poi i metri; poi quanto il tubo sta lontano dai muri
  return bucati * 1e6 + lunghezza * 100 + lontano / 100;
}

/** Punti del percorso ortogonale da `da` ad `a` (inclusi), scelto fra le varianti. */
export function instradaTubo(da: P, a: P, muri: readonly MuroPer3D[]): P[] {
  const dritto = Math.abs(da.x - a.x) < 1 || Math.abs(da.y - a.y) < 1;
  const candidati: P[][] = dritto ? [[da, a]] : [
    [da, { x: a.x, y: da.y }, a],
    [da, { x: da.x, y: a.y }, a],
  ];
  if (!dritto && muri.length) {
    // costeggia il muro ortogonale più vicino al centro: passa lungo la sua linea, spostata di mezzo spessore + 3 cm sul lato del tubo
    const centro = { x: (da.x + a.x) / 2, y: (da.y + a.y) / 2 };
    const xMin = Math.min(da.x, a.x), xMax = Math.max(da.x, a.x), yMin = Math.min(da.y, a.y), yMax = Math.max(da.y, a.y);
    for (const m of muri) {
      const verticale = Math.abs(m.b.x - m.a.x) < 2, orizzontale = Math.abs(m.b.y - m.a.y) < 2;
      if (verticale) {
        const x = m.a.x + (centro.x >= m.a.x ? 1 : -1) * (m.spessore / 2 + 3);
        if (x > xMin && x < xMax) candidati.push([da, { x, y: da.y }, { x, y: a.y }, a]);
      } else if (orizzontale) {
        const y = m.a.y + (centro.y >= m.a.y ? 1 : -1) * (m.spessore / 2 + 3);
        if (y > yMin && y < yMax) candidati.push([da, { x: da.x, y }, { x: a.x, y }, a]);
      }
    }
  }
  return candidati.map((c) => ({ c, v: valuta(c, muri) })).sort((p, q) => p.v - q.v)[0].c;
}
