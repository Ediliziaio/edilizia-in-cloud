import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { BankingOverviewPanel } from "@/components/admin/settings/BankingOverviewPanel";

export default function AdminSettingsBankingOverview() {
  const { permissions } = useSuperAdminPermissions();
  if (!permissions.can_manage_admins) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vista Globale Banche</h1>
        <p className="text-muted-foreground">
          Stato delle connessioni Open Banking per tutte le aziende della piattaforma.
        </p>
      </div>
      <BankingOverviewPanel />
    </div>
  );
}
