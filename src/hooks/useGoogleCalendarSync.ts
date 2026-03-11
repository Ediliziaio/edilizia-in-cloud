import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export function useGoogleCalendarSync() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;

  const { data: connection } = useQuery({
    queryKey: queryKeys.googleCalendar.connection(companyId, userId),
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_connections")
        .select("id, status, last_sync_at, google_account_email")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("status", "connected")
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
    staleTime: 60_000,
  });

  const { data: settings } = useQuery({
    queryKey: ["gcal-settings", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("google_calendar_settings")
        .select("primary_calendar_id, conflict_calendar_ids, sync_mode")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
    staleTime: 60_000,
  });

  const isGoogleConnected = !!connection && !!settings?.primary_calendar_id;
  const syncMode = settings?.sync_mode || "one_way";

  async function syncToGoogle(action: string, appointmentId?: string) {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action, companyId, appointmentId },
      });
      if (error) throw error;
      return data;
    } catch (e: any) {
      console.error(`Google Calendar sync (${action}) failed:`, e);
      toast.error("Errore sincronizzazione Google", {
        description: e.message || "Operazione non riuscita",
      });
    }
  }

  async function pushEvent(appointmentId: string) {
    if (!isGoogleConnected) return;
    return syncToGoogle("push-event", appointmentId);
  }

  async function updateEvent(appointmentId: string) {
    if (!isGoogleConnected) return;
    return syncToGoogle("update-event", appointmentId);
  }

  async function deleteEvent(appointmentId: string) {
    if (!isGoogleConnected) return;
    return syncToGoogle("delete-event", appointmentId);
  }

  async function pullBusySlots() {
    return syncToGoogle("full-sync");
  }

  async function reconcileSync() {
    if (!isGoogleConnected) return;
    return syncToGoogle("reconcile");
  }

  async function checkMapping(appointmentId: string) {
    if (!companyId || !userId) return null;
    const { data } = await supabase
      .from("google_calendar_event_map")
      .select("id, google_event_id")
      .eq("appointment_id", appointmentId)
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  }

  return {
    isGoogleConnected,
    connection,
    settings,
    syncMode,
    pushEvent,
    updateEvent,
    deleteEvent,
    pullBusySlots,
    reconcileSync,
    checkMapping,
  };
}
