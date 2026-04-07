import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { WebhookAlertsPanel } from "@/components/admin/settings/WebhookAlertsPanel";

export default function AdminSettingsWebhookLogs() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_manage_admins) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhook Log</h1>
        <p className="text-muted-foreground">
          Monitora i webhook in entrata da GoCardless, Stripe e Telnyx. Ritenta i falliti.
        </p>
      </div>
      <WebhookAlertsPanel />
    </div>
  );
}
