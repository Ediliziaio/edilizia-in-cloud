/**
 * Impostazioni → Calendari lavori. Stessa struttura della pagina dei calendari
 * marketing, ma qui i calendari sono le squadre di posa e i calendari standard
 * del calendario operativo, ognuno collegato a un calendario Google.
 *
 * Perché un'altra pagina e non un tab in più là: là un calendario è UNA persona
 * con il SUO Google; qui è una squadra con un calendario dell'account
 * aziendale. Modelli diversi, pagine diverse.
 */
import { useSearchParams } from "react-router-dom";
import { CalendarDays, HardHat, Link2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import GoogleCalendarConnectionTab from "@/components/settings/GoogleCalendarConnectionTab";
import CompanyCalendarsOverview from "@/components/integrations/CompanyCalendarsOverview";
import { SquadreTab } from "./SquadreTab";
import { CalendariStandardTab } from "./CalendariStandardTab";

const TABS = ["squadre", "standard", "collegamenti"] as const;
type Tab = (typeof TABS)[number];

export default function CalendariLavoriConfig() {
  const { role } = useAuth();
  const permissions = usePermissions();
  // Stessa regola della RLS: admin o staff con la modifica delle impostazioni commesse.
  const canManage = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || permissions.canEditSettingsOrders);
  const [params, setParams] = useSearchParams();
  const richiesto = params.get("tab") ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(richiesto) ? (richiesto as Tab) : "squadre";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Le squadre di posa e i calendari del lavoro operativo, collegati ai calendari Google dell&apos;azienda.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; })}>
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1">
          <TabsTrigger value="squadre" className="min-w-0 gap-1 px-1 text-xs sm:gap-2 sm:text-sm">
            <HardHat className="h-4 w-4" />
            Squadre
          </TabsTrigger>
          <TabsTrigger value="standard" className="min-w-0 gap-1 px-1 text-xs sm:gap-2 sm:text-sm">
            <CalendarDays className="h-4 w-4" />
            <span className="sm:hidden">Standard</span><span className="hidden sm:inline">Calendari standard</span>
          </TabsTrigger>
          <TabsTrigger value="collegamenti" className="min-w-0 gap-1 px-1 text-xs sm:gap-2 sm:text-sm">
            <Link2 className="h-4 w-4" />
            Collegamenti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="squadre" className="mt-4">
          <SquadreTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="standard" className="mt-4">
          <CalendariStandardTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="collegamenti" className="mt-4 space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              L&apos;account Google con i calendari delle squadre va collegato con l&apos;utente <strong>titolare</strong>,
              non con chi domani potrebbe non esserci: se quella persona esce o cambia password, la sincronizzazione
              si ferma.
            </AlertDescription>
          </Alert>
          <GoogleCalendarConnectionTab />
          <CompanyCalendarsOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
