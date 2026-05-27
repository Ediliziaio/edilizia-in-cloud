import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { logger } from "@/utils/logger";

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
    queryKey: queryKeys.googleCalendar.settings(companyId, userId),
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

  // 2026-05-27 (push owner-based per appointment operativi):
  // Per il push verso Google del COLLEGA assegnato, l'utente loggato
  // potrebbe NON essere connesso (es. admin che assegna un cantiere a
  // un posatore). Verifichiamo se QUALCUNO nell'azienda è connesso —
  // se sì, tentiamo il push (la edge function risolve l'utente
  // effettivo via owner/assigned).
  const { data: anyCompanyConnection } = useQuery({
    queryKey: ["gcal-any-company-connection", companyId],
    queryFn: async () => {
      if (!companyId) return false;
      const { count } = await supabase
        .from("google_calendar_connections")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "connected");
      return (count ?? 0) > 0;
    },
    enabled: !!companyId,
    staleTime: 2 * 60_000,
  });

  const hasGoogleConnection = connection?.status === "connected";
  const isGoogleConnected = hasGoogleConnection && !!settings?.primary_calendar_id;
  const hasAnyCompanyGoogleConnection = !!anyCompanyConnection;
  const syncMode = settings?.sync_mode || "one_way";

  async function syncToGoogle(action: string, appointmentId?: string) {
    if (!companyId) return;
    try {
      // 2026-05-27: `supabase.functions.invoke` su 4xx/5xx ritorna error
      // generico "non-2xx status" SENZA esporre il body. Per mostrare la
      // causa reale (es. "googleStatus 400: Bad Request: invalid datetime")
      // ricaviamo `data` anche in caso di errore — Supabase mette il JSON
      // del body in `data` solo se ha riuscito a parsarlo.
      const { data, error } = await supabase.functions.invoke("google-calendar-sync", {
        body: { action, companyId, appointmentId },
      });
      if (error) {
        const detail =
          data?.googleError ||
          data?.error ||
          (data?.googleStatus ? `HTTP ${data.googleStatus}` : null) ||
          error.message;
        throw new Error(detail);
      }
      return data;
    } catch (e: any) {
      logger.error(`Google Calendar sync (${action}) failed:`, e);
      toast.error("Errore sincronizzazione Google", {
        description: e.message || "Operazione non riuscita",
      });
    }
  }

  // 2026-05-27: i 3 metodi ora controllano hasAnyCompanyGoogleConnection
  // invece di isGoogleConnected — l'admin che NON ha Google può comunque
  // pushare per un posatore che CE L'HA. La edge function risolverà
  // l'utente effettivo via owner_id del marketing_calendar o
  // assigned_to dell'appointment, e userà la sua connessione.
  async function pushEvent(appointmentId: string) {
    if (!hasAnyCompanyGoogleConnection) return;
    return syncToGoogle("push-event", appointmentId);
  }

  async function updateEvent(appointmentId: string) {
    if (!hasAnyCompanyGoogleConnection) return;
    return syncToGoogle("update-event", appointmentId);
  }

  async function deleteEvent(appointmentId: string) {
    if (!hasAnyCompanyGoogleConnection) return;
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
      .eq("company_id", companyId)
      .eq("appointment_id", appointmentId)
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  }

  return {
    isGoogleConnected,
    hasGoogleConnection,
    hasAnyCompanyGoogleConnection,
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
