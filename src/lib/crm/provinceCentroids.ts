/**
 * provinceCentroids — coordinate (centroide/capoluogo) delle province italiane
 * per sigla, + fallback per regione. Serve alla Mappa CRM per posizionare un pin
 * anche quando non c'è la geocodifica stradale precisa: se un'azienda ha almeno
 * la provincia (o la regione), la mettiamo sul suo capoluogo con un piccolo
 * jitter deterministico così più aziende della stessa provincia non si
 * sovrappongono. Nessuna dipendenza/chiamata esterna: dati statici.
 *
 * La geocodifica indirizzo→coordinate precisa è la Fase 2 (edge Nominatim).
 */

/** Sigla provincia (2 lettere) → [lat, lng] del capoluogo. */
export const PROVINCE_CENTROIDS: Record<string, [number, number]> = {
  AG: [37.31, 13.58], AL: [44.91, 8.62], AN: [43.62, 13.51], AO: [45.74, 7.32],
  AR: [43.46, 11.88], AP: [42.85, 13.58], AT: [44.90, 8.21], AV: [40.91, 14.79],
  BA: [41.12, 16.87], BT: [41.20, 16.28], BL: [46.14, 12.22], BN: [41.13, 14.78],
  BG: [45.70, 9.67], BI: [45.57, 8.05], BO: [44.49, 11.34], BZ: [46.50, 11.35],
  BS: [45.54, 10.22], BR: [40.63, 17.94], CA: [39.22, 9.12], CL: [37.49, 14.06],
  CB: [41.56, 14.66], CE: [41.07, 14.33], CT: [37.51, 15.08], CZ: [38.91, 16.59],
  CH: [42.35, 14.17], CO: [45.81, 9.08], CS: [39.30, 16.25], CR: [45.13, 10.02],
  KR: [39.08, 17.12], CN: [44.39, 7.55], EN: [37.57, 14.28], FM: [43.16, 13.72],
  FE: [44.84, 11.62], FI: [43.77, 11.26], FG: [41.46, 15.55], FC: [44.22, 12.04],
  FR: [41.64, 13.35], GE: [44.41, 8.93], GO: [45.94, 13.62], GR: [42.76, 11.11],
  IM: [43.89, 8.03], IS: [41.60, 14.23], AQ: [42.35, 13.40], SP: [44.11, 9.83],
  LT: [41.47, 12.90], LE: [40.35, 18.17], LC: [45.86, 9.39], LI: [43.55, 10.31],
  LO: [45.31, 9.50], LU: [43.84, 10.50], MC: [43.30, 13.45], MN: [45.16, 10.79],
  MS: [44.04, 10.14], MT: [40.67, 16.60], ME: [38.19, 15.55], MI: [45.46, 9.19],
  MO: [44.65, 10.93], MB: [45.58, 9.27], NA: [40.85, 14.27], NO: [45.45, 8.62],
  NU: [40.32, 9.33], OR: [39.90, 8.59], PD: [45.41, 11.88], PA: [38.12, 13.36],
  PR: [44.80, 10.33], PV: [45.19, 9.16], PG: [43.11, 12.39], PU: [43.91, 12.90],
  PE: [42.46, 14.22], PC: [45.05, 9.69], PI: [43.72, 10.40], PT: [43.93, 10.92],
  PN: [45.96, 12.66], PZ: [40.64, 15.81], PO: [43.88, 11.10], RG: [36.93, 14.72],
  RA: [44.42, 12.20], RC: [38.11, 15.65], RE: [44.70, 10.63], RI: [42.40, 12.86],
  RN: [44.06, 12.57], RM: [41.90, 12.50], RO: [45.07, 11.79], SA: [40.68, 14.77],
  SS: [40.73, 8.56], SV: [44.31, 8.48], SI: [43.32, 11.33], SR: [37.07, 15.29],
  SO: [46.17, 9.87], SU: [39.28, 8.53], TA: [40.46, 17.24], TE: [42.66, 13.70],
  TR: [42.56, 12.65], TO: [45.07, 7.69], TP: [38.02, 12.51], TN: [46.07, 11.12],
  TV: [45.67, 12.24], TS: [45.65, 13.78], UD: [46.06, 13.24], VA: [45.82, 8.83],
  VE: [45.44, 12.32], VB: [45.92, 8.55], VC: [45.32, 8.42], VR: [45.44, 10.99],
  VV: [38.68, 16.10], VI: [45.55, 11.55], VT: [42.42, 12.10],
};

/** Nome regione (normalizzato) → [lat, lng] baricentro indicativo. */
export const REGION_CENTROIDS: Record<string, [number, number]> = {
  abruzzo: [42.35, 13.40], basilicata: [40.64, 15.81], calabria: [38.91, 16.59],
  campania: [40.85, 14.27], "emilia-romagna": [44.49, 11.34],
  "friuli-venezia giulia": [45.65, 13.20], lazio: [41.90, 12.50], liguria: [44.41, 8.93],
  lombardia: [45.46, 9.19], marche: [43.62, 13.51], molise: [41.56, 14.66],
  piemonte: [45.07, 7.69], puglia: [41.12, 16.87], sardegna: [39.22, 9.12],
  sicilia: [38.12, 13.36], toscana: [43.77, 11.26], "trentino-alto adige": [46.07, 11.12],
  umbria: [43.11, 12.39], "valle d'aosta": [45.74, 7.32], veneto: [45.44, 12.32],
};

/** Centro geografico dell'Italia — vista iniziale della mappa. */
export const ITALY_CENTER: [number, number] = [42.0, 12.5];

/** Normalizza il nome regione per il lookup (accenti/varianti comuni). */
function normalizeRegion(r: string): string {
  return r
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .replace(/emilia romagna/, "emilia-romagna")
    .replace(/friuli.*giulia/, "friuli-venezia giulia")
    .replace(/trentino.*adige/, "trentino-alto adige")
    .replace(/valle d.?aosta|vall.?e d.?aoste/, "valle d'aosta");
}

/** Jitter deterministico (~±0.05°, ~5 km) da una stringa id, così i punti sullo
 *  stesso centroide si distribuiscono invece di impilarsi esattamente. */
function hashJitter(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000 - 0.5; // [-0.5, 0.5)
  const b = (((h >>> 10) & 1023) % 1000) / 1000 - 0.5;
  return [a * 0.1, b * 0.1];
}

export interface ResolvedCoord {
  lat: number;
  lng: number;
  /** true = coordinate precise (geocodificate), false = centroide provincia/regione. */
  precise: boolean;
}

/**
 * Risolve la posizione di un'entità: usa lat/lng precise se presenti, altrimenti
 * il centroide della provincia (sigla), altrimenti quello della regione, con
 * jitter. Ritorna null se non è posizionabile.
 */
export function resolveCoord(
  id: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  province: string | null | undefined,
  region: string | null | undefined,
): ResolvedCoord | null {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, precise: true };
  }
  const [dLat, dLng] = hashJitter(id);
  const sig = (province ?? "").trim().toUpperCase();
  const prov = PROVINCE_CENTROIDS[sig];
  if (prov) return { lat: prov[0] + dLat, lng: prov[1] + dLng, precise: false };
  if (region) {
    const reg = REGION_CENTROIDS[normalizeRegion(region)];
    if (reg) return { lat: reg[0] + dLat, lng: reg[1] + dLng, precise: false };
  }
  return null;
}
