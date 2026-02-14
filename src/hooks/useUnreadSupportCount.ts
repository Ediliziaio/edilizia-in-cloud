import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadSupportCount() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const storageKey = companyId ? `support_last_read_${companyId}` : null;

  const getLastRead = useCallback(() => {
    if (!storageKey) return new Date(0).toISOString();
    return localStorage.getItem(storageKey) || new Date(0).toISOString();
  }, [storageKey]);

  const fetchCount = useCallback(async () => {
    if (!companyId) return;
    const lastRead = getLastRead();
    const { count } = await supabase
      .from("support_messages")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("sender_role", "super_admin")
      .gt("created_at", lastRead);
    setUnreadCount(count ?? 0);
  }, [companyId, getLastRead]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId) return;

    const channel = supabase
      .channel("unread-support-" + companyId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const msg = payload.new as { sender_role: string };
          if (msg.sender_role === "super_admin") {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const markAsRead = useCallback(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, new Date().toISOString());
      setUnreadCount(0);
    }
  }, [storageKey]);

  return { unreadCount, markAsRead };
}
