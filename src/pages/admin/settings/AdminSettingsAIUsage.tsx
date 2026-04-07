import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AIUsageMonitor } from "@/components/admin/settings/AIUsageMonitor";

export default function AdminSettingsAIUsage() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_view_platform_stats) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitor Utilizzo AI</h1>
        <p className="text-muted-foreground">
          Costi e richieste AI per azienda. Monitora e previeni abusi.
        </p>
      </div>
      <AIUsageMonitor />
    </div>
  );
}
