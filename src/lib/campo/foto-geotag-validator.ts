/**
 * Validatore GPS per foto di cantiere.
 * Rifiuta foto senza geotag — non è opzionale per conformità normativa.
 */

export interface GeoTag {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export type GeoTagError =
  | "permission_denied"
  | "unavailable"
  | "timeout"
  | "low_accuracy";

export interface GeoTagResult {
  ok: boolean;
  geo?: GeoTag;
  error?: GeoTagError;
  message?: string;
}

const TIMEOUT_MS = 10000;
const MAX_ACCURACY_METERS = 100;

/**
 * Richiede la posizione GPS corrente ad alta precisione.
 * Restituisce un risultato tipizzato con errore o geo.
 */
export async function requireGeotag(): Promise<GeoTagResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return {
      ok: false,
      error: "unavailable",
      message: "GPS non disponibile su questo dispositivo",
    };
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: 0,
      });
    });

    const geo: GeoTag = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };

    if (geo.accuracy > MAX_ACCURACY_METERS) {
      return {
        ok: false,
        error: "low_accuracy",
        geo,
        message: `Posizione imprecisa (${Math.round(geo.accuracy)}m). Avvicinati a una zona con segnale GPS migliore.`,
      };
    }

    return { ok: true, geo };
  } catch (err) {
    const gpsError = err as GeolocationPositionError;
    if (gpsError.code === 1) {
      return {
        ok: false,
        error: "permission_denied",
        message: "Attiva la localizzazione per scattare foto in cantiere",
      };
    }
    if (gpsError.code === 3) {
      return {
        ok: false,
        error: "timeout",
        message: "GPS non ha risposto in tempo. Prova in un'area più aperta.",
      };
    }
    return {
      ok: false,
      error: "unavailable",
      message: "Impossibile ottenere la posizione GPS",
    };
  }
}
