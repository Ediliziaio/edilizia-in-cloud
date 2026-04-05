import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

export function useAppleCalendarSync() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;

  const { data: connection } = useQuery({
    queryKey: ["apple-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_connections")
        .select("id, status, last_sync_at, apple_id_email")
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
    queryKey: ["apple-calendar-settings", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("apple_calendar_settings")
        .select("primary_calendar_url, primary_calendar_name, conflict_calendar_urls, sync_mode")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
    staleTime: 60_000,
  });

  const isAppleConnected = !!connection;

  async function invokeSync(action: string, appointmentId?: string) {
    if (!companyId) return;
    try {
      const { data, error } = await supabase.functions.invoke("apple-calendar-sync", {
        body: { action, companyId, appointmentId },
      });
      if (error) throw error;
      return data;
    } catch (e: any) {
      logger.error(`Apple Calendar sync (${action}) failed:`, e);
      toast.error("Errore sincronizzazione Apple Calendar", {
        description: e.message || "Operazione non riuscita",
      });
    }
  }

  async function pullBusySlots() {
    return invokeSync("full-sync");
  }

  async function pushEvent(appointmentId: string) {
    if (!isAppleConnected) return;
    return invokeSync("push-event", appointmentId);
  }

  async function updateEvent(appointmentId: string) {
    if (!isAppleConnected) return;
    return invokeSync("update-event", appointmentId);
  }

  async function deleteEvent(appointmentId: string) {
    if (!isAppleConnected) return;
    return invokeSync("delete-event", appointmentId);
  }

  return {
    isAppleConnected,
    connection,
    settings,
    pullBusySlots,
    pushEvent,
    updateEvent,
    deleteEvent,
  };
}
