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

    // 1. Get all company tickets with their last_message_at
    const { data: tickets, error: ticketsErr } = await supabase
      .from("tickets")
      .select("id, last_message_at")
      .eq("company_id", companyId);

    if (ticketsErr || !tickets || batch !== fetchRef.current) return;

    // 2. Get user's read statuses in a single query
    const { data: readStatuses } = await supabase
      .from("ticket_read_status")
      .select("ticket_id, last_read_at")
      .eq("user_id", userId);

    const readMap = new Map<string, string>();
    readStatuses?.forEach((rs) => readMap.set(rs.ticket_id, rs.last_read_at));

    // 3. Filter tickets that potentially have unread messages
    const ticketsToCheck = tickets.filter((t) => {
      if (!t.last_message_at) return false;
      const lastRead = readMap.get(t.id);
      return !lastRead || t.last_message_at > lastRead;
    });

    if (ticketsToCheck.length === 0) {
      setUnreadByTicket({});
      return;
    }

    // 4. Single aggregated query: count unread messages per ticket
    // We fetch all messages for candidate tickets after the earliest last_read_at, then count client-side
    const ticketIds = ticketsToCheck.map((t) => t.id);
    const earliestRead = ticketsToCheck.reduce((min, t) => {
      const lr = readMap.get(t.id) || new Date(0).toISOString();
      return lr < min ? lr : min;
    }, new Date().toISOString());

    const { data: msgs, error: msgsErr } = await supabase
      .from("ticket_messages")
      .select("ticket_id, created_at")
      .in("ticket_id", ticketIds)
      .gt("created_at", earliestRead);

    if (msgsErr || batch !== fetchRef.current) return;

    const counts: Record<string, number> = {};
    (msgs || []).forEach((m) => {
      const lastRead = readMap.get(m.ticket_id) || new Date(0).toISOString();
      if (m.created_at > lastRead) {
        counts[m.ticket_id] = (counts[m.ticket_id] || 0) + 1;
      }
    });

    if (batch === fetchRef.current) setUnreadByTicket(counts);
  }, [companyId, userId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Realtime: listen for new ticket_messages
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
