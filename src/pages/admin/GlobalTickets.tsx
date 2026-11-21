import { AdminSupportChatList } from "@/components/admin/support/AdminSupportChatList";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

export default function GlobalTickets() {
  const { permissions } = useSuperAdminPermissions();
  return permissions.can_manage_tickets ? <AdminSupportChatList /> : <AccessDenied />;
}
