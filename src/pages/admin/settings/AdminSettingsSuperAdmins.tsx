import SuperAdminUsersTab from "@/components/admin/settings/SuperAdminUsersTab";

export default function AdminSettingsSuperAdmins() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin</h1>
        <p className="text-muted-foreground">Gestisci gli utenti amministratori della piattaforma</p>
      </div>
      <SuperAdminUsersTab />
    </div>
  );
}
