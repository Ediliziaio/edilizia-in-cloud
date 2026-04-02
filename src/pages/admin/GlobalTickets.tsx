import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

export default function GlobalTickets() {
  const { permissions } = useSuperAdminPermissions();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["admin-support-unread-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("sender_role", "company")
        .is("read_at", null);
      return count || 0;
    },
    refetchInterval: 30000,
    enabled: permissions.can_manage_tickets,
  });

  if (!permissions.can_manage_tickets) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Assistenza Aziende</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount} non {unreadCount === 1 ? "letto" : "letti"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Gestisci le richieste di supporto diretto dalle aziende
          </p>
        </div>
      </div>
      <AdminSupportChatList />
    </div>
  );
}
