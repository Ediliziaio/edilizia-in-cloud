/**
 * IMP4 — Pagina unificata "Sicurezza & Privacy"
 *
 * Riunisce Privacy & GDPR, Security dashboard e Registro attività.
 * Password e 2FA personale vivono in /azienda/impostazioni/mio-profilo?tab=sicurezza.
 * Il tab attivo è mantenuto nel query param ?tab=privacy|dashboard|attivita.
 *
 * Le 4 route precedenti reindirizzano qui via <Navigate> in companyRoutes.tsx.
 */

import { useSearchParams } from "react-router-dom";
import { Shield, Activity, ScrollText, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import SettingsPrivacy from "@/pages/azienda/settings/SettingsPrivacy";
import SettingsSecurityDashboard from "@/pages/azienda/settings/SettingsSecurityDashboard";
import SettingsActivityLog from "@/pages/azienda/settings/SettingsActivityLog";

type SecurityTab = "privacy" | "dashboard" | "attivita";
const VALID_TABS: SecurityTab[] = ["privacy", "dashboard", "attivita"];

function isValidTab(tab: string | null): tab is SecurityTab {
  return VALID_TABS.includes(tab as SecurityTab);
}

export default function SettingsSecurityHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const permissions = usePermissions();

  const isAdmin = role === "company_admin" || role === "super_admin";
  const canViewPrivacy = isAdmin || permissions.canViewSettingsSecurity;

  if (permissions.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento...
      </div>
    );
  }

  const tabParam = searchParams.get("tab");
  const resolveDefaultTab = (): SecurityTab => {
    if (isValidTab(tabParam)) {
      if ((tabParam === "dashboard" || tabParam === "attivita") && !isAdmin) return "privacy";
      return tabParam;
    }
    return "privacy";
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      {/* v8.6.71 — mobile: scroll orizzontale invece di compressione (4 tab
          con label lunghe sovrapponevano: Privacy & GDPR /
          Security dashboard / Registro attività). */}
      <TabsList className="mb-6 w-full sm:w-auto h-auto flex-wrap justify-start gap-1 overflow-x-auto sm:overflow-visible sm:flex-nowrap">
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
