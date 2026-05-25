/**
 * Pagina unificata "Persone & Accessi"
 *
 * 6 tab:
 *  1. Utenti & Accessi  — gestione accessi, ruoli, permessi, sicurezza
 *  2. Sicurezza accessi — governance, rischi, 2FA, multi-azienda
 *  3. Dipendenti        — operai + staff interno, stipendi, rapportini, ferie
 *  4. Subappaltatori    — squadre esterne + accesso campo
 *  5. Venditori         — gestione venditori con provvigioni
 *  6. Team              — team con drag-and-drop
 */

import { useSearchParams } from "react-router-dom";
import { Shield, ShieldCheck, TrendingUp, Users, UsersRound, Loader2, Building2, Info, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersConfig } from "@/components/settings/UsersConfig";
import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";
import { SubappaltatoriTab } from "@/components/settings/SubappaltatoriTab";
import { AccessGovernancePanel } from "@/components/settings/AccessGovernancePanel";
import { PermissionTemplatesManager } from "@/components/settings/PermissionTemplatesManager";
import Employees from "@/pages/azienda/Employees";
import SettingsTeams from "@/pages/azienda/settings/SettingsTeams";
import { usePermissions } from "@/hooks/usePermissions";

type PeopleTab = "utenti" | "sicurezza-accessi" | "template-permessi" | "dipendenti" | "subappaltatori" | "venditori" | "team";

const VALID_TABS: PeopleTab[] = ["utenti", "sicurezza-accessi", "template-permessi", "dipendenti", "subappaltatori", "venditori", "team"];

function isValidTab(tab: string | null): tab is PeopleTab {
  return VALID_TABS.includes(tab as PeopleTab);
}

export default function SettingsPeople() {
  const [searchParams, setSearchParams] = useSearchParams();
  const permissions = usePermissions();

  const isAdmin = permissions.isAdmin;
  const canViewUsers = isAdmin || permissions.canViewUsers;
  const canViewPeople = isAdmin || permissions.canViewSettingsPeople;
  const canViewAccessSecurity = canViewUsers || permissions.canViewSettingsSecurity;
  const canManagePermissionTemplates = isAdmin || permissions.canEditSettingsPeople;

  if (permissions.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento permessi...
      </div>
    );
  }

  if (!canViewUsers && !canViewPeople && !canViewAccessSecurity) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <p className="text-sm text-muted-foreground">Non hai accesso a questa sezione.</p>
      </div>
    );
  }

  // Retrocompatibilità: mappa vecchi nomi tab ai nuovi
  const tabParam = searchParams.get("tab");
  const fallbackTab = (): PeopleTab => {
    if (canViewUsers) return "utenti";
    if (canViewAccessSecurity) return "sicurezza-accessi";
    if (canManagePermissionTemplates) return "template-permessi";
    if (canViewPeople) return "dipendenti";
    return "dipendenti";
  };

  const resolveDefaultTab = (): PeopleTab => {
    if (tabParam === "staff" || tabParam === "operai") return "dipendenti";
    if (tabParam === "sicurezza" || tabParam === "accessi") return "sicurezza-accessi";
    if (tabParam === "templates" || tabParam === "template") return canManagePermissionTemplates ? "template-permessi" : fallbackTab();
    if (isValidTab(tabParam)) {
      if ((tabParam === "utenti" && canViewUsers) || (tabParam === "sicurezza-accessi" && canViewAccessSecurity)) {
        return tabParam;
      }
      if (tabParam === "template-permessi" && canManagePermissionTemplates) {
        return tabParam;
      }
      if (["dipendenti", "subappaltatori", "venditori", "team"].includes(tabParam) && canViewPeople) {
        return tabParam;
      }
    }
    return fallbackTab();
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="flex flex-nowrap h-auto gap-1 p-1 w-full sm:w-auto justify-start overflow-x-auto scrollbar-none">
        {canViewUsers && (
          <TabsTrigger value="utenti" className="gap-1.5 shrink-0">
            <Shield className="h-4 w-4" />
            Utenti & Accessi
          </TabsTrigger>
        )}
        {canViewAccessSecurity && (
          <TabsTrigger value="sicurezza-accessi" className="gap-1.5 shrink-0">
            <ShieldCheck className="h-4 w-4" />
            Sicurezza accessi
          </TabsTrigger>
        )}
        {canManagePermissionTemplates && (
          <TabsTrigger value="template-permessi" className="gap-1.5 shrink-0">
            <FileText className="h-4 w-4" />
            Template permessi
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="dipendenti" className="gap-1.5 shrink-0">
            <Users className="h-4 w-4" />
            Dipendenti
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="subappaltatori" className="gap-1.5 shrink-0">
            <Building2 className="h-4 w-4" />
            Subappaltatori
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="venditori" className="gap-1.5 shrink-0">
            <TrendingUp className="h-4 w-4" />
            Venditori
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="team" className="gap-1.5 shrink-0">
            <UsersRound className="h-4 w-4" />
            Team
          </TabsTrigger>
        )}
      </TabsList>

      {canViewUsers && (
        <TabsContent value="utenti">
          {/* Info multi-ruolo */}
          <div className="flex items-start gap-3 p-3 mb-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50">
            <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="text-sm space-y-0.5">
              <p className="font-medium">
                Un utente può avere più ruoli contemporaneamente
              </p>
              <p className="text-xs text-muted-foreground">
                Se un impiegato d'ufficio si occupa <strong>anche</strong> di vendita,
                dal menu <strong>⋮</strong> sulla riga utente scegli{" "}
                <em>"Aggiungi ruolo Venditore"</em>: comparirà nel calendario CRM,
                nei dropdown venditori e nelle provvigioni.
              </p>
            </div>
          </div>
          <UsersConfig />
        </TabsContent>
      )}

      {canViewAccessSecurity && (
        <TabsContent value="sicurezza-accessi">
          <AccessGovernancePanel />
        </TabsContent>
      )}

      {canManagePermissionTemplates && (
        <TabsContent value="template-permessi">
          <PermissionTemplatesManager />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="dipendenti">
          <Employees />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="subappaltatori">
          <SubappaltatoriTab />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="venditori">
          <SalespeopleConfig />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="team">
          <SettingsTeams />
        </TabsContent>
      )}
    </Tabs>
  );
}
