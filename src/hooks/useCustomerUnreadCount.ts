import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";

export function useCustomerUnreadCount() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.customerUnread.messages(user?.id),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("customer_messages")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user!.id)
        .eq("sender_role", "staff")
        .is("read_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id,
    staleTime: 30 * 1000,
  });

  // Realtime subscription for new messages
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("customer-messages-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_messages",
          filter: `customer_id=eq.${user.id}`,
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
