import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Webhook, WebhookDelivery } from "@/types/webhooks";

export function useWebhooks(companyId: string | undefined) {
  return useQuery({
    queryKey: ["webhooks", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("webhooks")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Webhook[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useWebhookDeliveries(webhookId: string | null) {
  return useQuery({
    queryKey: ["webhook-deliveries", webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("*")
        .eq("webhook_id", webhookId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as WebhookDelivery[];
    },
    enabled: !!webhookId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}

export function useCreateWebhook(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Pick<Webhook, "name" | "url" | "secret" | "events">) => {
      if (!companyId) throw new Error("companyId richiesto");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("webhooks").insert({
        ...input,
        company_id: companyId,
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useUpdateWebhook(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Webhook> & { id: string }) => {
      const { error } = await supabase
        .from("webhooks")
        .update({ ...data, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useDeleteWebhook(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (webhookId: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", webhookId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useRetryDelivery(webhookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      const { data: delivery, error: fetchErr } = await supabase
        .from("webhook_deliveries")
        .select("webhook_id, event_type, payload, attempt_count")
        .eq("id", deliveryId)
        .single();
      if (fetchErr || !delivery) throw new Error("Delivery non trovato");

      // Update status to retrying and increment attempt count
      await supabase
        .from("webhook_deliveries")
        .update({
          status: "retrying",
          attempt_count: ((delivery as any).attempt_count ?? 1) + 1,
          last_attempt_at: new Date().toISOString(),
        } as any)
        .eq("id", deliveryId);

      const { error } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: (delivery as any).webhook_id,
          event_type: (delivery as any).event_type,
          payload: (delivery as any).payload,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] }),
  });
}
