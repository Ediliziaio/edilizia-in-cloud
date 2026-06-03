/**
 * tetto — helper geometrici per l'orientamento delle falde a partire dai dati
 * di Google Solar API (`roofSegmentStats`). Oggi azimut/pendenza erano hardcoded
 * (180°/30°): qui le funzioni pure per usare i valori REALI per falda e per
 * mostrare l'orientamento prevalente nell'offerta.
 *
 * Convenzioni:
 *  - Google Solar `azimuthDegrees`: 0 = Nord, 90 = Est, 180 = Sud, 270 = Ovest
 *    (orario da nord).
 *  - PVGIS `aspect`: 0 = Sud, +90 = Ovest, -90 = Est, ±180 = Nord.
 *
 * Puro e Deno-compatibile (mirror nell'edge fv-solar-api-fetch), interamente
 * testabile.
 */

const PUNTI = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;

/** Normalizza un angolo in [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Punto cardinale (8 settori) dato l'azimut Google (0 = Nord, orario). */
export function puntoCardinale(azGradiDaNord: number): string {
  const idx = Math.round(norm360(azGradiDaNord) / 45) % 8;
  return PUNTI[idx];
}

/** Etichetta orientamento per l'offerta, es. "SE 135°". */
export function etichettaAzimut(azGradiDaNord: number): string {
  const g = Math.round(norm360(azGradiDaNord));
  return `${puntoCardinale(g)} ${g}°`;
}

/**
 * Converte l'azimut Google (0 = Nord, orario) nella convenzione PVGIS
 * (`aspect`: 0 = Sud, +Ovest, -Est, range [-180, 180]).
 */
export function azimutSolareAPvgis(azGradiDaNord: number): number {
  let a = norm360(azGradiDaNord - 180); // 0..360 da sud, orario (verso ovest)
  if (a > 180) a -= 360; // → [-180, 180]
  return a;
}

export interface SegmentoTetto {
  /** Area della falda in m² (per scegliere la prevalente). */
  area_mq: number;
  /** Azimut Google (0 = Nord, orario). */
  azimuth_deg: number;
  /** Pendenza falda in gradi. */
  pitch_deg: number;
}

/** Falda prevalente = quella con area maggiore (null se lista vuota). */
export function segmentoTettoDominante(segs: SegmentoTetto[]): SegmentoTetto | null {
  if (!segs.length) return null;
  return segs.reduce((best, s) => (s.area_mq > best.area_mq ? s : best), segs[0]);
}
