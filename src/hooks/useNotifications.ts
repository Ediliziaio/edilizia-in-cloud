import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

export interface Notification {
  id: string;
  company_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export function useNotifications() {
  const { profile, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const userId = profile?.id;

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: queryKeys.notifications.list(companyId, userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, company_id, user_id, type, title, body, entity_type, entity_id, action_url, is_read, is_dismissed, created_at")
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!companyId && !!userId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!companyId || !userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          queryClient.setQueryData<Notification[]>(
            queryKeys.notifications.list(companyId, userId),
            (old = []) => [newNotif, ...old]
          );

          // Show toast + play sound for new notifications
          toast(newNotif.title, {
            description: newNotif.body ?? undefined,
            action: newNotif.action_url
              ? { label: "Vai →", onClick: () => { window.location.href = newNotif.action_url!; } }
              : undefined,
            duration: 5000,
          });
          playNotificationSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, userId, queryClient]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onMutate: async (id) => {
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.list(companyId, userId),
        (old = []) => old.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    },
    onError: () => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(companyId, userId) });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("mark_all_notifications_read", {
        p_company_id: companyId!,
      });
      if (error) throw error;
    },
    onMutate: async () => {
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.list(companyId, userId),
        (old = []) => old.map((n) => ({ ...n, is_read: true }))
      );
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(companyId, userId) });
      toast.error("Errore", { description: "Impossibile segnare tutte le notifiche come lette." });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_dismissed: true })
        .eq("id", id)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onMutate: async (id) => {
      queryClient.setQueryData<Notification[]>(
        queryKeys.notifications.list(companyId, userId),
        (old = []) => old.filter((n) => n.id !== id)
      );
    },
    onError: () => {
      // Revert optimistic update on error
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(companyId, userId) });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    dismiss: dismiss.mutate,
  };
}
