import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { modoDaDirezione } from "@/lib/calendar/direzioneSync";

export interface UserCalendarPrefs {
  id?: string;
  sync_enabled: boolean;
  sync_direction: "to_google" | "from_google" | "both";
  default_calendar_id?: string | null;
  default_calendar_name?: string | null;
  buffer_before_min: number;
  buffer_after_min: number;
  block_busy_slots: boolean;
}

const DEFAULT_PREFS: UserCalendarPrefs = {
  sync_enabled: true,
  sync_direction: "both",
  default_calendar_id: null,
  default_calendar_name: null,
  buffer_before_min: 0,
  buffer_after_min: 0,
  block_busy_slots: true,
};

export function useUserCalendarPrefs(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-calendar-prefs", userId],
    queryFn: async (): Promise<UserCalendarPrefs> => {
      if (!userId) return DEFAULT_PREFS;
      const { data } = await supabase
        .from("user_calendar_preferences")
        .select("id, sync_enabled, sync_direction, default_calendar_id, default_calendar_name, buffer_before_min, buffer_after_min, block_busy_slots")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as unknown as UserCalendarPrefs) || DEFAULT_PREFS;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useGoogleCalendarConnection(userId: string | undefined, companyId: string | undefined) {
  return useQuery({
    queryKey: ["google-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_connections")
        .select("id, status, google_account_email, updated_at")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useSaveUserCalendarPrefs(userId: string | undefined, companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: UserCalendarPrefs) => {
      if (!userId || !companyId) throw new Error("userId e companyId richiesti");
      const { id: _id, ...rest } = prefs;
      const { error } = await supabase
        .from("user_calendar_preferences")
        .upsert(
          { user_id: userId, company_id: companyId, ...rest, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) throw error;
      // La scheda del collegamento (Mio profilo → Preferenze sync) mostra la
      // stessa scelta letta da google_calendar_settings: se non la si aggiorna
      // qui, le due pagine si contraddicono davanti allo stesso utente.
      await supabase
        .from("google_calendar_settings")
        .update({ sync_mode: modoDaDirezione(prefs.sync_direction) } as never)
        .eq("company_id", companyId)
        .eq("user_id", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-calendar-prefs", userId] });
      queryClient.invalidateQueries({ queryKey: ["google-calendar-settings"] });
    },
    onError: (error: any) => {
      toast.error("Errore", { description: error.message || "Operazione non riuscita. Riprova." });
    },
  });
}

export function useDisconnectGoogleCalendar(userId: string | undefined, companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId || !companyId) throw new Error("userId e companyId richiesti");
      // Dalla edge function: revoca il token, toglie canale e slot, e vale
      // anche per il calendario di un collega (con il permesso sui calendari).
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "disconnect", companyId, userId },
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection", companyId, userId] });
    },
    onError: (error: any) => {
      toast.error("Errore", { description: error.message || "Operazione non riuscita. Riprova." });
    },
  });
}
