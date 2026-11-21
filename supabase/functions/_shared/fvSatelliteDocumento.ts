import type { DisegnoCommercialeFv } from "./fvDisegnoCommerciale.ts";
import { coordinateDaMetri, pixelDaCoordinate, type PosizioneMappaFv } from "./fvMappa.ts";
import { geometriaTettoDocumento } from "./fvTettoDocumento.ts";

export type SatelliteDocumentoFv = {
  img?: string; centro: PosizioneMappaFv; zoom: number; w: number; h: number;
  provider: "google";
};
export function inquadraturaSatellitePdf(piano: DisegnoCommercialeFv) {
  const g = geometriaTettoDocumento(piano);
  if (!g || !piano.mappa) return null;
  const ps = g.falde.flatMap(f => f.punti);
  const centro = coordinateDaMetri({ x: (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x))) / 2, y: (Math.min(...ps.map(p => p.y)) + Math.max(...ps.map(p => p.y))) / 2 }, piano.mappa.origine);
  const w = 640, h = 440;
  let zoom = 21;
  while (zoom > 14) {
    const dentro = ps.every(p => { const q = pixelDaCoordinate(coordinateDaMetri(p, piano.mappa!.origine), centro, zoom, w, h); return q.x > 48 && q.x < w - 48 && q.y > 48 && q.y < h - 48; });
    if (dentro) break;
    zoom--;
  }
  return { centro, zoom, w, h };
}

/** La foto resta intera, comprese le attribuzioni; i pannelli usano XYZ salvati,
 * proiettati sulle coordinate della medesima inquadratura richiesta al provider. */
export function svgSatelliteDocumento(piano: DisegnoCommercialeFv, immagine: SatelliteDocumentoFv) {
  const g = geometriaTettoDocumento(piano);
  if (!g || !piano.mappa || (immagine.img && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(immagine.img))) return "";
  const at = (p: {x:number;y:number}) => pixelDaCoordinate(coordinateDaMetri(p, piano.mappa!.origine), immagine.centro, immagine.zoom, immagine.w, immagine.h);
  const punti = (ps: Array<{x:number;y:number}>) => ps.map(at).map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${immagine.w} ${immagine.h}" role="img" aria-label="Vista satellitare del tetto con i pannelli nella posizione salvata" style="width:100%;height:100%">${immagine.img ? `<image href="${immagine.img}" width="${immagine.w}" height="${immagine.h}" preserveAspectRatio="none"/>` : ""}${g.falde.map(f => `<polygon points="${punti(f.punti)}" fill="#4ade80" fill-opacity=".08" stroke="#58e2b2" stroke-width="1.5"/>`).join("")}${g.pannelli.map(p => `<polygon data-fv-satellite-panel="true" points="${punti(p.punti)}" fill="#182f43" fill-opacity=".86" stroke="#d1e0e8" stroke-width=".6"/>`).join("")}${g.ostacoli.map(o => `<polygon points="${punti(o.punti)}" fill="#e8ad65" fill-opacity=".7" stroke="#9a631e" stroke-width=".7"/>`).join("")}</svg>`;
}
