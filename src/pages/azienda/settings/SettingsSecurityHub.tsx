/**
 * IMP4 — Pagina unificata "Sicurezza & Privacy"
 *
 * Tre schede: Accessi (chi è collegato, tentativi, azioni sugli utenti),
 * Registro attività e Privacy. Password e verifica in due passaggi personali
 * vivono in /azienda/impostazioni/mio-profilo?tab=sicurezza, lì anche le
 * regole di sicurezza dell'azienda (blocco dopo password sbagliate, IP).
 * La scheda attiva è nell'indirizzo: ?tab=dashboard|attivita|privacy (gli
 * identificativi non cambiano: i rimandi e la ricerca li usano).
 * L'amministratore apre «Accessi», chi non lo è «Privacy».
 *
 * Le 4 route precedenti reindirizzano qui via <Navigate> in companyRoutes.tsx.
 */

import { useSearchParams } from "react-router-dom";
import { Shield, Activity, ScrollText, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
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
  // Mobile: solo privacy e consensi; cruscotto sicurezza e registro attività
  // sono analisi da computer.
  const isMobile = useIsMobile();

  const isAdmin = role === "company_admin" || role === "super_admin";
  const canViewPrivacy = isAdmin || permissions.canViewSettingsSecurity;

  if (permissions.isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento…
      </div>
    );
  }

  const tabParam = searchParams.get("tab");
  const resolveDefaultTab = (): SecurityTab => {
    if (isValidTab(tabParam)) {
      if ((tabParam === "dashboard" || tabParam === "attivita") && (!isAdmin || isMobile)) return "privacy";
      return tabParam;
    }
    // L'amministratore apre ciò che gli serve di più; gli altri hanno solo la Privacy.
    return isAdmin && !isMobile ? "dashboard" : "privacy";
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 w-full sm:w-auto h-auto flex-wrap justify-start gap-1 overflow-x-auto sm:overflow-visible sm:flex-nowrap max-sm:hidden">
        {isAdmin && (
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <span>Accessi</span>
          </TabsTrigger>
        )}

        {isAdmin && (
          <TabsTrigger value="attivita" className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            <span>Registro attività</span>
          </TabsTrigger>
        )}

        {canViewPrivacy && (
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span>Privacy</span>
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
