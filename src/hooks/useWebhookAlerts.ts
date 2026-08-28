import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * I webhook in ENTRATA dai provider (Meta, Stripe...) si registrano in
 * `integration_webhook_events`. Questo hook interrogava `webhook_logs`, che
 * non e' mai esistita: il pannello andava in errore a ogni apertura.
 *
 * Da non confondere con `platform_webhooks` / `webhook_deliveries`, che sono
 * i webhook in USCITA verso i clienti — concetto diverso, altra tabella.
 */
export interface WebhookLog {
  id: string;
  provider: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  last_fail_reason: string | null;
  fail_count: number;
  processed_at: string | null;
  received_at: string;
}

export interface WebhookAlertStats {
  total_today: number;
  failed_today: number;
  pending_retry: number;
  success_rate: number;
}

interface UseWebhookAlertsOptions {
  provider?: string;
  status?: string;
}

/** Fetch webhook logs with optional filters */
export function useWebhookLogs({ provider, status }: UseWebhookAlertsOptions = {}) {
  return useQuery({
    queryKey: ["admin", "webhook-logs", provider, status],
    queryFn: async (): Promise<WebhookLog[]> => {
      let query = supabase
        .from("integration_webhook_events")
        .select("id, provider, event_type, payload, status, last_fail_reason, fail_count, processed_at, received_at")
        .order("received_at", { ascending: false })
        .limit(200);

      if (provider && provider !== "all") {
        query = query.eq("provider" as never, provider);
      }
      if (status && status !== "all") {
        query = query.eq("status" as never, status);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as WebhookLog[];
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/** Compute stats from webhook logs */
export function useWebhookStats() {
  return useQuery({
    queryKey: ["admin", "webhook-stats"],
    queryFn: async (): Promise<WebhookAlertStats> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from("integration_webhook_events")
        .select("status")
        .gte("received_at", todayStart.toISOString());

      if (error) throw new Error(error.message);
      const logs = (data ?? []) as Array<{ status: string }>;

      const total_today = logs.length;
      const failed_today = logs.filter((l) => l.status === "failed").length;
      const pending_retry = logs.filter(
        (l) => l.status === "failed" || l.status === "pending"
      ).length;
      const success_rate =
        total_today === 0
          ? 100
          : Math.round(((total_today - failed_today) / total_today) * 100);

      return { total_today, failed_today, pending_retry, success_rate };
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/** Retry a failed webhook manually */
export function useRetryWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (webhookId: string) => {
      // Fetch the log entry first
      const { data, error: fetchError } = await supabase
        .from("integration_webhook_events")
        .select("id, provider, event_type, payload, fail_count")
        .eq("id", webhookId)
        .single();
      if (fetchError) throw new Error(fetchError.message);
      const log = data as WebhookLog;

      // Segna il ritentativo in corso e conta il fallimento precedente
      const { error: updateError } = await supabase
        .from("integration_webhook_events")
        .update({
          status: "retrying",
          fail_count: log.fail_count + 1,
        })
        .eq("id", webhookId);
      if (updateError) throw new Error(updateError.message);

      // Call the appropriate webhook handler via edge function.
      // NB: 'gocardless'/'bank' (Open Banking via GoCardless) rimosso — provider dismesso,
      // edge bank-webhook eliminata. I relativi log restano ma non sono più ritentabili.
      const functionName =
        log.provider === "stripe"
          ? "billing-webhook"
          : log.provider === "telnyx"
          ? "telnyx-webhook"
          : null;

      if (functionName) {
        const { error: fnError } = await supabase.functions.invoke(functionName, {
          body: { ...log.payload, _retry: true, _log_id: webhookId },
        });
        if (fnError) {
          // Mark as failed again
          await supabase
            .from("integration_webhook_events")
            .update({ status: "failed", last_fail_reason: fnError.message })
            .eq("id", webhookId);
          throw new Error(`Retry fallito: ${fnError.message}`);
        }
        // Mark as processed
        await supabase
          .from("integration_webhook_events")
          .update({ status: "processed", processed_at: new Date().toISOString() })
          .eq("id", webhookId);
      }
    },
    onSuccess: () => {
      toast.success("Webhook reinviato con successo");
      void qc.invalidateQueries({ queryKey: ["admin", "webhook-logs"] });
      void qc.invalidateQueries({ queryKey: ["admin", "webhook-stats"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
