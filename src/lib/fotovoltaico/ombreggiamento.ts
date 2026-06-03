/**
 * ombreggiamento — stima della perdita di producibilità dovuta all'ORIZZONTE
 * (monti, colline, edifici lontani). Gap vs Reonic/Autarc: oggi non c'è alcun
 * numero di shading; qui una stima "lite" dal profilo d'orizzonte che PVGIS
 * espone (elevazione del terreno per azimut). NON è il near-shading 3D dei
 * competitor, ma fornisce un primo valore credibile.
 *
 * Convenzione azimut: Google/compass 0 = Nord, 90 = Est, 180 = Sud, 270 = Ovest.
 * La perdita pesa di più gli ostacoli a Sud (dove transita gran parte del sole).
 *
 * Puro e testabile; il profilo arriva (a regime) da fv-pvgis-fetch.
 */

export interface PuntoOrizzonte {
  /** Azimut in gradi (0 = Nord, orario). */
  azimuth_deg: number;
  /** Elevazione dell'orizzonte in quel punto (gradi sopra l'orizzontale). */
  elevation_deg: number;
}

export interface OpzioniOmbra {
  /** Perdita stimata per grado medio di orizzonte nell'arco solare (default 1.2%/°). */
  perditaPerGrado?: number;
  /** Cap massimo della perdita stimata (default 0.40 = 40%). */
  perditaMax?: number;
}

function norm360(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** Peso solare di un azimut: 1 a Sud (180°), 0 a Nord, ~cos della distanza dal Sud. */
export function pesoSolare(azimuth_deg: number): number {
  const diff = norm360(azimuth_deg) - 180; // 0 a Sud
  const w = Math.cos((diff * Math.PI) / 180);
  return Math.max(0, w); // solo l'emisfero sud (E→S→O) contribuisce
}

/**
 * Stima la perdita percentuale (0..1) da ombreggiamento d'orizzonte.
 * Media dell'elevazione d'orizzonte pesata sull'arco solare (Sud), × fattore.
 * Profilo vuoto o orizzonte piatto → 0.
 */
export function stimaPerditaOrizzontePct(
  profilo: PuntoOrizzonte[],
  opts: OpzioniOmbra = {},
): number {
  if (!profilo.length) return 0;
  const perditaPerGrado = opts.perditaPerGrado ?? 0.012;
  const perditaMax = opts.perditaMax ?? 0.4;

  let sommaPesi = 0;
  let sommaPesata = 0;
  for (const p of profilo) {
    const w = pesoSolare(p.azimuth_deg);
    sommaPesi += w;
    sommaPesata += w * Math.max(0, p.elevation_deg);
  }
  if (sommaPesi <= 0) return 0;

  const elevazioneMediaSud = sommaPesata / sommaPesi;
  const perdita = elevazioneMediaSud * perditaPerGrado;
  return Math.round(Math.min(perditaMax, Math.max(0, perdita)) * 1000) / 1000;
}

/**
 * Parser del profilo d'orizzonte restituito da PVGIS (`outputs.horizon_profile`,
 * array di { A: azimut, H_hor: elevazione }). Tollerante a formati assenti.
 */
export function parseProfiloPvgis(raw: unknown): PuntoOrizzonte[] {
  const arr = (raw as { outputs?: { horizon_profile?: Array<Record<string, unknown>> } })
    ?.outputs?.horizon_profile;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => ({
      azimuth_deg: Number(r.A ?? r.azimuth ?? 0),
      elevation_deg: Number(r.H_hor ?? r.horizon_height ?? r.elevation ?? 0),
    }))
    .filter((p) => Number.isFinite(p.azimuth_deg) && Number.isFinite(p.elevation_deg));
}
