/**
 * Impostazioni → Calendari lavori (le squadre di posa e i loro calendari). Stessa struttura della pagina dei calendari
 * marketing, ma qui i calendari sono le squadre di posa e il calendario di tutte le pose, ognuno collegato a un calendario
 * Google dell'account aziendale.
 *
 * Perché un'altra pagina e non un tab in più là: là un calendario è UNA persona
 * con il SUO Google; qui è una squadra con un calendario dell'account
 * aziendale. Modelli diversi, pagine diverse.
 *
 * Due schede: «Squadre» (la cosa che si viene a fare) e «Google Calendar» (l'account, il calendario di tutte le pose, i
 * calendari del team). Prima erano tre («Squadre», «Calendari standard», «Collegamenti»): i vecchi indirizzi
 * `?tab=standard` e `?tab=collegamenti` aprono la scheda «Google Calendar».
 */
import { useSearchParams } from "react-router-dom";
import { HardHat, CalendarDays, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import GoogleCalendarConnectionTab from "@/components/settings/GoogleCalendarConnectionTab";
import { CalendariDelTeam } from "@/components/integrations/CompanyCalendarsOverview";
import { SquadreTab } from "./SquadreTab";
import { CalendariStandardTab } from "./CalendariStandardTab";

const TABS = ["squadre", "google"] as const;
type Tab = (typeof TABS)[number];
/** Le schede di prima: stesso contenuto, ora tutto in «Google Calendar». */
const SCHEDE_DI_PRIMA: Record<string, Tab> = { standard: "google", collegamenti: "google" };

function schedaDaIndirizzo(richiesto: string): Tab {
  if ((TABS as readonly string[]).includes(richiesto)) return richiesto as Tab;
  return SCHEDE_DI_PRIMA[richiesto] ?? "squadre";
}

export default function CalendariLavoriConfig() {
  const { role } = useAuth();
  const permissions = usePermissions();
  // Stessa regola della RLS: admin o staff con la modifica delle impostazioni commesse.
  const canManage = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || permissions.canEditSettingsOrders);
  const [params, setParams] = useSearchParams();
  const tab = schedaDaIndirizzo(params.get("tab") ?? "");

  return (
    <div className="space-y-4">
      {!permissions.isLoading && !canManage && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}

      <Tabs value={tab} onValueChange={(v) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", v); return next; })}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
          <TabsTrigger value="squadre" className="min-w-0 gap-1 px-1 text-xs sm:gap-2 sm:text-sm">
            <HardHat className="h-4 w-4" />
            Squadre
          </TabsTrigger>
          <TabsTrigger value="google" className="min-w-0 gap-1 px-1 text-xs sm:gap-2 sm:text-sm">
            <CalendarDays className="h-4 w-4" />
            Google Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="squadre" className="mt-4">
          <SquadreTab canManage={canManage} />
        </TabsContent>

        <TabsContent value="google" className="mt-4 space-y-8">
          <section aria-labelledby="google-account-titolo" className="space-y-3">
            <div>
              <h2 id="google-account-titolo" className="text-base font-semibold leading-tight">Account Google</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                L&apos;account Google dell&apos;azienda per le squadre. Il tuo calendario personale si collega dal tuo profilo.
              </p>
            </div>
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                L&apos;account Google con i calendari delle squadre va collegato con l&apos;utente <strong>titolare</strong>,
                non con chi domani potrebbe non esserci: se quella persona esce o cambia password, la sincronizzazione
                si ferma.
              </AlertDescription>
            </Alert>
            <GoogleCalendarConnectionTab />
          </section>

          <section aria-labelledby="google-pose-titolo" className="space-y-3">
            <div>
              <h2 id="google-pose-titolo" className="text-base font-semibold leading-tight">Calendario di tutte le pose</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Un solo calendario Google dove finiscono le pose di tutte le squadre. È facoltativo.
              </p>
            </div>
            <CalendariStandardTab canManage={canManage} />
          </section>

          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3">
              <h2 className="inline text-base font-semibold leading-tight">Calendari collegati dal team</h2>
            </summary>
            <div className="space-y-2 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Ogni persona collega il proprio calendario dal suo profilo: qui vedi chi l&apos;ha fatto e con quale indirizzo.
              </p>
              <CalendariDelTeam />
            </div>
          </details>
        </TabsContent>
      </Tabs>
    </div>
  );
}
