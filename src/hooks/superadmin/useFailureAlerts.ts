import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FailureAlert {
  id: string;
  company_id: string;
  alert_type: "payment_failure" | "email_failure" | "sync_failure" | "api_failure";
  failure_count: number;
  details: Record<string, unknown>;
  alert_sent_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  company_name?: string;
}

/** Tipo intermedio per mappare la risposta del join companies */
interface RawAlertRow {
  id: string;
  company_id: string;
  alert_type: "payment_failure" | "email_failure" | "sync_failure" | "api_failure";
  failure_count: number;
  details: Record<string, unknown>;
  alert_sent_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  companies: { name: string } | null;
}

/** Hook principale per gli alert di failure */
export function useFailureAlerts(onlyUnresolved = true) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["failure-alerts", onlyUnresolved],
    queryFn: async (): Promise<FailureAlert[]> => {
      let q = supabase
        .from("failure_alerts")
        .select(
          "id, company_id, alert_type, failure_count, details, alert_sent_at, resolved_at, resolved_by, companies:company_id(name)"
        )
        .order("alert_sent_at", { ascending: false })
        .limit(200);
      if (onlyUnresolved) q = q.is("resolved_at", null);
      const { data, error } = await q;
      if (error) throw new Error("Impossibile caricare gli alert: " + error.message);
      return (data as RawAlertRow[] ?? []).map((r) => ({
        id: r.id,
        company_id: r.company_id,
        alert_type: r.alert_type,
        failure_count: r.failure_count,
        details: r.details,
        alert_sent_at: r.alert_sent_at,
        resolved_at: r.resolved_at,
        resolved_by: r.resolved_by,
        company_name: r.companies?.name ?? undefined,
      }));
    },
    refetchInterval: 60_000, // aggiorna ogni minuto
  });

  /** Mutation per segnare un alert come risolto */
  const resolveAlert = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("failure_alerts")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: userData.user?.id ?? null,
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      if (note) console.info("[failure_alert] risolto con nota:", note);
    },
    onSuccess: () => {
      toast.success("Alert segnato come risolto");
      queryClient.invalidateQueries({ queryKey: ["failure-alerts"] });
    },
    onError: (err: Error) => toast.error("Errore: " + err.message),
  });

  return { ...query, resolveAlert };
}

/** Hook per ottenere solo il conteggio degli alert non risolti */
export function useUnresolvedAlertsCount() {
  return useQuery({
    queryKey: ["failure-alerts-count"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("failure_alerts")
        .select("id", { count: "exact", head: true })
        .is("resolved_at", null);
      if (error) return 0;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}
