/**
 * IMP3 — Pagina unificata "Persone & Accessi"
 *
 * Riunisce Utenti, Venditori, Staff e Team in un'unica pagina con 4 tab.
 * Il tab attivo è mantenuto nel query param `?tab=utenti|venditori|staff|team`.
 *
 * Le 4 route precedenti (/utenti, /venditori, /staff, /team) ora reindirizzano
 * qui via <Navigate> in companyRoutes.tsx.
 */

import { useSearchParams } from "react-router-dom";
import { Users, UserCheck, HardHat, UsersRound, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersConfig } from "@/components/settings/UsersConfig";
import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";
import Employees from "@/pages/azienda/Employees";
import SettingsTeams from "@/pages/azienda/settings/SettingsTeams";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";

type PeopleTab = "utenti" | "venditori" | "staff" | "team";

const VALID_TABS: PeopleTab[] = ["utenti", "venditori", "staff", "team"];

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

  // Determina il tab attivo dall'URL, con fallback al primo tab accessibile
  const tabParam = searchParams.get("tab");
  const resolveDefaultTab = (): PeopleTab => {
    if (isValidTab(tabParam)) return tabParam;
    if (canViewUsers) return "utenti";
    if (canViewPeople) return "venditori";
    return "staff";
  };

  const activeTab = resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="mb-6 w-full sm:w-auto">
        {canViewUsers && (
          <TabsTrigger value="utenti" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span>Utenti</span>
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="venditori" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <span>Venditori</span>
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <HardHat className="h-4 w-4" />
            <span>Staff / Operai</span>
          </TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="team" className="flex items-center gap-2">
            <UsersRound className="h-4 w-4" />
            <span>Team</span>
          </TabsTrigger>
        )}
      </TabsList>

      {canViewUsers && (
        <TabsContent value="utenti">
          <UsersConfig />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="venditori">
          <SalespeopleConfig />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="staff">
          <Employees />
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
