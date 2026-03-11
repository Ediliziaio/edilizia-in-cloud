import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export function useMessagingEnabled() {
  const { effectiveCompany } = useAuth();
  return (effectiveCompany as any)?.messaging_beta_enabled === true;
}

export function useConversations(filter?: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.messaging.conversations(companyId, filter),
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("messaging_conversations")
        .select("*")
        .eq("company_id", companyId)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (filter === "clienti") query = query.eq("contact_type", "cliente");
      else if (filter === "operai") query = query.eq("contact_type", "operaio");
      else if (filter === "collaboratori") query = query.eq("contact_type", "collaboratore");
      else if (filter === "non_assegnate") query = query.is("linked_entity_id", null);
      else if (filter === "urgenti") query = query.eq("is_urgent", true);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.messaging.messages(conversationId),
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("messaging_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}

export function useAiRuns(messageId: string | null) {
  return useQuery({
    queryKey: queryKeys.messaging.aiRuns(messageId),
    queryFn: async () => {
      if (!messageId) return [];
      const { data, error } = await supabase
        .from("messaging_ai_runs")
        .select("*")
        .eq("message_id", messageId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!messageId,
    staleTime: 10_000,
  });
}

export function useSimulateMessage() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      contactName: string;
      phoneNumber: string;
      contactType: string;
      messageType: string;
      content: string;
    }) => {
      const companyId = effectiveCompany?.id;
      if (!companyId) throw new Error("No company");

      // Find or create conversation
      let conversationId: string;
      const { data: existing } = await supabase
        .from("messaging_conversations")
        .select("id")
        .eq("company_id", companyId)
        .eq("phone_number", params.phoneNumber)
        .maybeSingle();

      if (existing) {
        conversationId = existing.id;
        await supabase
          .from("messaging_conversations")
          .update({
            last_message_at: new Date().toISOString(),
            status: "da_gestire",
            contact_name: params.contactName,
            contact_type: params.contactType,
          })
          .eq("id", conversationId);
      } else {
        const { data: newConv, error } = await supabase
          .from("messaging_conversations")
          .insert({
            company_id: companyId,
            phone_number: params.phoneNumber,
            contact_name: params.contactName,
            contact_type: params.contactType,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw error;
        conversationId = newConv.id;
      }

      // Insert message
      const { data: msg, error: msgErr } = await supabase
        .from("messaging_messages")
        .insert({
          conversation_id: conversationId,
          sender_type: "contact",
          sender_name: params.contactName,
          message_type: params.messageType,
          content: params.content,
        })
        .select()
        .single();
      if (msgErr) throw msgErr;

      return { conversationId, messageId: msg.id, companyId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversationsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messagesAll });
  });
}

export function useAnalyzeMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { messageId: string; companyId: string }) => {
      const { data, error } = await supabase.functions.invoke("analyze-message", {
        body: { message_id: params.messageId, company_id: params.companyId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiRunsAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messagesAll });
    },
    onError: (err: any) => {
      toast.error("Errore analisi AI", { description: err?.message || "Errore durante l'analisi del messaggio" });
    },
  });
}

export function useConfirmAiAction() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  return useMutation({
    mutationFn: async (params: { aiRunId: string; action: any }) => {
      const companyId = effectiveCompany?.id;
      if (!companyId || !user) throw new Error("Not authenticated");

      let createdActions: any[] = [];

      if (params.action.type === "create_task") {
        const { data: task, error } = await supabase
          .from("tasks")
          .insert({
            company_id: companyId,
            title: params.action.title,
            notes: params.action.description || null,
            priority: params.action.priority === "urgente" ? "urgente" : params.action.priority === "alta" ? "alta" : "normale",
            category: "generale",
            created_by: user.id,
            status: "da_fare",
          })
          .select()
          .single();
        if (error) throw error;
        createdActions.push({ type: "task", id: task.id });
      }

      if (params.action.type === "create_daily_report") {
        const { data: report, error } = await supabase
          .from("messaging_daily_reports")
          .insert({
            company_id: companyId,
            report_date: new Date().toISOString().split("T")[0],
            description: params.action.title + (params.action.description ? ` - ${params.action.description}` : ""),
          })
          .select()
          .single();
        if (error) throw error;
        createdActions.push({ type: "daily_report", id: report.id });
      }

      // Update AI run
      await supabase
        .from("messaging_ai_runs")
        .update({
          status: "confirmed",
          confirmed_by: user.id,
          confirmed_at: new Date().toISOString(),
          created_actions: createdActions,
        })
        .eq("id", params.aiRunId);

      return createdActions;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiRunsAll });
      toast.success("Azione confermata", { description: "L'azione è stata eseguita con successo." });
    },
    onError: (err: any) => {
      toast.error("Errore", { description: err?.message || "Errore nell'esecuzione dell'azione" });
    },
  });
}

export function useIgnoreAiRun() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (aiRunId: string) => {
      await supabase
        .from("messaging_ai_runs")
        .update({ status: "ignored", confirmed_by: user?.id, confirmed_at: new Date().toISOString() })
        .eq("id", aiRunId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messaging.aiRunsAll });
    },
  });
}

export function useMessagingRealtime(conversationId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;

    const msgChannel = supabase
      .channel(`messaging-msgs-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messaging_messages", filter: `conversation_id=eq.${conversationId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messages(conversationId) });
          // Also refresh conversations list (last_message_at, status changes)
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversationsAll });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [conversationId, queryClient]);
}

/** Realtime listener for conversation list updates (new incoming messages, status changes) */
export function useConversationsRealtime(companyId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel(`messaging-convs-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messaging_conversations", filter: `company_id=eq.${companyId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversationsAll });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);
}
