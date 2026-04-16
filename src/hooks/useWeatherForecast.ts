import { useQuery } from "@tanstack/react-query";
import { captureVelocityError } from "@/lib/velocity/sentry";

/**
 * Velocity Protocol — V2 (Affidabilità API esterne)
 * TRCFO pattern per Open-Meteo:
 *  • T imeout      → AbortSignal.timeout(5_000)
 *  • R etry        → React Query defaults: retry 1 + backoff
 *  • C ache        → staleTime 30' (+ React Query dedup)
 *  • F allback UI  → data === undefined → il componente mostra il placeholder
 *  • O sservabilità→ captureVelocityError + meta.silent:true (niente toast di rumore)
 *
 * Scelta: NON swallowiamo più l'errore. Lasciamo che React Query ritenti 1 volta;
 * dopo il fallimento definitivo, `data` è undefined e i consumer già gestiscono
 * questo caso via `weatherMap?.get(...)` / `if (!map) return`.
 */

const WEATHER_FETCH_TIMEOUT_MS = 5_000;
const WEATHER_STALE_MS = 30 * 60 * 1_000;

export interface WeatherDay {
  maxTemp: number;
  minTemp: number;
  precip: number; // mm
  code: number;   // WMO weather code
}

/** Meteo per una specifica location+data */
export interface LocationWeatherDay extends WeatherDay {
  city?: string;
  address?: string;
  orderRef?: string;
  orderDesc?: string;
  customerName?: string;
  lat: number;
  lng: number;
}

// WMO Weather code to emoji
export function weatherCodeToEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "⛈️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return "Sereno";
  if (code <= 3) return "Nuvoloso";
  if (code <= 48) return "Nebbia";
  if (code <= 67) return "Pioggia";
  if (code <= 77) return "Neve";
  if (code <= 82) return "Temporale";
  if (code <= 99) return "Forte temporale";
  return "Variabile";
}

/**
 * Fetch meteo per una singola location.
 * @param forecastDays — quanti giorni (default 7, max 16 per Open-Meteo)
 */
export function useWeatherForecast(lat = 45.4654, lng = 9.1859, forecastDays = 7) {
  return useQuery({
    queryKey: ["weather-forecast", lat, lng, forecastDays],
    // Meteo = API esterna non critica → silent:true evita i toast rumorosi
    // sulle stale refetch failures (vedi QueryCache onError in App.tsx).
    meta: { silent: true },
    queryFn: async ({ signal }): Promise<Map<string, WeatherDay>> => {
      const days = Math.min(Math.max(forecastDays, 1), 16);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=${days}`;

      // Merge del signal di React Query con il nostro timeout di 5s.
      // Se lo user naviga via (signal React Query) o la rete è lenta (timeout),
      // abortiamo in modo pulito senza tenere aperta la connection.
      const timeoutSignal = AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS);
      const merged = AbortSignal.any ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      let res: Response;
      try {
        res = await fetch(url, { signal: merged });
      } catch (err) {
        // Timeout o errore di rete: log e rilancia per far partire il retry React Query.
        if ((err as Error)?.name !== "AbortError" || timeoutSignal.aborted) {
          captureVelocityError("weather.forecast.network", err, { lat, lng, forecastDays });
        }
        throw err;
      }
      if (!res.ok) {
        const httpErr = new Error(`Weather API HTTP ${res.status}`);
        captureVelocityError("weather.forecast.http", httpErr, {
          lat, lng, forecastDays, status: res.status,
        });
        throw httpErr;
      }

      const data = await res.json();
      const map = new Map<string, WeatherDay>();
      const dates: string[] = data?.daily?.time ?? [];
      const maxTemps: number[] = data?.daily?.temperature_2m_max ?? [];
      const minTemps: number[] = data?.daily?.temperature_2m_min ?? [];
      const precips: number[] = data?.daily?.precipitation_sum ?? [];
      const codes: number[] = data?.daily?.weathercode ?? [];
      dates.forEach((date, i) => {
        map.set(date, {
          maxTemp: Math.round(maxTemps[i]),
          minTemp: Math.round(minTemps[i]),
          precip: precips[i] ?? 0,
          code: codes[i],
        });
      });
      return map;
    },
    staleTime: WEATHER_STALE_MS,
    retry: 1,
  });
}

/* ── Multi-location weather per il Calendario ──────────────────────────────── */

/** Coordinate arrotondate a ~1km (2 decimali) per de-duplicare locations vicine */
function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Chiave unica per una location (lat+lng arrotondati) */
function locationKey(lat: number, lng: number): string {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

export interface CalendarLocation {
  lat: number;
  lng: number;
  city?: string;
  /** Indirizzo completo del cantiere */
  address?: string;
  /** Riferimento ordine (es. "ORD-2026-005") */
  orderRef?: string;
  /** Descrizione ordine */
  orderDesc?: string;
  /** Nome cliente */
  customerName?: string;
  /** Dates (YYYY-MM-DD) in cui questa location ha appuntamenti */
  dates: string[];
}

/**
 * Meteo per data → array di WeatherDay per location.
 * Ogni giorno può avere meteo diversi per location diverse.
 * Key = "YYYY-MM-DD", Value = array con info meteo + city per ogni location attiva quel giorno.
 */
export type MultiLocationWeather = Map<string, LocationWeatherDay[]>;

/**
 * Fetcha il meteo a 14 giorni per tutte le location uniche degli appuntamenti.
 * Se non ci sono location specifiche, usa la sede aziendale come fallback.
 */
export function useCalendarWeather(
  locations: CalendarLocation[],
  fallbackLat = 45.4654,
  fallbackLng = 9.1859,
  fallbackCity = "Milano",
) {
  // De-duplica locations per coordinate arrotondate
  const uniqueLocations = new Map<string, CalendarLocation>();
  for (const loc of locations) {
    const key = locationKey(loc.lat, loc.lng);
    const existing = uniqueLocations.get(key);
    if (existing) {
      // Merge dates
      const dateSet = new Set([...existing.dates, ...loc.dates]);
      existing.dates = Array.from(dateSet);
      if (!existing.city && loc.city) existing.city = loc.city;
      if (!existing.address && loc.address) existing.address = loc.address;
      if (!existing.orderRef && loc.orderRef) existing.orderRef = loc.orderRef;
      if (!existing.orderDesc && loc.orderDesc) existing.orderDesc = loc.orderDesc;
      if (!existing.customerName && loc.customerName) existing.customerName = loc.customerName;
    } else {
      uniqueLocations.set(key, { ...loc, lat: roundCoord(loc.lat), lng: roundCoord(loc.lng), dates: [...loc.dates] });
    }
  }

  // Crea una query key stabile
  const locKeys = Array.from(uniqueLocations.keys()).sort();

  return useQuery({
    queryKey: ["calendar-weather-multi", locKeys, fallbackLat, fallbackLng],
    meta: { silent: true },
    queryFn: async ({ signal }): Promise<MultiLocationWeather> => {
      const result: MultiLocationWeather = new Map();

      // Se nessuna location specifica, fetcha solo il fallback (sede)
      const locs = uniqueLocations.size > 0
        ? Array.from(uniqueLocations.values())
        : [{ lat: fallbackLat, lng: fallbackLng, city: fallbackCity, dates: [] as string[] }];

      // Fetch in parallelo (max 10 locations per evitare rate limiting).
      // Strategy: ogni location ha il proprio timeout di 5s. Se UNA fallisce,
      // le ALTRE devono comunque arrivare (Promise.all non va bene → usiamo
      // allSettled + catch per-location, così una rete flaky non azzera tutto).
      const timeoutSignal = AbortSignal.timeout(WEATHER_FETCH_TIMEOUT_MS);
      const merged = AbortSignal.any ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

      const fetchPromises = locs.slice(0, 10).map(async (loc) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=14`;
        try {
          const res = await fetch(url, { signal: merged });
          if (!res.ok) {
            captureVelocityError("weather.calendar.http", new Error(`HTTP ${res.status}`), {
              lat: loc.lat, lng: loc.lng, city: loc.city, status: res.status,
            });
            return null;
          }
          const data = await res.json();
          const dates: string[] = data?.daily?.time ?? [];
          const maxTemps: number[] = data?.daily?.temperature_2m_max ?? [];
          const minTemps: number[] = data?.daily?.temperature_2m_min ?? [];
          const precips: number[] = data?.daily?.precipitation_sum ?? [];
          const codes: number[] = data?.daily?.weathercode ?? [];
          return { loc, dates, maxTemps, minTemps, precips, codes };
        } catch (err) {
          // Una singola location ko non deve piantare le altre.
          // Logghiamo, ritorniamo null, i merge a valle ignorano null.
          if ((err as Error)?.name !== "AbortError" || timeoutSignal.aborted) {
            captureVelocityError("weather.calendar.network", err, {
              lat: loc.lat, lng: loc.lng, city: loc.city,
            });
          }
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);

      for (const r of results) {
        if (!r) continue;
        const { loc, dates, maxTemps, minTemps, precips, codes } = r;
        dates.forEach((date, i) => {
          const entry: LocationWeatherDay = {
            maxTemp: Math.round(maxTemps[i]),
            minTemp: Math.round(minTemps[i]),
            precip: precips[i] ?? 0,
            code: codes[i],
            city: loc.city,
            address: loc.address,
            orderRef: loc.orderRef,
            orderDesc: loc.orderDesc,
            customerName: loc.customerName,
            lat: loc.lat,
            lng: loc.lng,
          };
          const existing = result.get(date) ?? [];
          existing.push(entry);
          result.set(date, existing);
        });
      }

      return result;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
    enabled: true,
  });
}
