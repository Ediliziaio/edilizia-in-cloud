import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

export default function GlobalTickets() {
  const { permissions } = useSuperAdminPermissions();

  const { data: unansweredCount = 0 } = useQuery({
    queryKey: ["admin-support-unanswered-count"],
    queryFn: async () => {
      // Filtra solo conversazioni non chiuse (le chiuse non contano mai e
      // possono essere migliaia su sistema maturo). Limite di sicurezza.
      const [messagesRes, conversationsRes] = await Promise.all([
        supabase
          .from("support_messages")
          .select("company_id, sender_role, created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("support_conversations")
          .select("company_id, status")
          .in("status", ["open", "in_progress", "pending"])
          .limit(500),
      ]);
      if (messagesRes.error) throw messagesRes.error;
      if (conversationsRes.error) throw conversationsRes.error;

      const statusByCompany = new Map(
        (conversationsRes.data ?? []).map((conversation) => [conversation.company_id, conversation.status])
      );
      const latestByCompany = new Map<string, { sender_role: string }>();
      for (const message of messagesRes.data ?? []) {
        if (!latestByCompany.has(message.company_id)) {
          latestByCompany.set(message.company_id, { sender_role: message.sender_role });
        }
      }

      return Array.from(latestByCompany.entries()).filter(([companyId, message]) => {
        const status = statusByCompany.get(companyId);
        if (!status) return false; // conversazione chiusa o inesistente → non contare
        return message.sender_role !== "super_admin";
      }).length;
    },
    // 60s invece di 30s: riduce load su piattaforma con molti admin connessi
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    enabled: permissions.can_manage_tickets,
  });

  if (!permissions.can_manage_tickets) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header compatto mobile + pieno desktop — badge "da rispondere"
          visibile in entrambe le viste */}
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg md:text-2xl font-bold">Assistenza Aziende</h1>
            {unansweredCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unansweredCount} da rispondere
              </Badge>
            )}
          </div>
          <p className="hidden md:block text-muted-foreground text-sm mt-0.5">
            Gestisci le richieste di supporto diretto dalle aziende
          </p>
        </div>
      </div>
      <AdminSupportChatList />
    </div>
  );
}
