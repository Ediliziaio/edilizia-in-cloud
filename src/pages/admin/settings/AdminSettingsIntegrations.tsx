import AdminSettingsIntegrations from "@/components/admin/settings/AdminSettingsIntegrations";

export default function AdminSettingsIntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrazioni</h1>
        <p className="text-muted-foreground max-sm:hidden">Credenziali dei servizi esterni, divise per tema: pagamenti, Meta e WhatsApp, Google</p>
      </div>
      <AdminSettingsIntegrations />
    </div>
  );
}
