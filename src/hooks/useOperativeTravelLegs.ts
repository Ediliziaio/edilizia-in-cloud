import { useMemo } from "react";
import type { TravelLeg } from "@/types/marketingCalendar";

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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface TravelLegsResult {
  travelLegs: TravelLeg[];
  totalKm: number;
  totalMinutes: number;
}

export function useOperativeTravelLegs(
  appointments: AppointmentWithLocation[],
  baseLat = 45.4654,
  baseLng = 9.1859,
  avgSpeedKmh = 60
): TravelLegsResult {
  return useMemo(() => {
    // Sort by appointment_time
    const sorted = [...appointments]
      .filter(a => a.lat && a.lng)
      .sort((a, b) => {
        const aTime = a.appointment_time ?? "00:00";
        const bTime = b.appointment_time ?? "00:00";
        return aTime.localeCompare(bTime);
      });

    if (sorted.length === 0) return { travelLegs: [], totalKm: 0, totalMinutes: 0 };

    const legs: TravelLeg[] = [];
    let totalKm = 0;

    // From base → first appointment
    const first = sorted[0];
    const firstKm = haversineKm(baseLat, baseLng, first.lat!, first.lng!);
    const firstMin = (firstKm / avgSpeedKmh) * 60;
    legs.push({
      fromId: "base",
      toId: first.id,
      distance_m: Math.round(firstKm * 1000),
      duration_s: Math.round(firstMin * 60),
      distance_text: formatDistance(firstKm),
      duration_text: formatDuration(firstMin),
    });
    totalKm += firstKm;

    // Between consecutive appointments
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
        distance_text: formatDistance(km),
        duration_text: formatDuration(min),
      });
      totalKm += km;
    }

    const totalMinutes = legs.reduce((sum, l) => sum + l.duration_s / 60, 0);
    return { travelLegs: legs, totalKm, totalMinutes };
  }, [appointments, baseLat, baseLng, avgSpeedKmh]);
}
