import { useQuery } from "@tanstack/react-query";

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
    queryFn: async (): Promise<Map<string, WeatherDay>> => {
      try {
        const days = Math.min(Math.max(forecastDays, 1), 16);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=${days}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Weather API error");
        const data = await res.json();
        const map = new Map<string, WeatherDay>();
        const dates: string[] = data.daily.time;
        const maxTemps: number[] = data.daily.temperature_2m_max;
        const minTemps: number[] = data.daily.temperature_2m_min;
        const precips: number[] = data.daily.precipitation_sum;
        const codes: number[] = data.daily.weathercode;
        dates.forEach((date, i) => {
          map.set(date, {
            maxTemp: Math.round(maxTemps[i]),
            minTemp: Math.round(minTemps[i]),
            precip: precips[i] ?? 0,
            code: codes[i],
          });
        });
        return map;
      } catch {
        // Weather is non-critical — return empty map on network failure
        return new Map<string, WeatherDay>();
      }
    },
    staleTime: 30 * 60 * 1000,
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
    queryFn: async (): Promise<MultiLocationWeather> => {
      const result: MultiLocationWeather = new Map();

      // Se nessuna location specifica, fetcha solo il fallback (sede)
      const locs = uniqueLocations.size > 0
        ? Array.from(uniqueLocations.values())
        : [{ lat: fallbackLat, lng: fallbackLng, city: fallbackCity, dates: [] as string[] }];

      // Fetch in parallelo (max 10 locations per evitare rate limiting)
      const fetchPromises = locs.slice(0, 10).map(async (loc) => {
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=14`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.json();
          const dates: string[] = data.daily.time;
          const maxTemps: number[] = data.daily.temperature_2m_max;
          const minTemps: number[] = data.daily.temperature_2m_min;
          const precips: number[] = data.daily.precipitation_sum;
          const codes: number[] = data.daily.weathercode;
          return { loc, dates, maxTemps, minTemps, precips, codes };
        } catch {
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
