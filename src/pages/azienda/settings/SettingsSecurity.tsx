import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { CompanySecuritySettings } from "@/components/settings/CompanySecuritySettings";
import { PermissionTemplatesManager } from "@/components/settings/PermissionTemplatesManager";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { useAuth } from "@/contexts/AuthContext";
import { Key, Shield, FileText, Smartphone } from "lucide-react";

export default function SettingsSecurity() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <ChangePasswordForm />
        <TwoFactorSetup />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="password">
        <TabsList>
          <TabsTrigger value="password" className="gap-1.5">
            <Key className="h-3.5 w-3.5" /> Password
          </TabsTrigger>
          <TabsTrigger value="2fa" className="gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> 2FA
          </TabsTrigger>
          <TabsTrigger value="policies" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Policy Sicurezza
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Template Permessi
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <ChangePasswordForm />
        </TabsContent>
        <TabsContent value="2fa">
          <TwoFactorSetup />
        </TabsContent>
        <TabsContent value="policies">
          <CompanySecuritySettings />
        </TabsContent>
        <TabsContent value="templates">
          <PermissionTemplatesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
