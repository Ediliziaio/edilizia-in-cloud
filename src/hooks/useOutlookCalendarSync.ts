import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";

/**
 * Stato del collegamento Outlook (Microsoft 365) dell'utente corrente, con la
 * stessa forma di useGoogleCalendarSync / useAppleCalendarSync così i
 * calendari li trattano allo stesso modo.
 *
 * Outlook è in sola lettura: la edge function `outlook-calendar-sync` porta
 * gli eventi di Microsoft in `outlook_calendar_events`, che i calendari
 * leggono dalla vista `outlook_calendar_busy_slots` (solo gli impegni che
 * occupano davvero); non spinge gli appuntamenti verso Outlook. Per questo
 * qui non c'è pushEvent/updateEvent come per Google e Apple.
 */
export function useOutlookCalendarSync() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;

  const { data: connection } = useQuery({
    queryKey: ["outlook-calendar-connection", companyId, userId],
    queryFn: async () => {
      if (!companyId || !userId) return null;
      const { data } = await supabase
        .from("outlook_calendar_connections")
        .select("id, status, last_sync_at, microsoft_account_email, primary_calendar_id, synced_calendar_ids")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
    enabled: !!companyId && !!userId,
    staleTime: 60_000,
  });

  const hasOutlookConnection = connection?.status === "connected";
  // Basta il collegamento: la sync sceglie da sola i calendari (synced_calendar_ids),
  // non serve un "calendario principale" come per Google e Apple.
  const isOutlookConnected = hasOutlookConnection;

  async function pullBusySlots() {
    if (!companyId || !hasOutlookConnection) return;
    try {
      const { data, error } = await supabase.functions.invoke("outlook-calendar-sync", { body: { companyId } });
      if (error) throw error;
      return data;
    } catch (e: unknown) {
      logger.error("Outlook Calendar sync failed:", e);
      toast.error("Errore sincronizzazione Outlook Calendar", {
        description: e instanceof Error && e.message ? e.message : "Operazione non riuscita",
      });
    }
  }

  return {
    isOutlookConnected,
    hasOutlookConnection,
    connection,
    pullBusySlots,
  };
}
