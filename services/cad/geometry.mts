/// <reference types="node" />
import type { QuoteCadGeometry } from '../../src/lib/preventivi/quoteCad.ts';

/**
 * Misure ricavate dalle polilinee chiuse di un DWG.
 *
 * Sono IPOTESI da confermare, mai quantità: un DWG ottenuto da un PDF (layer «PDF3_…») non ha contorni
 * di locali veri, e le unità dichiarate nell'intestazione sono spesso sbagliate (nel disegno di prova
 * dichiaravano millimetri mentre l'edificio era misurato in metri). Per questo:
 *  - l'unità si deduce dalle dimensioni dell'ingombro, confrontandola con l'intestazione;
 *  - un locale è la forma chiusa PIÙ PICCOLA, di dimensione plausibile, che contiene un'etichetta di locale;
 *  - il risultato porta sempre «da verificare» e il motivo delle scelte.
 */
export type RawPoly = { layer: string; pts: number[][]; area: number; perimeter: number; minX: number; minY: number; maxX: number; maxY: number };
export type RawText = { text: string; x: number; y: number; handle: string };

const ROOM = /\b(?:bagn[oi]|antibagn[oi]|wc|serviz\w*|cucin\w*|camer\w*|soggiorn\w*|ingress\w*|corridoi\w*|disimpegn\w*|ripostigli\w*|lavander\w*|magazzin\w*|deposit\w*|uffic\w*|aul[ae]|sal[ae]|cell[ae]|locale|spogliatoi\w*|doccia|studio|stanza|taverna|garage|box|cantina|terrazz\w*|balcon\w*|vano|reception|accoglienz\w*|infermeri\w*|mensa|refettori\w*|laborator\w*|archivi\w*|sala)\b/i;
const TITLE = /(?:planimetria|piano\s+(?:terra|primo|secondo|terzo|interrato|seminterrato|rialzato)|pianta|copertura|sottotetto)/i;
const FACTOR = { m: 1, cm: 0.01, mm: 0.001 } as const;
type Unit = keyof typeof FACTOR;
// INSUNITS di AutoCAD: 4 = millimetri, 5 = centimetri, 6 = metri.
const HEADER_UNIT: Record<number, Unit> = { 4: 'mm', 5: 'cm', 6: 'm' };
// Formati di foglio (mm) e rapporto 1,414: il bordo del cartiglio non è un edificio.
const SHEETS_MM = [210, 297, 420, 594, 841, 1189];

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function polyMetrics(pts: number[][]): { area: number; perimeter: number; minX: number; minY: number; maxX: number; maxY: number } | null {
  if (pts.length < 3) return null;
  let a = 0, perimeter = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    if (![x1, y1, x2, y2].every(Number.isFinite) || Math.abs(x1) > 1e9 || Math.abs(y1) > 1e9) return null;
    a += x1 * y2 - x2 * y1; perimeter += Math.hypot(x2 - x1, y2 - y1);
    minX = Math.min(minX, x1); maxX = Math.max(maxX, x1); minY = Math.min(minY, y1); maxY = Math.max(maxY, y1);
  }
  const area = Math.abs(a) / 2;
  return area > 0 ? { area, perimeter, minX, minY, maxX, maxY } : null;
}

function inside(poly: RawPoly, x: number, y: number): boolean {
  if (x < poly.minX || x > poly.maxX || y < poly.minY || y > poly.maxY) return false;
  let c = false;
  for (let i = 0, j = poly.pts.length - 1; i < poly.pts.length; j = i++) {
    const [xi, yi] = poly.pts[i], [xj, yj] = poly.pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function isSheetFrame(p: RawPoly): boolean {
  const w = p.maxX - p.minX, h = p.maxY - p.minY, long = Math.max(w, h), short = Math.min(w, h);
  if (!short || Math.abs(long / short - 1.414) > 0.03) return false;
  return SHEETS_MM.some(s => [1, 0.1, 0.001].some(f => Math.abs(long - s * f) / (s * f) < 0.02));
}

export function buildCadGeometry(polys: RawPoly[], texts: RawText[], insunits: number | null, closedTotal: number, pdfImported: boolean): QuoteCadGeometry | undefined {
  const usable = polys.filter(p => !isSheetFrame(p));
  if (!usable.length) return undefined;
  const sorted = [...usable].sort((a, b) => b.area - a.area);
  const ref = sorted[0], maxSide = Math.max(ref.maxX - ref.minX, ref.maxY - ref.minY);
  const plausible = (u: Unit) => { const m = maxSide * FACTOR[u]; return m >= 3 && m <= 300; };
  const header = insunits != null ? HEADER_UNIT[insunits] : undefined;
  let units: Unit | 'unknown' = 'unknown', reason = 'Le dimensioni del disegno non corrispondono a un edificio in nessuna unità nota.', conflict = false;
  if (header && plausible(header)) { units = header; reason = `L'intestazione dichiara ${header === 'm' ? 'metri' : header === 'cm' ? 'centimetri' : 'millimetri'} e l'ingombro lo conferma.`; }
  else {
    const guess = (['m', 'cm', 'mm'] as Unit[]).find(plausible);
    if (guess) {
      units = guess; conflict = !!header && header !== guess;
      reason = header
        ? `L'intestazione dichiara ${header === 'm' ? 'metri' : header === 'cm' ? 'centimetri' : 'millimetri'}, ma l'ingombro (${round(maxSide, 2)} unità) ha senso solo in ${guess === 'm' ? 'metri' : guess === 'cm' ? 'centimetri' : 'millimetri'}.`
        : `Unità non dichiarate: l'ingombro (${round(maxSide, 2)} unità) ha senso in ${guess === 'm' ? 'metri' : guess === 'cm' ? 'centimetri' : 'millimetri'}.`;
    }
  }
  const base = {
    units, unitsReason: reason, headerConflict: conflict, closedShapes: closedTotal, analyzedShapes: polys.length,
    reliability: pdfImported ? 'bassa' as const : 'media' as const,
    note: pdfImported
      ? 'Disegno ottenuto da un PDF: le forme chiuse sono tracciati grafici, non locali veri. Misure indicative, da verificare con una quota nota.'
      : 'Misure ricavate dalle forme chiuse del disegno: da verificare con una quota nota prima di usarle.',
  };
  if (units === 'unknown') return { ...base, footprints: [], rooms: [] };
  const f = FACTOR[units], f2 = f * f;
  // Sagome uguali (entro l'1%) = lo stesso edificio ripetuto sui piani: un solo ingombro, col numero di ripetizioni e i titoli vicini.
  const groups: Array<{ p: RawPoly; count: number; titles: Set<string> }> = [];
  for (const p of sorted) {
    const w = p.maxX - p.minX, h = p.maxY - p.minY;
    const g = groups.find(x => Math.abs((x.p.maxX - x.p.minX) - w) / w < 0.01 && Math.abs((x.p.maxY - x.p.minY) - h) / h < 0.01);
    // Il titolo più vicino al centro dell'ingombro dice di che piano si tratta («PLANIMETRIA PIANO TERRA»).
    const cx = (p.minX + p.maxX) / 2, cy = (p.minY + p.maxY) / 2, reach = Math.max(w, h) * 1.2;
    let title: string | undefined, bestD = Infinity;
    for (const t of texts) { if (t.text.length > 60 || !TITLE.test(t.text)) continue; const d = Math.hypot(t.x - cx, t.y - cy); if (d < bestD && d <= reach) { bestD = d; title = t.text.trim(); } }
    if (g) { g.count++; if (title) g.titles.add(title); }
    else if (groups.length < 3) groups.push({ p, count: 1, titles: new Set(title ? [title] : []) });
  }
  const footprints: QuoteCadGeometry['footprints'] = groups.map(g => ({
    layer: g.p.layer.slice(0, 160), areaM2: round(g.p.area * f2), widthM: round((g.p.maxX - g.p.minX) * f), heightM: round((g.p.maxY - g.p.minY) * f),
    count: Math.min(g.count, 100000), ...(g.titles.size ? { titles: [...g.titles].slice(0, 4) } : {}),
  }));
  const minArea = ref.area / 250, maxArea = ref.area * 0.7;
  const candidates = usable.filter(p => p.area >= minArea && p.area <= maxArea).sort((a, b) => a.area - b.area);
  const roomTexts = texts.filter(t => t.text.length <= 80 && ROOM.test(t.text));
  // Un contorno che racchiude etichette di locali DIVERSI è una zona (una striscia di muri, un'area di piano), non un locale.
  const labelsInside = new Map<RawPoly, Set<string>>();
  for (const p of candidates) {
    const set = new Set<string>();
    for (const t of roomTexts) if (inside(p, t.x, t.y)) set.add(t.text.trim().toLowerCase());
    labelsInside.set(p, set);
  }
  const rooms: QuoteCadGeometry['rooms'] = [], seen = new Set<string>();
  for (const t of roomTexts) {
    const label = t.text.trim().toLowerCase();
    const best = candidates.find(p => (labelsInside.get(p)?.size ?? 0) <= 1 && labelsInside.get(p)?.has(label) && inside(p, t.x, t.y));
    if (!best) continue;
    const key = `${label}|${round(best.area, 3)}|${round(best.minX, 2)}|${round(best.minY, 2)}`;
    if (seen.has(key)) continue; seen.add(key);
    rooms.push({ label: t.text.trim().slice(0, 80), layer: best.layer.slice(0, 160), handle: t.handle.slice(0, 32), areaM2: round(best.area * f2),
      perimeterM: round(best.perimeter * f), widthM: round((best.maxX - best.minX) * f), heightM: round((best.maxY - best.minY) * f) });
  }
  rooms.sort((a, b) => b.areaM2 - a.areaM2);
  return { ...base, footprints, rooms: rooms.slice(0, 40) };
}
