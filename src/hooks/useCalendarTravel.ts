import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { forwardGeocode } from "@/lib/geocoding";
import { getRoute } from "@/lib/routing";
import type { CalendarEvent } from "@/lib/calendar/events";

export const validCalendarCoordinates = (lat: unknown, lng: unknown) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
export function calendarLocation(
  event: CalendarEvent,
  fallbackAddress?: string,
) {
  const a = event.appointment,
    o = event.order,
    t = event.intervento,
    m = event.manutenzione;
  const address =
    o?.indirizzo_lavori?.trim() ||
    o?.work_address?.trim() ||
    a?.formatted_address?.trim() ||
    [
      a?.address_line,
      a?.address_postal_code,
      a?.address_city,
      a?.address_province,
    ]
      .filter(Boolean)
      .join(", ") ||
    t?.indirizzo_intervento?.trim() ||
    m?.indirizzo?.trim() ||
    fallbackAddress?.trim() ||
    "";
  const lat = o?.work_lat ?? a?.lat ?? t?.lat_intervento ?? m?.lat,
    lng = o?.work_lng ?? a?.lng ?? t?.lng_intervento ?? m?.lng;
  return {
    address,
    coordinates: validCalendarCoordinates(lat, lng)
      ? { lat: lat!, lng: lng! }
      : null,
  };
}
export function useCalendarTravel(
  event: CalendarEvent,
  fallbackAddress?: string,
) {
  const { user, effectiveCompany } = useAuth();
  const p = usePermissions();
  const company = effectiveCompany?.id;
  const location = calendarLocation(event, fallbackAddress);
  const [requestedAddress, setRequestedAddress] = useState<string | null>(null);
  const requestKey = JSON.stringify([company, user?.id, location.address]);
  const allowed = !!company && !!user?.id && !p.isLoading && p.canViewCalendar;
  const savedKm = event.order?.distanza_sede_km,
    savedMin = event.order?.distanza_sede_minuti;
  const saved =
    typeof savedKm === "number" && savedKm >= 0 && Number.isFinite(savedKm)
      ? {
          km: savedKm,
          minutes:
            typeof savedMin === "number" &&
            savedMin >= 0 &&
            Number.isFinite(savedMin)
              ? savedMin
              : null,
          source: "commessa" as const,
          updated: event.order?.distanza_sede_il,
        }
      : null;
  const base = useQuery({
    queryKey: ["calendar-travel-base", company, user?.id],
    enabled: allowed && !!location.address,
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }) => {
      if (!allowed) throw new Error("Sede non accessibile");
      const { data, error } = await supabase
        .from("companies")
        .select("operational_lat,operational_lng,operational_city")
        .eq("id", company!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data &&
        validCalendarCoordinates(data.operational_lat, data.operational_lng)
        ? {
            lat: data.operational_lat!,
            lng: data.operational_lng!,
            label: data.operational_city || "Sede operativa",
          }
        : null;
    },
  });
  const query = useQuery({
    queryKey: [
      "calendar-event-route-v1",
      company,
      user?.id,
      location.address,
      location.coordinates?.lat,
      location.coordinates?.lng,
      base.data?.lat,
      base.data?.lng,
    ],
    enabled:
      allowed &&
      !!location.address &&
      !!base.data &&
      saved?.minutes == null &&
      (!!location.coordinates || requestedAddress === requestKey),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      if (!allowed || !base.data) throw new Error("Sede non disponibile");
      const destination =
        location.coordinates ?? (await forwardGeocode(location.address));
      if (
        !destination ||
        !validCalendarCoordinates(destination.lat, destination.lng)
      )
        throw new Error("Indirizzo non localizzato");
      const route = await getRoute([base.data, destination]);
      if (
        !route ||
        !Number.isFinite(route.distanceMeters) ||
        !Number.isFinite(route.durationSec)
      )
        throw new Error("Percorso non disponibile");
      return {
        km: Math.round(route.distanceMeters / 100) / 10,
        minutes: Math.round(route.durationSec / 60),
        source: "percorso" as const,
      };
    },
  });
  return {
    location,
    data: allowed
      ? saved?.minutes != null
        ? saved
        : (query.data ?? saved)
      : null,
    base: allowed ? base.data : null,
    loading: allowed && (base.isFetching || query.isFetching),
    error: allowed && (base.isError || query.isError),
    missingBase: allowed && base.isSuccess && !base.data && !saved,
    canCalculate: allowed && !!location.address && !!base.data,
    calculate: () => {
      setRequestedAddress(requestKey);
      if (query.isError) void query.refetch();
    },
  };
}
