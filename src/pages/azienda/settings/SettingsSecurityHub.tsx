/**
 * IMP4 — Pagina unificata "Sicurezza & Privacy"
 *
 * Riunisce Cambio password, Privacy & GDPR, Security dashboard e
 * Registro attività in un'unica pagina con 4 tab.
 * Il tab attivo è mantenuto nel query param ?tab=password|privacy|dashboard|attivita.
 *
 * Le 4 route precedenti reindirizzano qui via <Navigate> in companyRoutes.tsx.
 */

import { useSearchParams } from "react-router-dom";
import { Key, Shield, Activity, ScrollText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import SettingsSecurity from "@/pages/azienda/settings/SettingsSecurity";
import SettingsPrivacy from "@/pages/azienda/settings/SettingsPrivacy";
import SettingsSecurityDashboard from "@/pages/azienda/settings/SettingsSecurityDashboard";
import SettingsActivityLog from "@/pages/azienda/settings/SettingsActivityLog";

type SecurityTab = "password" | "privacy" | "dashboard" | "attivita";
const VALID_TABS: SecurityTab[] = ["password", "privacy", "dashboard", "attivita"];

function isValidTab(tab: string | null): tab is SecurityTab {
  return VALID_TABS.includes(tab as SecurityTab);
}

export default function SettingsSecurityHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const permissions = usePermissions();

  const isAdmin = role === "company_admin" || role === "super_admin";
  const canViewPrivacy = isAdmin || permissions.canViewSettingsSecurity;

  const tabParam = searchParams.get("tab");
  const resolveDefaultTab = (): SecurityTab => {
    if (isValidTab(tabParam)) return tabParam;
    return "password"; // sempre accessibile
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 w-full sm:w-auto">
        <TabsTrigger value="password" className="flex items-center gap-2">
          <Key className="h-4 w-4" />
          <span>Password</span>
        </TabsTrigger>

        {canViewPrivacy && (
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span>Privacy & GDPR</span>
          </TabsTrigger>
        )}

        {isAdmin && (
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span>Security dashboard</span>
          </TabsTrigger>
        )}

        {isAdmin && (
          <TabsTrigger value="attivita" className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            <span>Registro attività</span>
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="password">
        <SettingsSecurity />
      </TabsContent>

      {canViewPrivacy && (
        <TabsContent value="privacy">
          <SettingsPrivacy />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="dashboard">
          <SettingsSecurityDashboard />
        </TabsContent>
      )}

      {isAdmin && (
        <TabsContent value="attivita">
          <SettingsActivityLog />
        </TabsContent>
      )}
    </Tabs>
  );
}
