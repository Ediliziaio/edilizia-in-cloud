import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Conta i messaggi non letti nei ticket del cliente.
 * Usa ticket_read_status.last_read_at per determinare quali messaggi sono nuovi.
 * Ascolta in realtime per aggiornare il badge.
 */
export function useCustomerUnreadCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.customerUnread.messages(user?.id),
    queryFn: async () => {
      // 1. Get all tickets belonging to this customer
      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select("id")
        .eq("customer_id", user!.id);
      if (ticketsError) throw ticketsError;
      if (!tickets || tickets.length === 0) return 0;

      const ticketIds = tickets.map((t) => t.id);

      // 2. Get read status for each ticket
      const { data: readStatuses, error: rsError } = await supabase
        .from("ticket_read_status")
        .select("ticket_id, last_read_at")
        .eq("user_id", user!.id)
        .in("ticket_id", ticketIds);
      if (rsError) throw rsError;

      const readMap: Record<string, string> = {};
      for (const rs of readStatuses || []) {
        readMap[rs.ticket_id] = rs.last_read_at;
      }

      // 3. Count messages from others that are newer than last_read_at
      let totalUnread = 0;
      for (const ticketId of ticketIds) {
        const lastRead = readMap[ticketId];
        let query = supabase
          .from("ticket_messages")
          .select("id", { count: "exact", head: true })
          .eq("ticket_id", ticketId)
          .neq("sender_id", user!.id);

        if (lastRead) {
          query = query.gt("created_at", lastRead);
        }
        // If no read status exists, all messages from others are unread

        const { count, error } = await query;
        if (error) throw error;
        totalUnread += count || 0;
      }

      return totalUnread;
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
