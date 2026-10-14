import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  calendarLocation,
  validCalendarCoordinates,
} from "@/hooks/useCalendarTravel";
import { forwardGeocode } from "@/lib/geocoding";
import { withClientTimeout } from "@/lib/query-timeout";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { campoWorkDay } from "@/lib/campo/workDay";
import {
  readSiteForecast,
  siteForecastAvailable,
  SITE_WEATHER_DAYS,
} from "@/lib/calendar/siteWeather";
import type { CalendarEvent } from "@/lib/calendar/events";

// Le ricerche da indirizzo sono seriali; le coordinate già registrate non aspettano la coda.
let lookupQueue: Promise<unknown> = Promise.resolve();
function locate(address: string, signal: AbortSignal) {
  const request = lookupQueue
    .catch((): void => {})
    .then(() => {
      if (signal.aborted)
        throw new DOMException("Ricerca annullata", "AbortError");
      return withClientTimeout(
        forwardGeocode(address),
        "Posizione del meteo cantiere",
        10_000,
      );
    });
  lookupQueue = request.then(
    (): void => {},
    (): void => {},
  );
  return request;
}

export function useCalendarSiteWeather(event: CalendarEvent, day: string) {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const company = effectiveCompany?.id;
  const today = campoWorkDay(new Date());
  const location = calendarLocation(event);
  const supported = !!(
    event.order ||
    event.appointment ||
    event.intervento ||
    event.manutenzione
  );
  const allowed =
    supported &&
    !!company &&
    !!user?.id &&
    !permissions.isLoading &&
    permissions.canViewCalendar;
  const inRange = siteForecastAvailable(day, today);
  const ready = allowed && inRange;
  const position = useQuery({
    queryKey: [
      "calendar-site-weather-position",
      company,
      user?.id,
      location.address,
    ],
    enabled: ready && !!location.address && !location.coordinates,
    meta: { silent: true },
    staleTime: 24 * 60 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      if (!ready) throw new Error("Meteo non accessibile");
      const coordinates = await locate(location.address, signal);
      return coordinates &&
        validCalendarCoordinates(coordinates.lat, coordinates.lng)
        ? coordinates
        : null;
    },
  });
  const point = location.coordinates || (ready ? position.data : null);
  // Precisione di circa 1 km: cantieri vicini condividono la stessa richiesta meteo.
  const lat = point ? Math.round(point.lat * 100) / 100 : undefined;
  const lng = point ? Math.round(point.lng * 100) / 100 : undefined;
  const forecast = useQuery({
    queryKey: [
      "calendar-site-weather-forecast",
      company,
      user?.id,
      lat,
      lng,
      today,
    ],
    enabled: ready && !!point,
    meta: { silent: true },
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      if (!ready || !point) throw new Error("Meteo non accessibile");
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lng),
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
        timezone: "Europe/Rome",
        forecast_days: String(SITE_WEATHER_DAYS),
      });
      const response = await fetchWithTimeout(
        "https://api.open-meteo.com/v1/forecast?" + params.toString(),
        { signal, timeoutMs: 12_000, context: "weather.calendar.site" },
      );
      if (!response.ok)
        throw new Error("Meteo temporaneamente non disponibile");
      return readSiteForecast(await response.json());
    },
  });
  const data = ready ? forecast.data?.get(day) : undefined;
  const loading =
    ready && !data && (position.isFetching || forecast.isFetching);
  const status = !allowed
    ? "unavailable"
    : !inRange
      ? "outside-range"
      : loading
        ? "loading"
        : data
          ? "ready"
          : !location.address && !location.coordinates
            ? "missing-address"
            : position.isError || forecast.isError
              ? "error"
              : !point && position.isSuccess
                ? "missing-position"
                : "unavailable";
  return {
    supported,
    data,
    status,
    address: location.address,
    day,
    retry: () => {
      if (!ready) return;
      if (!point) void position.refetch();
      else void forecast.refetch();
    },
  };
}
