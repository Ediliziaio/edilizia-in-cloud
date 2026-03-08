import NotificationsTab from "@/components/admin/settings/NotificationsTab";

export default function AdminSettingsNotifications() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notifiche</h1>
        <p className="text-muted-foreground">Configura le tue preferenze di notifica</p>
      </div>
      <NotificationsTab />
    </div>
  );
}
