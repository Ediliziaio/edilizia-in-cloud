import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Conta i messaggi non letti nei ticket del cliente.
 * Ascolta in realtime per aggiornare il badge.
 */
export function useCustomerUnreadCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.customerUnread.messages(user?.id),
    queryFn: async () => {
      // Count ticket messages from staff that haven't been read
      const { count, error } = await supabase
        .from("ticket_messages")
        .select("id, ticket:tickets!inner(customer_id)", { count: "exact", head: true })
        .eq("tickets.customer_id", user!.id)
        .neq("sender_id", user!.id)
        .is("read_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  // Realtime subscription for new ticket messages
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("customer-ticket-messages-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.customerUnread.messages(user.id) });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  return unreadCount;
}
