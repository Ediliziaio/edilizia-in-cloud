/**
 * layout — proiezione geografica del layout REALE dei pannelli (coordinate
 * lat/lng estratte da Google Solar API) in uno spazio SVG locale, per
 * disegnare la disposizione vera sul tetto invece del mock generico.
 *
 * Gap vs Reonic/Autarc (analisi progettazione): oggi `fv-solar-api-fetch`
 * scarica `layout_suggerito[]` con la posizione di ogni pannello, ma il PDF la
 * BUTTA e disegna una griglia finta a 4 colonne. Questo modulo trasforma le
 * coordinate reali in rettangoli proiettati (correzione coseno-latitudine,
 * proporzioni reali preservate, colore per falda) pronti per SVG/React.
 *
 * Puro e senza side-effect → riusabile lato client (vista in app) e lato edge
 * (PDF), e interamente testabile.
 */

export interface PannelloGeo {
  centro_lat: number;
  centro_lng: number;
  orientamento?: "LANDSCAPE" | "PORTRAIT";
  /** Indice falda (per colorare gruppi diversi). */
  segment_index?: number;
}

export interface RettangoloPannello {
  x: number;
  y: number;
  w: number;
  h: number;
  segment: number;
}

export interface LayoutProiettato {
  width: number;
  height: number;
  rects: RettangoloPannello[];
  count: number;
}

export interface OpzioniLayout {
  /** Larghezza target del viewport SVG (default 600 unità). */
  targetWidth?: number;
  /** Lato lungo del pannello in metri (default 1.72). */
  panelLongM?: number;
  /** Lato corto del pannello in metri (default 1.13). */
  panelShortM?: number;
  /** Margine interno in unità SVG (default 12). */
  margin?: number;
}

const M_PER_GRADO_LAT = 110540; // metri per grado di latitudine (medio)

/** Metri per grado di longitudine alla latitudine data (correzione coseno). */
export function metriPerGradoLng(latGradi: number): number {
  return 111320 * Math.cos((latGradi * Math.PI) / 180);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Proietta i pannelli (lat/lng) in rettangoli in uno spazio SVG locale.
 * Usa lo STESSO fattore di scala su X e Y → proporzioni reali del tetto
 * preservate. Y è invertito (nord in alto).
 */
export function proiettaLayout(
  panels: PannelloGeo[],
  opts: OpzioniLayout = {},
): LayoutProiettato {
  const targetWidth = opts.targetWidth ?? 600;
  const panelLongM = opts.panelLongM ?? 1.72;
  const panelShortM = opts.panelShortM ?? 1.13;
  const margin = opts.margin ?? 12;

  if (panels.length === 0) {
    return { width: 0, height: 0, rects: [], count: 0 };
  }

  const meanLat = panels.reduce((s, p) => s + p.centro_lat, 0) / panels.length;
  const mPerLng = metriPerGradoLng(meanLat);

  // Centro di ogni pannello in metri + dimensioni reali secondo l'orientamento.
  const pts = panels.map((p) => {
    const xm = p.centro_lng * mPerLng;
    const ym = p.centro_lat * M_PER_GRADO_LAT;
    const landscape = p.orientamento !== "PORTRAIT";
    const wM = landscape ? panelLongM : panelShortM;
    const hM = landscape ? panelShortM : panelLongM;
    return { xm, ym, wM, hM, segment: p.segment_index ?? 0 };
  });

  // Bounding box che include l'estensione dei pannelli (non solo i centri).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.xm - p.wM / 2);
    maxX = Math.max(maxX, p.xm + p.wM / 2);
    minY = Math.min(minY, p.ym - p.hM / 2);
    maxY = Math.max(maxY, p.ym + p.hM / 2);
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const contentW = Math.max(1, targetWidth - 2 * margin);
  const scale = spanX > 0 ? contentW / spanX : 1; // unità SVG per metro

  const rects: RettangoloPannello[] = pts.map((p) => {
    const cx = (p.xm - minX) * scale + margin;
    const cy = (maxY - p.ym) * scale + margin; // flip Y: nord in alto
    const w = p.wM * scale;
    const h = p.hM * scale;
    return {
      x: round1(cx - w / 2),
      y: round1(cy - h / 2),
      w: round1(w),
      h: round1(h),
      segment: p.segment,
    };
  });

  return {
    width: round1(targetWidth),
    height: round1(spanY * scale + 2 * margin),
    rects,
    count: panels.length,
  };
}

/** Riquadro di destinazione (in unità SVG) in cui inscrivere il layout. */
export interface Riquadro {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Proietta i pannelli inscrivendoli in un RIQUADRO dato (es. l'area-tetto del
 * PDF), centrati e con proporzioni reali preservate (scala = min su X/Y).
 * Variante usata dalla vista zenitale del PDF (mirror nell'edge fvSvgCharts).
 */
export function proiettaLayoutInRiquadro(
  panels: PannelloGeo[],
  box: Riquadro,
  opts: { panelLongM?: number; panelShortM?: number } = {},
): RettangoloPannello[] {
  if (panels.length === 0) return [];
  const panelLongM = opts.panelLongM ?? 1.72;
  const panelShortM = opts.panelShortM ?? 1.13;

  const meanLat = panels.reduce((s, p) => s + p.centro_lat, 0) / panels.length;
  const mPerLng = metriPerGradoLng(meanLat);

  const pts = panels.map((p) => {
    const xm = p.centro_lng * mPerLng;
    const ym = p.centro_lat * M_PER_GRADO_LAT;
    const landscape = p.orientamento !== "PORTRAIT";
    return {
      xm,
      ym,
      wM: landscape ? panelLongM : panelShortM,
      hM: landscape ? panelShortM : panelLongM,
      segment: p.segment_index ?? 0,
    };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.xm - p.wM / 2);
    maxX = Math.max(maxX, p.xm + p.wM / 2);
    minY = Math.min(minY, p.ym - p.hM / 2);
    maxY = Math.max(maxY, p.ym + p.hM / 2);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min(box.w / spanX, box.h / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offX = box.x + (box.w - drawW) / 2;
  const offY = box.y + (box.h - drawH) / 2;

  return pts.map((p) => {
    const cx = offX + (p.xm - minX) * scale;
    const cy = offY + (maxY - p.ym) * scale; // flip Y (nord in alto)
    const w = p.wM * scale;
    const h = p.hM * scale;
    return {
      x: round1(cx - w / 2),
      y: round1(cy - h / 2),
      w: round1(w),
      h: round1(h),
      segment: p.segment,
    };
  });
}

/** Palette per colorare le diverse falde. */
const PALETTE_FALDE = ["#1e3a5f", "#2c5184", "#3b6ba5", "#f59e0b", "#10b981", "#8b5cf6"];

/**
 * Genera una stringa SVG self-contained con il layout reale dei pannelli.
 * Stringa vuota se non ci sono pannelli (il chiamante mostra un fallback).
 */
export function layoutToSvg(panels: PannelloGeo[], opts: OpzioniLayout = {}): string {
  const proj = proiettaLayout(panels, opts);
  if (proj.count === 0) return "";

  const rects = proj.rects
    .map((r) => {
      const fill = PALETTE_FALDE[r.segment % PALETTE_FALDE.length];
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="1.5" fill="${fill}" stroke="#0f172a" stroke-width="0.6" opacity="0.92"/>`;
    })
    .join("");

  return (
    `<svg viewBox="0 0 ${proj.width} ${proj.height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Disposizione reale di ${proj.count} pannelli sul tetto">` +
    `<rect x="0" y="0" width="${proj.width}" height="${proj.height}" fill="#e2e8f0" rx="6"/>` +
    rects +
    `</svg>`
  );
}
