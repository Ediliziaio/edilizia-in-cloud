import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, ShieldCheck, Server, Bell, ScrollText, Plug } from "lucide-react";
import ProfileTab from "@/components/admin/settings/ProfileTab";
import SuperAdminUsersTab from "@/components/admin/settings/SuperAdminUsersTab";
import PlatformInfoTab from "@/components/admin/settings/PlatformInfoTab";
import NotificationsTab from "@/components/admin/settings/NotificationsTab";
import AuditLogTab from "@/components/admin/settings/AuditLogTab";
import AdminSettingsIntegrations from "@/components/admin/settings/AdminSettingsIntegrations";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

export default function AdminSettings() {
  const { permissions } = useSuperAdminPermissions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci il tuo account e la piattaforma</p>
      </div>

      <Tabs defaultValue="profilo" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="profilo" className="gap-2"><User className="h-4 w-4" /> Profilo</TabsTrigger>
          {permissions.can_manage_admins && (
            <TabsTrigger value="admins" className="gap-2"><ShieldCheck className="h-4 w-4" /> Super Admin</TabsTrigger>
          )}
          <TabsTrigger value="piattaforma" className="gap-2"><Server className="h-4 w-4" /> Piattaforma</TabsTrigger>
          {permissions.can_manage_admins && (
            <TabsTrigger value="integrazioni" className="gap-2"><Plug className="h-4 w-4" /> Integrazioni</TabsTrigger>
          )}
          <TabsTrigger value="notifiche" className="gap-2"><Bell className="h-4 w-4" /> Notifiche</TabsTrigger>
          {permissions.can_manage_admins && (
            <TabsTrigger value="audit" className="gap-2"><ScrollText className="h-4 w-4" /> Registro Attività</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profilo"><ProfileTab /></TabsContent>
        {permissions.can_manage_admins && (
          <TabsContent value="admins"><SuperAdminUsersTab /></TabsContent>
        )}
        <TabsContent value="piattaforma"><PlatformInfoTab /></TabsContent>
        <TabsContent value="notifiche"><NotificationsTab /></TabsContent>
        {permissions.can_manage_admins && (
          <TabsContent value="audit"><AuditLogTab /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
