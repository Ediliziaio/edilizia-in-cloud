import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface UnreadCounts {
  unreadByTicket: Record<string, number>;
  totalUnread: number;
  markTicketAsRead: (ticketId: string) => Promise<void>;
  refetch: () => void;
}

export function useUnreadTicketCounts(): UnreadCounts {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const userId = user?.id;
  const [unreadByTicket, setUnreadByTicket] = useState<Record<string, number>>({});
  const fetchRef = useRef(0);

  const fetchCounts = useCallback(async () => {
    if (!companyId || !userId) return;
    const batch = ++fetchRef.current;

    // Get all ticket IDs for this company
    const { data: tickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select("id, last_message_at")
      .eq("company_id", companyId);

    if (ticketsErr || !tickets || batch !== fetchRef.current) return;

    // Get user's read statuses
    const { data: readStatuses } = await supabase
      .from("ticket_read_status")
      .select("ticket_id, last_read_at")
      .eq("user_id", userId);

    const readMap = new Map<string, string>();
    readStatuses?.forEach((rs) => readMap.set(rs.ticket_id, rs.last_read_at));

    // For tickets with messages after last_read, count unread
    const ticketsToCheck = tickets.filter((t) => {
      if (!t.last_message_at) return false;
      const lastRead = readMap.get(t.id);
      return !lastRead || t.last_message_at > lastRead;
    });

    if (ticketsToCheck.length === 0) {
      setUnreadByTicket({});
      return;
    }

    const counts: Record<string, number> = {};

    // Batch count unread messages per ticket
    await Promise.all(
      ticketsToCheck.map(async (t) => {
        const lastRead = readMap.get(t.id) || new Date(0).toISOString();
        const { count } = await supabase
          .from("ticket_messages")
          .select("*", { count: "exact", head: true })
          .eq("ticket_id", t.id)
          .gt("created_at", lastRead);
        if (count && count > 0) counts[t.id] = count;
      })
    );

    if (batch === fetchRef.current) setUnreadByTicket(counts);
  }, [companyId, userId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Realtime: listen for new ticket_messages on company tickets
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel("unread-ticket-msgs-" + companyId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
        },
        (payload) => {
          const msg = payload.new as { ticket_id: string; sender_id: string };
          // If the sender is NOT the current user, increment count
          if (msg.sender_id !== userId) {
            setUnreadByTicket((prev) => ({
              ...prev,
              [msg.ticket_id]: (prev[msg.ticket_id] || 0) + 1,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, userId]);

  const markTicketAsRead = useCallback(
    async (ticketId: string) => {
      if (!userId) return;
      await supabase
        .from("ticket_read_status")
        .upsert(
          { ticket_id: ticketId, user_id: userId, last_read_at: new Date().toISOString() },
          { onConflict: "ticket_id,user_id" }
        );
      setUnreadByTicket((prev) => {
        const next = { ...prev };
        delete next[ticketId];
        return next;
      });
    },
    [userId]
  );

  const totalUnread = Object.values(unreadByTicket).reduce((a, b) => a + b, 0);

  return { unreadByTicket, totalUnread, markTicketAsRead, refetch: fetchCounts };
}
