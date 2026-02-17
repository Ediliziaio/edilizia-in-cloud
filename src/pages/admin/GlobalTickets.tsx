import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

export default function GlobalTickets() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_manage_tickets) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assistenza Aziende</h1>
        <p className="text-muted-foreground">
          Gestisci le richieste di supporto diretto dalle aziende
        </p>
      </div>
      <AdminSupportChatList />
    </div>
  );
}
