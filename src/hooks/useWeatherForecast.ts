import { useQuery } from "@tanstack/react-query";

export interface WeatherDay {
  maxTemp: number;
  minTemp: number;
  precip: number; // mm
  code: number;   // WMO weather code
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

export function useWeatherForecast(lat = 45.4654, lng = 9.1859) {
  return useQuery({
    queryKey: ["weather-forecast", lat, lng],
    queryFn: async (): Promise<Map<string, WeatherDay>> => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=7`;
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
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
