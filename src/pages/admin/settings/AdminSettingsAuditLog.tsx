import AuditLogTab from "@/components/admin/settings/AuditLogTab";

export default function AdminSettingsAuditLog() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Registro Attività</h1>
        <p className="text-muted-foreground">Consulta lo storico delle azioni degli amministratori</p>
      </div>
      <AuditLogTab />
    </div>
  );
}
