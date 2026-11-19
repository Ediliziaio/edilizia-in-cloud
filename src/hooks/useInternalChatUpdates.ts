import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { shareSubscription } from "@/lib/realtime/shareSubscription";

/** Ascolta anche quando l'elenco è vuoto: il primo messaggio può creare una chat. */
export function useInternalChatUpdates(companyId: string | null, userId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!companyId || !userId) return;
    return shareSubscription(queryClient, `chat-list:${companyId}:${userId}`, () => {
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships", companyId, userId] });
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-channels", companyId] });
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-members", companyId] });
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-profiles", companyId, userId] });
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-sidebar-state", companyId, userId] });
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-unread-total", companyId, userId] });
      };
      const instance = Math.random().toString(36).slice(2, 10);
      const channel = supabase.channel(`chat-list-${companyId}-${userId}-${instance}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "internal_chat_messages",
          filter: `company_id=eq.${companyId}`,
        }, refresh)
        .subscribe((status) => { if (status === "SUBSCRIBED") refresh(); });
      // Le membership non sono pubblicate in Realtime. Recupera anche un invito
      // a un gruppo ancora vuoto, senza aspettare i cinque minuti della cache.
      const timer = window.setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void queryClient.invalidateQueries({ queryKey: ["internal-chat-my-memberships", companyId, userId] });
      }, 15_000);
      window.addEventListener("online", refresh);
      return () => {
        window.clearInterval(timer);
        window.removeEventListener("online", refresh);
        void supabase.removeChannel(channel);
      };
    });
  }, [companyId, userId, queryClient]);
}
