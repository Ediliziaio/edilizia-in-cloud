import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherDay } from "@/hooks/useWeatherForecast";
const state = vi.hoisted(() => ({
  company: "company" as string | null,
  user: "me" as string | null,
  allowed: true,
  loading: false,
  position: null as { lat: number; lng: number } | null,
  forecast: new Map<string, WeatherDay>(),
  positionError: false,
  forecastError: false,
  options: [] as {
    queryKey: unknown[];
    enabled: boolean;
    queryFn: (c: { signal: AbortSignal }) => Promise<unknown>;
  }[],
  refetchPosition: vi.fn(),
  refetchForecast: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    effectiveCompany: state.company ? { id: state.company } : null,
    user: state.user ? { id: state.user } : null,
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canViewCalendar: state.allowed,
    isLoading: state.loading,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/geocoding", () => ({ forwardGeocode: vi.fn() }));
vi.mock("@/lib/utils/fetchWithTimeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (q: (typeof state.options)[number]) => {
    state.options.push(q);
    const position = q.queryKey[0] === "calendar-site-weather-position";
    return {
      data: position ? state.position : state.forecast,
      isError: position ? state.positionError : state.forecastError,
      isSuccess: true,
      isFetching: false,
      refetch: position ? state.refetchPosition : state.refetchForecast,
    };
  },
}));
import { useCalendarSiteWeather } from "@/hooks/useCalendarSiteWeather";
import { forwardGeocode } from "@/lib/geocoding";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import type { CalendarEvent } from "@/lib/calendar/events";
const event = (
  address = "Via Roma 10",
  coordinates?: { lat: number; lng: number },
): CalendarEvent => ({
  type: "appointment",
  color: "",
  appointment: { formatted_address: address, ...coordinates } as never,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  state.company = "company";
  state.user = "me";
  state.allowed = true;
  state.loading = false;
  state.position = null;
  state.forecast = new Map();
  state.options = [];
  state.positionError = false;
  state.forecastError = false;
  vi.mocked(forwardGeocode).mockReset();
  vi.mocked(fetchWithTimeout).mockReset();
  state.refetchPosition.mockClear();
  state.refetchForecast.mockClear();
});
afterEach(() => vi.useRealTimers());
describe("Meteo per indirizzo, azienda e utente del calendario", () => {
  it("le coordinate registrate, anche zero, evitano la geocodifica", () => {
    useCalendarSiteWeather(event("Via Roma", { lat: 0, lng: 9 }), "2026-10-14");
    expect(state.options[0].enabled).toBe(false);
    expect(state.options[1].enabled).toBe(true);
    expect(state.options[1].queryKey).toEqual([
      "calendar-site-weather-forecast",
      "company",
      "me",
      0,
      9,
      "2026-10-14",
    ]);
  });
  it("geocodifica ogni indirizzo distinto senza usare Milano come ripiego", async () => {
    const q = useCalendarSiteWeather(
      event("Via Tigli 50, Monza"),
      "2026-10-14",
    );
    expect(state.options[0].queryKey).toEqual([
      "calendar-site-weather-position",
      "company",
      "me",
      "Via Tigli 50, Monza",
    ]);
    expect(state.options[1].enabled).toBe(false);
    vi.mocked(forwardGeocode).mockResolvedValue(null);
    expect(
      await state.options[0].queryFn({ signal: new AbortController().signal }),
    ).toBeNull();
    expect(forwardGeocode).toHaveBeenCalledWith("Via Tigli 50, Monza");
    q.retry();
    expect(state.refetchPosition).toHaveBeenCalledOnce();
    useCalendarSiteWeather(event("Via Roma 22"), "2026-10-14");
    expect(state.options[2].queryKey[3]).toBe("Via Roma 22");
  });
  it.each(["2026-10-13", "2026-10-30"])(
    "fuori previsione non consulta provider né mostra meteo di oggi (%s)",
    (day) => {
      state.forecast.set(day, { minTemp: 8, maxTemp: 20, precip: 0, code: 0 });
      const q = useCalendarSiteWeather(
        event("Via Roma", { lat: 45, lng: 9 }),
        day,
      );
      expect(q.status).toBe("outside-range");
      expect(q.data).toBeUndefined();
      expect(state.options.every((q) => !q.enabled)).toBe(true);
      q.retry();
      expect(state.refetchForecast).not.toHaveBeenCalled();
    },
  );
  it.each(["logout", "permission", "loading", "company"])(
    "non mostra cache e blocca richieste senza accesso: %s",
    async (reason) => {
      if (reason === "logout") state.user = null;
      if (reason === "company") state.company = null;
      if (reason === "permission") state.allowed = false;
      if (reason === "loading") state.loading = true;
      state.forecast.set("2026-10-14", {
        minTemp: 8,
        maxTemp: 20,
        precip: 0,
        code: 0,
      });
      const q = useCalendarSiteWeather(
        event("Via Roma", { lat: 45, lng: 9 }),
        "2026-10-14",
      );
      expect(q.data).toBeUndefined();
      expect(state.options.every((q) => !q.enabled)).toBe(true);
      await expect(
        state.options[1].queryFn({ signal: new AbortController().signal }),
      ).rejects.toThrow("Meteo non accessibile");
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    },
  );
  it("il giorno mancante non eredita una previsione di un altro giorno", () => {
    state.forecast.set("2026-10-14", {
      minTemp: 8,
      maxTemp: 20,
      precip: 0,
      code: 0,
    });
    expect(
      useCalendarSiteWeather(
        event("Via Roma", { lat: 45, lng: 9 }),
        "2026-10-15",
      ).data,
    ).toBeUndefined();
  });
  it("richiede 16 giorni con fuso italiano e coord del cantiere, non dati aziendali", async () => {
    useCalendarSiteWeather(
      event("Via Roma", { lat: 45.456, lng: 9.123 }),
      "2026-10-14",
    );
    vi.mocked(fetchWithTimeout).mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: ["2026-10-14"],
          temperature_2m_max: [18],
          temperature_2m_min: [9],
          precipitation_sum: [3],
          weather_code: [80],
        },
      }),
    } as Response);
    const result = (await state.options[1].queryFn({
      signal: new AbortController().signal,
    })) as Map<string, WeatherDay>;
    const url = new URL(String(vi.mocked(fetchWithTimeout).mock.calls[0][0]));
    expect(url.searchParams.get("latitude")).toBe("45.46");
    expect(url.searchParams.get("longitude")).toBe("9.12");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.get("timezone")).toBe("Europe/Rome");
    expect(url.searchParams.get("daily")).toContain("weather_code");
    expect(url.searchParams.has("address")).toBe(false);
    expect(result.get("2026-10-14")).toMatchObject({
      maxTemp: 18,
      precip: 3,
      code: 80,
    });
  });
  it("ferie e impegni senza luogo non generano badge meteo", () => {
    const q = useCalendarSiteWeather(
      { type: "leave", color: "", leave: {} as never },
      "2026-10-14",
    );
    expect(q.supported).toBe(false);
    expect(state.options.every((q) => !q.enabled)).toBe(true);
    expect(useCalendarSiteWeather(event(""), "2026-10-14").status).toBe(
      "missing-address",
    );
  });
  it("una geocodifica annullata non parte nella coda", async () => {
    useCalendarSiteWeather(event(), "2026-10-14");
    const controller = new AbortController();
    controller.abort();
    await expect(
      state.options[0].queryFn({ signal: controller.signal }),
    ).rejects.toThrow("Ricerca annullata");
    expect(forwardGeocode).not.toHaveBeenCalled();
  });
});
