import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Webhook, WebhookDelivery } from "@/types/webhooks";
import { WEBHOOK_EVENTS } from "@/types/webhooks";

const VALID_WEBHOOK_EVENTS = new Set(Object.values(WEBHOOK_EVENTS).flat() as string[]);
const PRIVATE_HOST_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^0\./,
];

function validateWebhookEndpoint(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("URL endpoint obbligatorio.");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("URL webhook non valido.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  if (parsed.username || parsed.password) {
    throw new Error("L'URL webhook non può contenere credenziali.");
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new Error("I webhook devono usare HTTPS, salvo localhost per test locale.");
  }
  if (!isLocalhost && PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error("Endpoint webhook su reti private/locali non consentiti.");
  }
  if (hostname.endsWith(".local") || hostname === "metadata.google.internal") {
    throw new Error("Endpoint webhook locali o metadata non consentiti.");
  }

  return parsed.toString();
}

function normalizeWebhookPayload<T extends Partial<Pick<Webhook, "name" | "url" | "secret" | "events" | "timeout_seconds" | "allowed_ips">>>(input: T): T {
  const normalized = { ...input } as T;
  if (typeof normalized.name === "string") normalized.name = normalized.name.trim() as T["name"];
  if (typeof normalized.url === "string") normalized.url = validateWebhookEndpoint(normalized.url) as T["url"];
  if (Array.isArray(normalized.events)) {
    normalized.events = Array.from(new Set(normalized.events)).filter((event) => VALID_WEBHOOK_EVENTS.has(event)) as T["events"];
  }
  if (normalized.timeout_seconds != null) {
    normalized.timeout_seconds = Math.max(3, Math.min(60, Number(normalized.timeout_seconds) || 15)) as T["timeout_seconds"];
  }
  if (Array.isArray(normalized.allowed_ips)) {
    normalized.allowed_ips = normalized.allowed_ips.map((ip) => ip.trim()).filter(Boolean) as T["allowed_ips"];
  }
  return normalized;
}

export function useWebhooks(companyId: string | undefined) {
  return useQuery({
    queryKey: ["webhooks", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("webhooks")
        .select("id, company_id, name, url, is_active, events, created_by, created_at, updated_at, allowed_ips, timeout_seconds, consecutive_failures, max_consecutive_failures, paused_at, paused_reason")
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
    mutationFn: async (
      input: Pick<Webhook, "name" | "url" | "secret" | "events"> &
        Partial<Pick<Webhook, "timeout_seconds" | "allowed_ips">>
    ) => {
      if (!companyId) throw new Error("companyId richiesto");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const payload = normalizeWebhookPayload(input);
      if (!payload.name || !payload.url || !payload.events?.length) {
        throw new Error("Nome, URL ed eventi sono obbligatori.");
      }
      const { error } = await supabase.from("webhooks").insert({
        ...payload,
        company_id: companyId,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useUpdateWebhook(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Webhook> & { id: string }) => {
      if (!companyId) throw new Error("companyId richiesto");
      const payload = normalizeWebhookPayload(data);
      const { error } = await supabase
        .from("webhooks")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useDeleteWebhook(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (webhookId: string) => {
      if (!companyId) throw new Error("companyId richiesto");
      const { error } = await supabase.from("webhooks").delete().eq("id", webhookId).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", companyId] }),
  });
}

export function useRetryDelivery(webhookId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deliveryId: string) => {
      if (!webhookId) throw new Error("Webhook richiesto");
      const { data: delivery, error: fetchErr } = await supabase
        .from("webhook_deliveries")
        .select("webhook_id, event_type, payload, attempt_count")
        .eq("id", deliveryId)
        .eq("webhook_id", webhookId)
        .single();
      if (fetchErr || !delivery) throw new Error("Delivery non trovato");

      // Update status to retrying and increment attempt count
      await supabase
        .from("webhook_deliveries")
        .update({
          status: "retrying",
          attempt_count: (delivery.attempt_count ?? 1) + 1,
          last_attempt_at: new Date().toISOString(),
        } as never)
        .eq("id", deliveryId)
        .eq("webhook_id", webhookId);

      const { error } = await supabase.functions.invoke("send-webhook", {
        body: {
          webhook_id: delivery.webhook_id,
          event_type: delivery.event_type,
          payload: delivery.payload,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-deliveries", webhookId] }),
  });
}
