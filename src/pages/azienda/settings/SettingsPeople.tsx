/**
 * Pagina unificata "Persone & Accessi"
 *
 * 5 tab:
 *  1. Utenti & Accessi  — gestione accessi, ruoli, permessi, sicurezza
 *  2. Dipendenti        — operai + staff interno, stipendi, rapportini, ferie
 *  3. Subappaltatori    — squadre esterne + accesso campo
 *  4. Venditori         — gestione venditori con provvigioni
 *  5. Team              — team con drag-and-drop
 */

import { useSearchParams } from "react-router-dom";
import { Shield, TrendingUp, Users, UsersRound, Loader2, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersConfig } from "@/components/settings/UsersConfig";
import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";
import { SubappaltatoriTab } from "@/components/settings/SubappaltatoriTab";
import Employees from "@/pages/azienda/Employees";
import SettingsTeams from "@/pages/azienda/settings/SettingsTeams";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

type PeopleTab = "utenti" | "dipendenti" | "subappaltatori" | "venditori" | "team";

const VALID_TABS: PeopleTab[] = ["utenti", "dipendenti", "subappaltatori", "venditori", "team"];

function isValidTab(tab: string | null): tab is PeopleTab {
  return VALID_TABS.includes(tab as PeopleTab);
}

export default function SettingsPeople() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useAuth();
  const permissions = usePermissions();

  const isAdmin = role === "company_admin" || role === "super_admin";
  const canViewUsers = isAdmin || permissions.canViewUsers;
  const canViewPeople = isAdmin || permissions.canViewSettingsPeople;

  if (permissions.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento permessi...
      </div>
    );
  }

  if (!canViewUsers && !canViewPeople) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
        <p className="text-sm text-muted-foreground">Non hai accesso a questa sezione.</p>
      </div>
    );
  }

  // Retrocompatibilità: mappa vecchi nomi tab ai nuovi
  const tabParam = searchParams.get("tab");
  const resolveDefaultTab = (): PeopleTab => {
    if (tabParam === "staff" || tabParam === "operai") return "dipendenti";
    if (isValidTab(tabParam)) return tabParam;
    if (canViewUsers) return "utenti";
    if (canViewPeople) return "dipendenti";
    return "dipendenti";
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
          <UsersConfig />
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
