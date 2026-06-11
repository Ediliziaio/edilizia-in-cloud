/**
 * useOperativeTravelLegs — tempi/distanze tra appuntamenti del calendario.
 *
 * Strategia a due livelli:
 *  1. ISTANTANEO: stima haversine (linea d'aria × velocità media) calcolata
 *     in sincrono — la UI mostra subito un valore.
 *  2. REALE: route HERE via getRoute() (strade vere + traffico) caricata in
 *     background con React Query; quando arriva sostituisce la stima.
 *
 * La sede di partenza usa le coordinate operative dell'azienda
 * (companies.operational_lat/lng) quando disponibili; i parametri espliciti
 * baseLat/baseLng hanno la precedenza; ultimo fallback: Milano (legacy).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TravelLeg } from "@/types/marketingCalendar";
import { getRoute, formatDurationText, formatDistanceText } from "@/lib/routing";
import { useCompanyBase } from "@/hooks/useCompanyBase";

interface AppointmentWithLocation {
  id: string;
  appointment_time: string | null;
  title: string;
  lat?: number | null;
  lng?: number | null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface TravelLegsResult {
  travelLegs: TravelLeg[];
  totalKm: number;
  totalMinutes: number;
  /** true quando i valori provengono da routing stradale reale (HERE) */
  isRealRoute: boolean;
}

export function useOperativeTravelLegs(
  appointments: AppointmentWithLocation[],
  baseLat?: number,
  baseLng?: number,
  avgSpeedKmh = 60
): TravelLegsResult {
  const companyBase = useCompanyBase();
  const effBaseLat = baseLat ?? companyBase?.lat ?? 45.4654;
  const effBaseLng = baseLng ?? companyBase?.lng ?? 9.1859;

  const sorted = useMemo(() => {
    return [...appointments]
      .filter(a => a.lat && a.lng)
      .sort((a, b) => {
        const aTime = a.appointment_time ?? "00:00";
        const bTime = b.appointment_time ?? "00:00";
        return aTime.localeCompare(bTime);
      });
  }, [appointments]);

  // ── Livello 1: stima haversine istantanea ──────────────────────────────────
  const estimate = useMemo((): Omit<TravelLegsResult, "isRealRoute"> => {
    if (sorted.length === 0) return { travelLegs: [], totalKm: 0, totalMinutes: 0 };

    const legs: TravelLeg[] = [];
    let totalKm = 0;

    const first = sorted[0];
    const firstKm = haversineKm(effBaseLat, effBaseLng, first.lat!, first.lng!);
    const firstMin = (firstKm / avgSpeedKmh) * 60;
    legs.push({
      fromId: "base",
      toId: first.id,
      distance_m: Math.round(firstKm * 1000),
      duration_s: Math.round(firstMin * 60),
      distance_text: formatDistanceText(firstKm * 1000),
      duration_text: formatDurationText(firstMin * 60),
    });
    totalKm += firstKm;

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i];
      const to = sorted[i + 1];
      const km = haversineKm(from.lat!, from.lng!, to.lat!, to.lng!);
      const min = (km / avgSpeedKmh) * 60;
      legs.push({
        fromId: from.id,
        toId: to.id,
        distance_m: Math.round(km * 1000),
        duration_s: Math.round(min * 60),
        distance_text: formatDistanceText(km * 1000),
        duration_text: formatDurationText(min * 60),
      });
      totalKm += km;
    }

    const totalMinutes = legs.reduce((sum, l) => sum + l.duration_s / 60, 0);
    return { travelLegs: legs, totalKm, totalMinutes };
  }, [sorted, effBaseLat, effBaseLng, avgSpeedKmh]);

  // ── Livello 2: route stradale reale (HERE) in background ──────────────────
  // queryKey stabile: id ordinati + base. Vedi perf fix 2026-05-27 in
  // MarketingCalendar — id non ordinati causavano cache miss continui.
  const routeKey = useMemo(
    () => sorted.map(a => `${a.id}:${a.lat},${a.lng}`).join("|"),
    [sorted]
  );

  const { data: realLegs } = useQuery({
    queryKey: ["operative-travel-legs", effBaseLat, effBaseLng, routeKey],
    queryFn: async (): Promise<TravelLeg[] | null> => {
      const waypoints = [
        { lat: effBaseLat, lng: effBaseLng },
        ...sorted.map(a => ({ lat: a.lat!, lng: a.lng! })),
      ];
      const route = await getRoute(waypoints);
      if (!route?.legs || route.legs.length !== sorted.length) return null;

      return route.legs.map((leg, i) => ({
        fromId: i === 0 ? "base" : sorted[i - 1].id,
        toId: sorted[i].id,
        distance_m: Math.round(leg.distanceMeters),
        duration_s: Math.round(leg.durationSec),
        distance_text: formatDistanceText(leg.distanceMeters),
        duration_text: formatDurationText(leg.durationSec),
      }));
    },
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000, // il traffico cambia: refresh ogni 5 min
    retry: 1,
  });

  return useMemo(() => {
    if (realLegs && realLegs.length > 0) {
      const totalKm = realLegs.reduce((s, l) => s + l.distance_m / 1000, 0);
      const totalMinutes = realLegs.reduce((s, l) => s + l.duration_s / 60, 0);
      return { travelLegs: realLegs, totalKm, totalMinutes, isRealRoute: true };
    }
    return { ...estimate, isRealRoute: false };
  }, [realLegs, estimate]);
}
