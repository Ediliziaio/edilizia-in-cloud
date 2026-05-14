import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { withClientTimeout } from "@/lib/query-timeout";

interface UseUnreadSupportCountOptions {
  enabled?: boolean;
}

export function useUnreadSupportCount(options: UseUnreadSupportCountOptions = {}) {
  const enabled = options.enabled ?? true;
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [unreadCount, setUnreadCount] = useState(0);

  const storageKey = companyId ? `support_last_read_${companyId}` : null;

  const getLastRead = useCallback(() => {
    if (!storageKey) return new Date(0).toISOString();
    try {
      return localStorage.getItem(storageKey) || new Date(0).toISOString();
    } catch {
      // Safari Private Browsing può lanciare SecurityError
      return new Date(0).toISOString();
    }
  }, [storageKey]);

  const fetchCount = useCallback(async () => {
    if (!companyId || !enabled) return;
    const lastRead = getLastRead();
    try {
      const { count } = await withClientTimeout(
        supabase
          .from("support_messages")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("sender_role", "super_admin")
          .gt("created_at", lastRead),
        "Conteggio assistenza non letta",
        8_000,
      );
      setUnreadCount(count ?? 0);
    } catch {
      // Il badge assistenza non deve mai bloccare o sporcare il layout.
      setUnreadCount(0);
    }
  }, [companyId, enabled, getLastRead]);

  useEffect(() => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    fetchCount();
  }, [enabled, fetchCount]);

  // Realtime subscription
  useEffect(() => {
    if (!companyId || !enabled) return;

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
  }, [companyId, enabled]);

  const markAsRead = useCallback(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, new Date().toISOString());
      } catch {
        // Safari Private Browsing — ignora errore di storage
      }
      setUnreadCount(0);
    }
  }, [storageKey]);

  return { unreadCount, markAsRead };
}
