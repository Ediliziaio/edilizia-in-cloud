/**
 * useInternalChatUnreadTotal — Conta i messaggi non letti totali della chat
 * team interna per l'utente corrente, sommando tutti i canali.
 *
 * Usato per il badge sul pulsante Chat Team nell'header mobile.
 * Riutilizza la RPC `get_internal_chat_sidebar_state` già esistente
 * (la stessa che alimenta la sidebar in /azienda/chat) per coerenza dati.
 *
 * Realtime: subscription su `internal_chat_messages` filtrata sul company_id
 * → invalidate query al primo INSERT per refresh badge senza polling stretto.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface SidebarRow {
  channel_id: string;
  unread_count: number | null;
}

const QUERY_KEY = "internal-chat-unread-total";

export function useInternalChatUnreadTotal() {
  const { effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = profile?.id;
  const queryClient = useQueryClient();

  const { data: unreadTotal = 0 } = useQuery({
    queryKey: [QUERY_KEY, companyId, userId],
    enabled: !!companyId && !!userId,
    staleTime: 15_000,
    refetchInterval: 60_000, // safety net se realtime fallisce
    queryFn: async () => {
      // Cast tipato per evitare l'errore TS sui custom RPC non in types.ts
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: SidebarRow[] | null; error: unknown }>;

      const { data, error } = await rpc.call(
        supabase,
        "get_internal_chat_sidebar_state",
        { p_company_id: companyId!, p_user_id: userId! },
      );

      if (error || !Array.isArray(data)) return 0;
      return data.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
    },
  });

  // Realtime: invalida la query al primo INSERT su internal_chat_messages
  // dell'azienda corrente. Refetch automatico → badge sempre fresco.
  useEffect(() => {
    if (!companyId || !userId) return;
    const channel = supabase
      .channel(`chat-unread-total-${companyId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "internal_chat_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          // Ignora i messaggi inviati da me — non contano come "non letti".
          const senderId = (payload.new as { sender_id?: string } | null)?.sender_id;
          if (senderId === userId) return;
          queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId, userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, userId, queryClient]);

  return unreadTotal;
}
