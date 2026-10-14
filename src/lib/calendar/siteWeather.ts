import { addDays, format, isValid, parseISO } from "date-fns";
import type { WeatherDay } from "@/hooks/useWeatherForecast";

export const SITE_WEATHER_DAYS = 16;
export function siteForecastAvailable(day: string, today: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    isValid(parseISO(day)) &&
    day >= today &&
    day <= format(addDays(parseISO(today), SITE_WEATHER_DAYS - 1), "yyyy-MM-dd")
  );
}
export function readSiteForecast(data: unknown): Map<string, WeatherDay> {
  const result = new Map<string, WeatherDay>();
  const daily = (data as { daily?: Record<string, unknown> } | null)?.daily;
  if (!daily || !Array.isArray(daily.time)) return result;
  const temperatures = daily.temperature_2m_max,
    minima = daily.temperature_2m_min,
    rain = daily.precipitation_sum,
    codes = daily.weather_code;
  if (![temperatures, minima, rain, codes].every(Array.isArray)) return result;
  daily.time.forEach((day, i) => {
    const max = (temperatures as unknown[])[i],
      min = (minima as unknown[])[i],
      precip = (rain as unknown[])[i],
      code = (codes as unknown[])[i];
    if (
      typeof day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !isValid(parseISO(day)) ||
      ![max, min, precip, code].every(
        (v) => typeof v === "number" && Number.isFinite(v),
      ) ||
      (max as number) < (min as number) ||
      (precip as number) < 0 ||
      (code as number) < 0 ||
      (code as number) > 99
    )
      return;
    result.set(day, {
      maxTemp: Math.round(max as number),
      minTemp: Math.round(min as number),
      precip: precip as number,
      code: code as number,
    });
  });
  return result;
}
