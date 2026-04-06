import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GpsPosition } from "@/types/fleet";

interface PercorsoGiornalieroResult {
  positions: Pick<GpsPosition, "lat" | "lng" | "accuracy" | "speed" | "recorded_at">[];
  isLoading: boolean;
  totalKm: number;
}

/**
 * Recupera il percorso (lista di posizioni ordinate) di un tecnico per una data.
 * Calcola anche la distanza totale percorsa in km.
 */
export function usePercorsoGiornaliero(
  companyId: string,
  userId: string,
  date: string // formato YYYY-MM-DD
): PercorsoGiornalieroResult {
  const { data, isLoading } = useQuery({
    queryKey: ["percorso-giornaliero", companyId, userId, date],
    queryFn: async () => {
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const { data: rows, error } = await (supabase
        .from("gps_positions" as never)
        .select("lat, lng, accuracy, speed, recorded_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .gte("recorded_at", startOfDay)
        .lte("recorded_at", endOfDay)
        .order("recorded_at", { ascending: true })
        .limit(2000) as unknown as Promise<{
          data: Pick<GpsPosition, "lat" | "lng" | "accuracy" | "speed" | "recorded_at">[] | null;
          error: unknown;
        }>);

      if (error || !rows) return { positions: [], totalKm: 0 };

      const totalKm = computeTotalKm(rows);
      return { positions: rows, totalKm };
    },
    enabled: !!companyId && !!userId && !!date,
    staleTime: 60_000,
  });

  return {
    positions: data?.positions ?? [],
    isLoading,
    totalKm: data?.totalKm ?? 0,
  };
}

// ── Haversine helper ──────────────────────────────────────────────────────────
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

function computeTotalKm(
  positions: Pick<GpsPosition, "lat" | "lng">[]
): number {
  let km = 0;
  for (let i = 1; i < positions.length; i++) {
    km += haversineKm(
      positions[i - 1].lat,
      positions[i - 1].lng,
      positions[i].lat,
      positions[i].lng
    );
  }
  return Math.round(km * 10) / 10;
}
