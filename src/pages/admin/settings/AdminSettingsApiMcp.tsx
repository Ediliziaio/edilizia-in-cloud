import AdminApiMcpPanel from "@/components/admin/settings/AdminApiMcpPanel";

export default function AdminSettingsApiMcpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API & MCP</h1>
        <p className="text-muted-foreground">
          Collega Claude e altri strumenti AI direttamente alla piattaforma con chiavi emesse da qui — senza token esterni
        </p>
      </div>
      <AdminApiMcpPanel />
    </div>
  );
}
