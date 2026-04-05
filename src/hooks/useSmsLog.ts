/**
 * Hook per la lettura dei log di invio SMS.
 * Fornisce lista log per campagna e statistiche aggregate.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SmsLog, SmsStatsCampagna } from "@/types/sms-marketing";

const SMS_LOG_KEY = "sms-log";

export function useSmsLog(campagnaId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  // ─── Log per campagna ────────────────────────────────────
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: [SMS_LOG_KEY, companyId, campagnaId],
    queryFn: async (): Promise<SmsLog[]> => {
      if (!companyId || !campagnaId) return [];
      const { data, error: queryError } = await supabase
        .from("sms_log")
        .select(
          "id, campagna_id, company_id, contatto_id, telefono, messaggio, stato, provider_message_id, provider_response, costo, errore_dettaglio, inviato_at, consegnato_at, created_at"
        )
        .eq("company_id", companyId)
        .eq("campagna_id", campagnaId)
        .order("created_at", { ascending: false });
      if (queryError) {
        console.error("[useSmsLog] getByCampagna:", queryError);
        throw new Error("Impossibile caricare i log. Riprova tra qualche secondo.");
      }
      return (data ?? []) as SmsLog[];
    },
    enabled: !!companyId && !!campagnaId,
    staleTime: 30 * 1000,
  });

  // ─── Statistiche aggregate ───────────────────────────────
  const stats: SmsStatsCampagna = {
    inviati: logs.filter((l) => ["inviato", "consegnato"].includes(l.stato)).length,
    consegnati: logs.filter((l) => l.stato === "consegnato").length,
    errori: logs.filter((l) => l.stato === "fallito").length,
    tasso_consegna:
      logs.length > 0
        ? (logs.filter((l) => l.stato === "consegnato").length / logs.length) * 100
        : 0,
  };

  return {
    logs,
    stats,
    isLoading,
    error: error instanceof Error ? error.message : null,
  };
}
