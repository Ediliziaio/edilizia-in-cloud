import { lazy } from "react";

const EmailSettingsTab = lazy(() => import("@/components/admin/settings/EmailSettingsTab"));

export default function AdminSettingsEmail() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email</h1>
        <p className="text-muted-foreground">Configura i provider email, prezzi e monitora le performance</p>
      </div>
      <EmailSettingsTab />
    </div>
  );
}
