import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type DiaryEntry =
  | { kind: "event"; data: OrderEvent }
  | { kind: "message"; data: OrderMessage };

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_name: string | null;
  created_at: string;
}

export interface OrderMessage {
  id: string;
  order_id: string;
  channel: string;
  direction: "out" | "in";
  subject?: string;
  body: string;
  to_name?: string;
  to_email?: string;
  to_phone?: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_reason?: string;
  sent_by_name?: string;
  reply_to_id?: string;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  channel: string;
  subject?: string;
  body: string;
}

export function useOrderDiary(orderId: string | undefined) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();

  // ── Fetch events ──────────────────────────────────────────────────────────
  const { data: events = [] } = useQuery({
    queryKey: ["order-events", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events" as never)
        .select("*")
        .eq("order_id" as never, orderId as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderEvent[];
    },
    enabled: !!orderId,
    staleTime: 30_000,
  });

  // ── Fetch messages ────────────────────────────────────────────────────────
  const { data: messages = [] } = useQuery({
    queryKey: ["order-messages", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages" as never)
        .select("*")
        .eq("order_id" as never, orderId as never)
        .order("created_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrderMessage[];
    },
    enabled: !!orderId,
    staleTime: 30_000,
  });

  // ── Fetch templates ───────────────────────────────────────────────────────
  const { data: templates = [] } = useQuery({
    queryKey: ["message-templates", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("message_templates" as never)
        .select("*")
        .eq("company_id" as never, effectiveCompany!.id as never)
        .eq("is_active" as never, true as never)
        .order("name" as never);
      return (data ?? []) as MessageTemplate[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 300_000,
  });

  // ── Supabase Realtime subscription ────────────────────────────────────────
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-diary-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_messages",
          filter: `order_id=eq.${orderId}`,
        },
        () => { qc.invalidateQueries({ queryKey: ["order-messages", orderId] }); }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_events",
          filter: `order_id=eq.${orderId}`,
        },
        () => { qc.invalidateQueries({ queryKey: ["order-events", orderId] }); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId, qc]);

  // ── Timeline unificata (merge + sort) ─────────────────────────────────────
  const timeline: DiaryEntry[] = useMemo(() => {
    const evts = events.map(e => ({ kind: "event" as const, data: e, ts: e.created_at }));
    const msgs = messages.map(m => ({ kind: "message" as const, data: m, ts: m.created_at }));
    return [...evts, ...msgs].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [events, messages]);

  // ── Send message mutation ─────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (payload: {
      channel: string;
      to_name: string;
      to_email?: string;
      to_phone?: string;
      subject?: string;
      body: string;
      template_id?: string;
    }) => {
      const { error } = await supabase.functions.invoke("send-order-message", {
        body: { order_id: orderId, ...payload },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
    },
  });

  // ── Add internal note mutation ────────────────────────────────────────────
  const addNoteMutation = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.functions.invoke("send-order-message", {
        body: { order_id: orderId, channel: "nota_interna", to_name: "", body },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-messages", orderId] });
    },
  });

  return { timeline, templates, sendMutation, addNoteMutation };
}
