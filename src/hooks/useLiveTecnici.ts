import { useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAvatarColor } from "@/lib/contactUtils";
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
): { tecnici: TecnicoLivePosition[]; isLoading: boolean; isError: boolean; refresh: () => void } {
  const queryClient = useQueryClient();

  const queryKey = ["live-tecnici", companyId];

  const { data: tecnici = [], isLoading, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<TecnicoLivePosition[]> => {
      // Prende l'ultima posizione per ogni tecnico (DISTINCT ON emulato con subquery)
      const { data, error } = await supabase.rpc("hr_gps_ultime_posizioni" as never, { p_company: companyId } as never);
      const positions = data as GpsRow[] | null;

      if (error) throw error;
      if (!positions) return [];

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
      const { data: profiles, error: profileError } = await (supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds) as unknown as Promise<{ data: ProfileRow[] | null; error: unknown }>);
      if (profileError) throw profileError;

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

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["live-tecnici", companyId] });
  }, [companyId, queryClient]);

  return { tecnici, isLoading, isError, refresh };
}

export { STALE_THRESHOLD_SEC };
