import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAvatarColor, getInitials } from "@/lib/contactUtils";
import type { TecnicoLivePosition } from "@/types/fleet";

const STALE_THRESHOLD_SEC = 120; // tecnico considerato "offline" dopo 2 min

function staleSec(recorded_at: string): number {
  return Math.floor((Date.now() - new Date(recorded_at).getTime()) / 1000);
}

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string;
}

interface GpsRow {
  user_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  battery_level: number | null;
  recorded_at: string;
}

/**
 * Hook admin: recupera le ultime posizioni di tutti i tecnici dell'azienda.
 * Si aggiorna ogni `refreshIntervalMs` ms (default 15s) + Realtime push.
 */
export function useLiveTecnici(
  companyId: string,
  refreshIntervalMs = 15_000
): { tecnici: TecnicoLivePosition[]; isLoading: boolean; refresh: () => void } {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  const queryKey = ["live-tecnici", companyId, tick];

  const { data: tecnici = [], isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<TecnicoLivePosition[]> => {
      // Prende l'ultima posizione per ogni tecnico (DISTINCT ON emulato con subquery)
      const { data: positions, error } = await (supabase
        .from("gps_positions" as never)
        .select("user_id, lat, lng, accuracy, speed, battery_level, recorded_at")
        .eq("company_id", companyId)
        .gte("recorded_at", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()) // ultime 8h
        .order("recorded_at", { ascending: false })
        .limit(200) as unknown as Promise<{ data: GpsRow[] | null; error: unknown }>);

      if (error || !positions) return [];

      // Dedup: tiene solo la posizione più recente per user
      const latestByUser = new Map<string, GpsRow>();
      for (const pos of positions) {
        if (!latestByUser.has(pos.user_id)) {
          latestByUser.set(pos.user_id, pos);
        }
      }

      if (latestByUser.size === 0) return [];

      // Carica profili
      const userIds = Array.from(latestByUser.keys());
      const { data: profiles } = await (supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds) as unknown as Promise<{ data: ProfileRow[] | null }>);

      const profileMap = new Map<string, ProfileRow>();
      (profiles ?? []).forEach((p) => profileMap.set(p.id, p));

      return Array.from(latestByUser.entries()).map(([userId, pos]) => {
        const p = profileMap.get(userId);
        const fn = p?.first_name ?? "";
        const ln = p?.last_name ?? userId.slice(0, 6);
        const fullName = `${fn} ${ln}`.trim();
        return {
          userId,
          fullName,
          avatarColor: getAvatarColor(fullName),
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          speed: pos.speed,
          battery_level: pos.battery_level,
          recorded_at: pos.recorded_at,
          staleSec: staleSec(pos.recorded_at),
        };
      });
    },
    enabled: !!companyId,
    staleTime: refreshIntervalMs,
    refetchInterval: refreshIntervalMs,
  });

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`gps-live-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gps_positions",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          // Invalida immediatamente
          queryClient.invalidateQueries({ queryKey: ["live-tecnici", companyId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId, queryClient]);

  // ── Polling fallback ──────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), refreshIntervalMs);
    return () => clearInterval(timer);
  }, [refreshIntervalMs]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-tecnici", companyId] });
  }, [companyId, queryClient]);

  return { tecnici, isLoading, refresh };
}

export { STALE_THRESHOLD_SEC };
