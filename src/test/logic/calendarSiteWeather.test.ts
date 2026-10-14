import { describe, expect, it } from "vitest";
import {
  readSiteForecast,
  siteForecastAvailable,
} from "@/lib/calendar/siteWeather";
import {
  weatherCodeToEmoji,
  weatherCodeToLabel,
} from "@/hooks/useWeatherForecast";

describe("Previsioni per il giorno esatto del cantiere", () => {
  it("include oggi e il sedicesimo giorno, esclude passato e futuro lontano", () => {
    expect(siteForecastAvailable("2026-10-14", "2026-10-14")).toBe(true);
    expect(siteForecastAvailable("2026-10-29", "2026-10-14")).toBe(true);
    expect(siteForecastAvailable("2026-10-30", "2026-10-14")).toBe(false);
    expect(siteForecastAvailable("2026-10-13", "2026-10-14")).toBe(false);
    expect(siteForecastAvailable("2026-02-30", "2026-10-14")).toBe(false);
  });
  it("legge dati validi per data senza trasformare valori mancanti in zero", () => {
    const map = readSiteForecast({
      daily: {
        time: ["2026-10-14", "2026-10-15", "2026-10-16"],
        temperature_2m_max: [20.2, null, 0],
        temperature_2m_min: [10.6, 8, -3],
        precipitation_sum: [1.3, 0, 0],
        weather_code: [61, 0, 0],
      },
    });
    expect([...map.keys()]).toEqual(["2026-10-14", "2026-10-16"]);
    expect(map.get("2026-10-14")).toEqual({
      maxTemp: 20,
      minTemp: 11,
      precip: 1.3,
      code: 61,
    });
    expect(map.get("2026-10-16")).toEqual({
      maxTemp: 0,
      minTemp: -3,
      precip: 0,
      code: 0,
    });
    expect(map.get("2026-10-20")).toBeUndefined();
  });
  it.each([
    null,
    {},
    { daily: { time: ["2026-10-14"] } },
    { daily: { time: "2026-10-14" } },
  ])("risposta incompleta non produce temperature", (data) =>
    expect(readSiteForecast(data).size).toBe(0),
  );
  it.each([
    [2, 3, 0, 0],
    [20, 10, -1, 0],
    [20, 10, 0, NaN],
    [Infinity, 10, 0, 0],
    [20, 10, 0, 100],
  ])("scarta valori incoerenti o non numerici", (max, min, rain, code) => {
    expect(
      readSiteForecast({
        daily: {
          time: ["2026-10-14"],
          temperature_2m_max: [max],
          temperature_2m_min: [min],
          precipitation_sum: [rain],
          weather_code: [code],
        },
      }).size,
    ).toBe(0);
  });
  it("distingue rovesci, neve e temporali secondo il codice meteo", () => {
    expect(weatherCodeToLabel(80)).toBe("Rovesci di pioggia");
    expect(weatherCodeToEmoji(82)).toBe("🌦️");
    expect(weatherCodeToLabel(85)).toBe("Rovesci di neve");
    expect(weatherCodeToEmoji(86)).toBe("🌨️");
    expect(weatherCodeToLabel(95)).toBe("Temporale");
    expect(weatherCodeToLabel(99)).toBe("Temporale con grandine");
  });
});
