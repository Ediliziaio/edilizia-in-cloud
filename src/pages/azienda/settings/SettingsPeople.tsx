/**
 * Pagina unificata "Persone & Accessi"
 *
 * Schede, nell'ordine in cui compaiono (gli indirizzi ?tab=… non cambiano):
 *  1. Utenti            — gestione accessi, ruoli, permessi, sicurezza
 *  2. Dipendenti        — operai + staff interno, stipendi, rapportini, ferie
 *  3. Venditori         — gestione venditori con provvigioni
 *  4. Subappaltatori    — squadre esterne + accesso campo
 *  5. Team              — team con drag-and-drop
 *  6. Commercialista    — invito + deleghe accesso studio
 *  e in «Altro»:
 *  7. Da altre aziende  — persone che entrano con un account di un'altra azienda
 *  8. Controllo accessi — chi ha accesso, chi non entra da tempo, accessi a rischio
 *  9. Modelli di permessi — gruppi di permessi pronti (solo l'amministratore)
 *
 * Chi può scrivere: utenti, venditori, dipendenti, subappaltatori, deleghe e
 * modelli li scrive solo l'amministratore (lo impone il server). «Team & Utenti —
 * Modifica» serve ai team; le squadre esterne le modifica anche chi ha
 * «Configurazione Ordini — Modifica». Gli altri vedono le schede in sola lettura,
 * con i pulsanti spenti e un avviso in cima, invece di pulsanti che rispondono
 * con un rifiuto a clic fatto.
 */

import { useSearchParams } from "react-router-dom";
import { Loader2, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

/** L'avviso in cima alle schede che un non-amministratore può solo guardare. */
function AvvisoSolaLettura() {
  return (
    <Alert className="mb-4">
      <AlertDescription>
        Stai guardando. Utenti, ruoli, permessi, venditori e dipendenti li cambia solo l'amministratore.
      </AlertDescription>
    </Alert>
  );
}

export default function SettingsPeople() {
  const [searchParams, setSearchParams] = useSearchParams();
  const permissions = usePermissions();
  // Mobile: solo «Utenti» (chi c'è, invitare qualcuno). Dipendenti e
  // subappaltatori hanno le loro pagine; accessi da altre aziende, controllo
  // accessi, modelli di permessi, venditori, team e commercialista si
  // configurano al computer.
  const isMobile = useIsMobile();

  const isAdmin = permissions.isAdmin;
  const canViewUsers = isAdmin || permissions.canViewUsers;
  const canViewPeople = isAdmin || permissions.canViewSettingsPeople;
  const canViewAccessSecurity = canViewUsers || permissions.canViewSettingsSecurity;
  // I modelli di permessi li scrive solo l'amministratore (policy e funzione).
  const canManagePermissionTemplates = isAdmin;
  // Utenti, venditori, dipendenti, subappaltatori, deleghe: solo l'amministratore.
  const puoGestirePersone = isAdmin;
  // Le squadre esterne le modifica anche chi ha «Configurazione Ordini — Modifica».
  const puoGestireSquadre = isAdmin || permissions.canEditSettingsOrders;
  // La scheda di una persona si apre da «Controllo accessi» a chi può vederla.
  const puoAprireScheda = isAdmin || permissions.canViewSettingsPeople;

  if (permissions.isLoading) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento dei permessi…
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
  // La prima scheda che si vede nella barra, nell'ordine in cui compaiono.
  const fallbackTab = (): PeopleTab => {
    if (canViewUsers) return "utenti";
    if (canViewPeople) return "dipendenti";
    if (canViewAccessSecurity) return "sicurezza-accessi";
    if (canManagePermissionTemplates) return "template-permessi";
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
      if ((tabParam === "accessi-azienda" || tabParam === "commercialista") && canViewUsers) {
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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  // Le schede meno usate stanno in «Altro»: la riga resta di sei schede, che da
  // 640 px ci stanno tutte (con nove scorreva di lato e a 1024 metà erano fuori).
  const schedeAltro = ([
    canViewUsers && { tab: "accessi-azienda", label: "Da altre aziende" },
    canViewAccessSecurity && { tab: "sicurezza-accessi", label: "Controllo accessi" },
    canManagePermissionTemplates && { tab: "template-permessi", label: "Modelli di permessi" },
  ] as const).filter(Boolean) as { tab: PeopleTab; label: string }[];
  const schedaAltro = schedeAltro.find((x) => x.tab === activeTab);

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      {/* Su telefono la barra c'è solo se non si è bloccati sulla scheda «Utenti»:
          chi non vede gli utenti ma vede i dipendenti prima restava sulla prima
          scheda senza modo di cambiarla. */}
      <TabsList
        className={cn(
          "flex flex-nowrap h-auto gap-1 p-1 w-full sm:w-auto justify-start overflow-x-auto scrollbar-none",
          canViewUsers && "max-sm:hidden",
        )}
      >
        {canViewUsers && (
          <TabsTrigger value="utenti" className="shrink-0">Utenti</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="dipendenti" className="shrink-0">Dipendenti</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="venditori" className="shrink-0">Venditori</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="subappaltatori" className="shrink-0">Subappaltatori</TabsTrigger>
        )}
        {canViewPeople && (
          <TabsTrigger value="team" className="shrink-0">Team</TabsTrigger>
        )}
        {canViewUsers && (
          <TabsTrigger value="commercialista" className="shrink-0">Commercialista</TabsTrigger>
        )}
        {/* Le linguette di «Altro» restano (nascoste) perché Radix sappia quale
            scheda è attiva; il menu le apre. */}
        {canViewUsers && (
          <TabsTrigger value="accessi-azienda" className="hidden">Da altre aziende</TabsTrigger>
        )}
        {canViewAccessSecurity && (
          <TabsTrigger value="sicurezza-accessi" className="hidden">Controllo accessi</TabsTrigger>
        )}
        {canManagePermissionTemplates && (
          <TabsTrigger value="template-permessi" className="hidden">Modelli di permessi</TabsTrigger>
        )}
        {schedeAltro.length > 0 && (
          // «Altro» prende il nome della scheda aperta quando è una delle sue.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  schedaAltro && "bg-background text-foreground shadow-sm",
                )}
              >
                {schedaAltro ? schedaAltro.label : "Altro"}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {schedeAltro.map((x) => (
                <DropdownMenuItem
                  key={x.tab}
                  className={cn(x.tab === activeTab && "font-semibold")}
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
          {!puoGestirePersone && <AvvisoSolaLettura />}
          {/* Una frase sola, chiusa: spingeva giù l'elenco. */}
          {puoGestirePersone && (
            <details className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm max-sm:hidden">
              <summary className="cursor-pointer font-medium">Una persona può avere più ruoli</summary>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Un impiegato che fa anche il venditore? Apri il menu <strong>⋮</strong> sulla sua riga e scegli{" "}
                <em>«Aggiungi ruolo Venditore»</em>: comparirà nel calendario, negli elenchi dei venditori e
                nelle provvigioni.
              </p>
            </details>
          )}
          <UsersConfig />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="dipendenti">
          {!puoGestirePersone && <AvvisoSolaLettura />}
          <Employees soloLettura={!puoGestirePersone} soloLetturaSquadre={!puoGestireSquadre} />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="venditori">
          {!puoGestirePersone && <AvvisoSolaLettura />}
          <SalespeopleConfig soloLettura={!puoGestirePersone} />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="subappaltatori">
          {!puoGestirePersone && <AvvisoSolaLettura />}
          <SubappaltatoriTab soloLettura={!puoGestirePersone} />
        </TabsContent>
      )}

      {canViewPeople && (
        <TabsContent value="team">
          <SettingsTeams />
        </TabsContent>
      )}

      {canViewUsers && (
        <TabsContent value="commercialista" className="space-y-4">
          {!puoGestirePersone && <AvvisoSolaLettura />}
          <AccountantChangeRequestsQueue />
          <AccountantAccessTab soloLettura={!puoGestirePersone} />
        </TabsContent>
      )}

      {canViewUsers && (
        <TabsContent value="accessi-azienda">
          {!puoGestirePersone && <AvvisoSolaLettura />}
          <CompanyAccessManager soloLettura={!puoGestirePersone} />
        </TabsContent>
      )}

      {canViewAccessSecurity && (
        <TabsContent value="sicurezza-accessi">
          <AccessGovernancePanel puoAprireScheda={puoAprireScheda} />
        </TabsContent>
      )}

      {canManagePermissionTemplates && (
        <TabsContent value="template-permessi">
          <PermissionTemplatesManager />
        </TabsContent>
      )}
    </Tabs>
  );
}
