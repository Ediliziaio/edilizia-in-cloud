import AdminSettingsIntegrations from "@/components/admin/settings/AdminSettingsIntegrations";

export default function AdminSettingsIntegrationsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Integrazioni</h1>
        <p className="text-sm text-muted-foreground max-sm:hidden">Quello che colleghi da qui: assistenti AI e pagine social dei brand</p>
      </div>
      <AdminSettingsIntegrations />
    </div>
  );
}
