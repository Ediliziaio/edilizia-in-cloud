/**
 * Pagina unificata "Persone & Accessi"
 *
 * 7 tab:
 *  1. Utenti & Accessi  — gestione accessi, ruoli, permessi, sicurezza
 *  2. Sicurezza accessi — governance, rischi, 2FA, multi-azienda
 *  3. Template permessi — template assegnabili
 *  4. Dipendenti        — operai + staff interno, stipendi, rapportini, ferie
 *  5. Subappaltatori    — squadre esterne + accesso campo
 *  6. Venditori         — gestione venditori con provvigioni
 *  7. Team              — team con drag-and-drop
 *  8. Commercialista    — invito + deleghe accesso studio
 */

import { useSearchParams } from "react-router-dom";
import { Loader2, Info, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CompanyAccessManager } from "@/components/settings/CompanyAccessManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersConfig } from "@/components/settings/UsersConfig";
import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";
import { SubappaltatoriTab } from "@/components/settings/SubappaltatoriTab";
import { AccessGovernancePanel } from "@/components/settings/AccessGovernancePanel";
import { PermissionTemplatesManager } from "@/components/settings/PermissionTemplatesManager";
import { AccountantAccessTab } from "@/components/settings/AccountantAccessTab";
import { AccountantChangeRequestsQueue } from "@/components/settings/AccountantChangeRequestsQueue";
import Employees from "@/pages/azienda/Employees";
import SettingsTeams from "@/pages/azienda/settings/SettingsTeams";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";

type PeopleTab = "utenti" | "accessi-azienda" | "sicurezza-accessi" | "template-permessi" | "dipendenti" | "subappaltatori" | "venditori" | "team" | "commercialista";

const VALID_TABS: PeopleTab[] = ["utenti", "accessi-azienda", "sicurezza-accessi", "template-permessi", "dipendenti", "subappaltatori", "venditori", "team", "commercialista"];

function isValidTab(tab: string | null): tab is PeopleTab {
  return VALID_TABS.includes(tab as PeopleTab);
}

/**
 * Da tablet nove schede non stavano nella riga: scorreva di lato e a 1024
 * metà erano fuori. In riga restano Utenti & Accessi, Dipendenti,
 * Subappaltatori, Venditori e Team; Accessi azienda e Commercialista da 1280;
 * Sicurezza accessi e Template permessi in «Altro». Senza icone: nove icone
 * per nove parole allungavano la riga senza aiutare a leggere.
 */
type VisScheda = "sempre" | "xl" | "menu";
// Linguetta in riga (la riga c'è solo da 640): nascosta finché sta in «Altro».
const IN_RIGA: Record<VisScheda, string> = { sempre: "", xl: "hidden xl:inline-flex", menu: "hidden" };
// Voce di «Altro»: visibile finché la linguetta non è in riga.
const IN_MENU: Record<VisScheda, string> = { sempre: "hidden", xl: "xl:hidden", menu: "" };

export default function SettingsPeople() {
  const [searchParams, setSearchParams] = useSearchParams();
  const permissions = usePermissions();
  // Mobile: solo «Utenti & Accessi» (chi c'è, invitare qualcuno). Dipendenti e
  // subappaltatori hanno le loro pagine; accessi azienda, sicurezza, modelli di
  // permesso, venditori, team e commercialista si configurano al computer.
  const isMobile = useIsMobile();

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
      if (tabParam === "accessi-azienda" && canViewUsers) {
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

  const activeTab = isMobile && canViewUsers ? "utenti" : resolveDefaultTab();

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  const schedeAltro = ([
    canViewUsers && { tab: "accessi-azienda", label: "Accessi azienda", vis: "xl" },
    canViewUsers && { tab: "commercialista", label: "Commercialista", vis: "xl" },
    canViewAccessSecurity && { tab: "sicurezza-accessi", label: "Sicurezza accessi", vis: "menu" },
    canManagePermissionTemplates && { tab: "template-permessi", label: "Template permessi", vis: "menu" },
  ] as const).filter(Boolean) as { tab: PeopleTab; label: string; vis: VisScheda }[];
  const schedaAltro = schedeAltro.find((x) => x.tab === activeTab);
  const fasciaAltro: VisScheda = schedaAltro?.vis ?? "sempre";

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="flex flex-nowrap h-auto gap-1 p-1 w-full sm:w-auto justify-start overflow-x-auto scrollbar-none max-sm:hidden">
        {canViewUsers && (
          <TabsTrigger value="utenti" className="shrink-0">Utenti & Accessi</TabsTrigger>
        )}
        {canViewUsers && (
          <TabsTrigger value="accessi-azienda" className={cn("shrink-0", IN_RIGA.xl)}>Accessi azienda</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="dipendenti" className="shrink-0">Dipendenti</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="subappaltatori" className="shrink-0">Subappaltatori</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="venditori" className="shrink-0">Venditori</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="team" className="shrink-0">Team</TabsTrigger>
        )}
        {canViewUsers && (
          <TabsTrigger value="commercialista" className={cn("shrink-0", IN_RIGA.xl)}>Commercialista</TabsTrigger>
        )}
        {/* Le linguette di «Altro» restano (nascoste) perché Radix sappia quale
            scheda è attiva; il menu le apre. */}
        {canViewAccessSecurity && (
          <TabsTrigger value="sicurezza-accessi" className={cn("shrink-0", IN_RIGA.menu)}>Sicurezza accessi</TabsTrigger>
        )}
        {canManagePermissionTemplates && (
          <TabsTrigger value="template-permessi" className={cn("shrink-0", IN_RIGA.menu)}>Template permessi</TabsTrigger>
        )}
        {schedeAltro.length > 0 && (
          // «Altro» prende il nome della scheda aperta quando è una delle sue.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // Da 1280 il menu ha solo voci «menu»: se non ce ne sono, sparisce.
                  !schedeAltro.some((x) => x.vis === "menu") && "xl:hidden",
                  fasciaAltro === "menu" && "bg-background text-foreground shadow-sm",
                  fasciaAltro === "xl" && "max-xl:bg-background max-xl:text-foreground max-xl:shadow-sm",
                )}
              >
                {fasciaAltro === "menu" ? schedaAltro?.label
                  : fasciaAltro === "xl" ? (<><span className="xl:hidden">{schedaAltro?.label}</span><span className="hidden xl:inline">Altro</span></>)
                  : "Altro"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {schedeAltro.map((x) => (
                <DropdownMenuItem
                  key={x.tab}
                  className={cn(IN_MENU[x.vis], x.tab === activeTab && "font-semibold")}
                  onSelect={() => handleTabChange(x.tab)}
                >
                  {x.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TabsList>

      {canViewUsers && (
        <TabsContent value="utenti">
          {/* Info multi-ruolo */}
          <div className="flex items-start gap-3 p-3 mb-4 rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50 max-sm:hidden">
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

      {canViewUsers && (
        <TabsContent value="accessi-azienda">
          <CompanyAccessManager />
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

      {canViewUsers && (
        <TabsContent value="commercialista" className="space-y-4">
          <AccountantChangeRequestsQueue />
          <AccountantAccessTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
