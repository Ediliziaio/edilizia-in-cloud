import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import type { HrTimbratura, TimbraturaTipo } from "@/types/hr";
import type { GPSResult } from "@/hooks/useGPS";
import { toast } from "sonner";

/** Get the current user's hr_profilo */
export function useMyHrProfilo() {
  const { user } = useAuth();
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-my-profilo", user?.id, companyId],
    queryFn: async () => {
      if (!user?.id || !companyId) return null;
      const { data, error } = await supabase
        .from("hr_profili")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("attivo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Get today's timbrature for current user */
export function useMyTodayTimbrature(profiloId: string | undefined) {
  const today = new Date().toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["hr-my-timbrature-today", profiloId, today],
    queryFn: async () => {
      if (!profiloId) return [];
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*")
        .eq("profilo_id", profiloId)
        .eq("data_evento", today)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as HrTimbratura[];
    },
    enabled: !!profiloId,
    staleTime: 30 * 1000,
    refetchInterval: 60000,
  });
}

/** Clock in/out mutation */
export function useTimbra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyId,
      profiloId,
      tipo,
      gps,
    }: {
      companyId: string;
      profiloId: string;
      tipo: TimbraturaTipo;
      gps: GPSResult | null;
    }) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("hr_timbrature")
        .insert({
          company_id: companyId,
          profilo_id: profiloId,
          tipo,
          timestamp: now,
          data_evento: now.slice(0, 10),
          ora_evento: now.slice(11, 19),
          lat: gps?.lat || null,
          lng: gps?.lng || null,
          sede_id: gps?.sede_id || null,
          fonte: "web",
          ip_address: null,
          note: gps?.status === "denied" ? "GPS non disponibile" : null,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-my-timbrature-today"] });
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature"] });
      queryClient.invalidateQueries({ queryKey: ["hr-giornate"] });
    },
    onError: (err: any) => {
      toast.error("Errore timbratura: " + err.message);
    },
  });
}

/** Admin: fetch all timbrature for a date range */
export function useTimbratureAdmin(dateFrom: string, dateTo: string) {
  const companyId = useEffectiveCompanyId();

  return useQuery({
    queryKey: ["hr-timbrature", companyId, dateFrom, dateTo],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("*, hr_profili!hr_timbrature_profilo_id_fkey(nome, cognome, colore_avatar, mansione)")
        .eq("company_id", companyId)
        .gte("data_evento", dateFrom)
        .lte("data_evento", dateTo)
        .order("timestamp", { ascending: false })
        .limit(200);

      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        profilo_nome: t.hr_profili?.nome,
        profilo_cognome: t.hr_profili?.cognome,
        profilo_colore: t.hr_profili?.colore_avatar,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

/** Admin: fetch today's last timbratura per profilo for live status */
export function useLiveStatus() {
  const companyId = useEffectiveCompanyId();
  const today = new Date().toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["hr-live-status", companyId, today],
    queryFn: async () => {
      if (!companyId) return [];

      // Get all active profili
      const { data: profili } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome, colore_avatar, mansione")
        .eq("company_id", companyId)
        .eq("attivo", true)
        .order("cognome");

      if (!profili) return [];

      // Get today's timbrature
      const { data: timbrature } = await supabase
        .from("hr_timbrature")
        .select("profilo_id, tipo, timestamp, ora_evento")
        .eq("company_id", companyId)
        .eq("data_evento", today)
        .order("timestamp", { ascending: false });

      // Map: for each profilo, find last timbratura
      return profili.map((p: any) => {
        const myTimbrature = (timbrature || []).filter((t: any) => t.profilo_id === p.id);
        const last = myTimbrature[0];
        return {
          ...p,
          last_tipo: last?.tipo || null,
          last_ora: last?.ora_evento?.slice(0, 5) || null,
          is_present: last?.tipo === "entrata" || last?.tipo === "pausa_fine" || last?.tipo === "fine_pausa",
        };
      });
    },
    enabled: !!companyId,
    refetchInterval: 60000,
  });
}
