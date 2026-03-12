import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface AdminSession {
  id: string;
  deviceHint: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export function useAdminSessions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["admin-sessions", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminSession[]> => {
      const { data, error } = await supabase
        .from("admin_sessions")
        .select("*")
        .eq("user_id", user!.id)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;

      // Determine current session by matching the token stored in this tab
      const currentToken = sessionStorage.getItem("admin_session_token");

      return (data ?? []).map((row: any) => ({
        id: row.id,
        deviceHint: row.device_hint,
        ipAddress: row.ip_address,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
        isCurrent: currentToken ? row.session_token === currentToken : false,
      }));
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("admin_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sessions"] });
      toast.success("Sessione revocata");
    },
    onError: (err: any) =>
      toast.error("Errore revoca sessione", { description: err.message }),
  });
}
