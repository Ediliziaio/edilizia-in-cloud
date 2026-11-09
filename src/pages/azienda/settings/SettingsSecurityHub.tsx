/**
 * IMP4 — Pagina unificata "Sicurezza & Privacy"
 *
 * Accessi, registro attività, regole aziendali e privacy.
 * Password e verifica in due passaggi personali rimangono nel profilo;
 * le regole dell'azienda sono nella scheda amministrativa «regole».
 * Il vecchio profilo mantiene un collegamento, senza duplicare il modulo.
 * La scheda attiva è nell'indirizzo: ?tab=dashboard|attivita|privacy (gli
 * identificativi non cambiano: i rimandi e la ricerca li usano).
 * L'amministratore apre «Accessi», chi non lo è «Privacy».
 *
 * Le 4 route precedenti reindirizzano qui via <Navigate> in companyRoutes.tsx.
 */

import { useSearchParams, Link } from "react-router-dom";
import { Shield, Activity, ScrollText, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { CompanySecuritySettings } from "@/components/settings/CompanySecuritySettings";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";
import SettingsPrivacy from "@/pages/azienda/settings/SettingsPrivacy";
import SettingsSecurityDashboard from "@/pages/azienda/settings/SettingsSecurityDashboard";
import SettingsActivityLog from "@/pages/azienda/settings/SettingsActivityLog";

type SecurityTab = "privacy" | "dashboard" | "attivita" | "regole";
const VALID_TABS: SecurityTab[] = ["privacy", "dashboard", "attivita", "regole"];

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
      if ((tabParam === "dashboard" || tabParam === "attivita" || tabParam === "regole") && (!isAdmin || isMobile)) return "privacy";
      return tabParam;
    }
    // L'amministratore apre ciò che gli serve di più; gli altri hanno solo la Privacy.
    return isAdmin && !isMobile ? "dashboard" : "privacy";
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    if (!confermaNavigazioneImpostazioni()) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <p className="mb-4 text-sm text-muted-foreground">
        Le regole qui riguardano l’azienda. Password e verifica in due passaggi sono in{" "}
        <Link to="/azienda/impostazioni/mio-profilo?tab=sicurezza" className="font-medium text-primary underline underline-offset-4">Sicurezza personale</Link>.
      </p>
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

        {isAdmin && !isMobile && (
          <TabsTrigger value="regole" className="gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" />Regole aziendali
          </TabsTrigger>
        )}

        {canViewPrivacy && (
          <TabsTrigger value="privacy" className="flex items-center gap-2">
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span>Privacy</span>
          </TabsTrigger>
        )}
      </TabsList>

      {isAdmin && !isMobile && (
        <TabsContent value="regole"><CompanySecuritySettings /></TabsContent>
      )}

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
