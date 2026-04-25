// MP-FINAL — Hook React Query per broadcasts.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { withClientTimeout } from "@/lib/query-timeout";
import { toast } from "sonner";
import type { Database, Json } from "@/integrations/supabase/types";

export type WABroadcast = Database["public"]["Tables"]["whatsapp_broadcasts"]["Row"];

export function useWABroadcasts(filter?: { status?: string }) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["wa", "broadcasts", companyId, filter?.status],
    enabled: !!companyId,
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_broadcasts")
        .select(
          "id, nome, template_name, wa_number_id, status, scheduled_at, started_at, completed_at, cancelled_at, total_contacts, sent_count, failed_count, replied_count, created_at",
        )
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (filter?.status) q = q.eq("status", filter.status);
      const { data, error } = await withClientTimeout(q, "Caricamento broadcast WhatsApp");
      if (error) throw error;
      return (data ?? []) as WABroadcast[];
    },
  });
}

export function useWABroadcast(id: string | undefined) {
  return useQuery({
    queryKey: ["wa", "broadcasts", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("whatsapp_broadcasts")
        .select("*")
        .eq("id", id!)
        .maybeSingle(),
        "Caricamento dettaglio broadcast",
      );
      if (error) throw error;
      return data as WABroadcast | null;
    },
  });
}

export function useWABroadcastRecipients(broadcastId: string | undefined) {
  return useQuery({
    queryKey: ["wa", "broadcasts", "recipients", broadcastId],
    enabled: !!broadcastId,
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("whatsapp_broadcast_recipients")
        .select("id, phone_number, status, sent_at, read_at, delivered_at, error_message")
        .eq("broadcast_id", broadcastId!)
        .order("created_at", { ascending: true })
        .limit(500),
        "Caricamento destinatari broadcast",
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CreateBroadcastPayload {
  nome: string;
  wa_number_id: string;
  template_name: string;
  template_variables: Record<string, unknown>;
  segment_filter: Record<string, unknown>;
  scheduled_at: string;
  window_start?: string;
  window_end?: string;
}

export function useCreateBroadcast() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBroadcastPayload) => {
      const { data: bc, error: bcErr } = await supabase
        .from("whatsapp_broadcasts")
        .insert({
          company_id: companyId!,
          nome: payload.nome,
          wa_number_id: payload.wa_number_id,
          template_name: payload.template_name,
          template_variables: payload.template_variables as Json,
          segment: JSON.stringify(payload.segment_filter),
          segment_config: payload.segment_filter as Json,
          scheduled_at: payload.scheduled_at,
          window_start: payload.window_start ?? null,
          window_end: payload.window_end ?? null,
          status: "scheduled",
        })
        .select("id")
        .single();
      if (bcErr) throw bcErr;

      const { data: count, error: rpcErr } = await supabase.rpc(
        "populate_broadcast_recipients",
        {
          p_broadcast_id: bc.id,
          p_segment_filter: payload.segment_filter as Json,
          p_variable_mapping: payload.template_variables as Json,
        },
      );
      if (rpcErr) throw rpcErr;

      return { broadcast_id: bc.id, recipients: (count ?? 0) as number };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["wa", "broadcasts"] });
      toast.success(`Broadcast schedulato. Destinatari: ${data.recipients}`);
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}

export function useCancelBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("whatsapp_broadcasts")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "scheduled");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa", "broadcasts"] });
      toast.success("Broadcast annullato.");
    },
    onError: (err: Error) => toast.error(`Errore: ${err.message}`),
  });
}
