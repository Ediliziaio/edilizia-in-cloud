import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-calendar-prefs", userId] });
    },
  });
}

export function useDisconnectGoogleCalendar(userId: string | undefined, companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId || !companyId) throw new Error("userId e companyId richiesti");
      const { error } = await supabase
        .from("google_calendar_connections")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-calendar-connection", companyId, userId] });
    },
  });
}
