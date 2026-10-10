/**
 * SettingsFatturazioneUnified — la pagina Fatturazione delle impostazioni.
 *
 * In cima la scelta «Come fatturi?» (con un altro programma / con Edilizia in Cloud), che decide tutto il resto;
 * sotto due schede, una per modo:
 *  - «Con un altro programma»: il programma collegato (Fatture in Cloud, Fattura24, Aruba…) e cosa è arrivato.
 *  - «Con Edilizia in Cloud»: i dati che escono sulle fatture, l'invio allo SDI, la numerazione. Si possono
 *    cambiare solo se si fattura così: altrimenti la scheda si legge e basta, e dice come attivarla.
 *
 * URL: /azienda/impostazioni/fatturazione?tab=esterna|nativa (senza: la scheda del modo scelto)
 * Redirect: /azienda/impostazioni/fatturazione-nativa → ?tab=nativa
 */
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, FileSignature, Lock, ArrowRight, Monitor } from "lucide-react";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ComeFatturi } from "@/components/fatturazione/ComeFatturi";
import { vaiAllaScelta } from "@/lib/fatturazione/sceltaCheFatturi";

// Code-split: le due schede sono pesanti. Carico solo quella che si vede.
const SettingsBilling = lazy(() => import("@/pages/azienda/settings/SettingsBilling"));
const ImpostazioniFatturazione = lazy(() => import("@/pages/azienda/fatturazione/ImpostazioniFatturazione"));

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const VALID_TABS = new Set(["esterna", "nativa"]);

export default function SettingsFatturazioneUnified() {
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") ?? "";
  const { isNative, isChosen, isLoading } = useBillingMode();
  // Senza una scheda nell'indirizzo si apre quella del modo in cui fatturi.
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : isNative ? "nativa" : "esterna";
  // Il sistema di fatturazione si imposta solo da computer o tablet (regola
  // dell'utente, 25/09/2026): dal telefono si emettono e si guardano le
  // fatture, ma modalità, programma collegato e configurazione SDI no.
  const isMobile = useIsMobile();

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  };

  if (isMobile) {
    return (
      <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Si imposta da computer o tablet</p>
          {!isLoading && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isChosen
                ? isNative ? "Oggi fatturi con Edilizia in Cloud." : "Oggi fatturi con un altro programma."
                : "Non hai ancora scelto come fatturi."}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ComeFatturi onScelta={(modo) => setTab(modo === "native" ? "nativa" : "esterna")} />

      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="grid h-auto w-full max-w-xl grid-cols-2">
          <TabsTrigger value="esterna" className="gap-1.5 whitespace-normal py-2 text-xs sm:text-sm">
            <Plug className="h-3.5 w-3.5 shrink-0" />
            Con un altro programma
          </TabsTrigger>
          <TabsTrigger value="nativa" className="gap-1.5 whitespace-normal py-2 text-xs sm:text-sm">
            <FileSignature className="h-3.5 w-3.5 shrink-0" />
            Con Edilizia in Cloud
            {!isLoading && !isNative && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Sola lettura" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esterna" className="mt-4">
          <Suspense fallback={<TabFallback />}>
            <SettingsBilling />
          </Suspense>
        </TabsContent>

        <TabsContent value="nativa" className="mt-4 space-y-4">
          {/* Sola lettura se non si fattura con Edilizia in Cloud: la scheda si guarda, e dice come attivarla. */}
          {!isLoading && !isNative && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Per ora si possono solo guardare</AlertTitle>
              <AlertDescription className="space-y-2 text-sm">
                <p>
                  {isChosen
                    ? "Oggi fatturi con un altro programma, quindi queste impostazioni non servono. Le usi se scegli «Con Edilizia in Cloud»."
                    : "Non hai ancora scelto come fatturi. Queste impostazioni servono se scegli «Con Edilizia in Cloud»."}
                </p>
                <Button variant="link" size="sm" className="h-auto px-0" onClick={() => vaiAllaScelta()}>
                  Scegli «Con Edilizia in Cloud»
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {/* Sola lettura reale anche da tastiera: fieldset disabilitato e inert.
              Il controllo della modalità resta anche nelle funzioni server. */}
          <fieldset disabled={isLoading || !isNative} ref={(element) => { element?.toggleAttribute("inert", isLoading || !isNative); }} className={isLoading || !isNative ? "m-0 min-w-0 border-0 p-0 opacity-70" : "m-0 min-w-0 border-0 p-0"}>
            <Suspense fallback={<TabFallback />}>
              <ImpostazioniFatturazione />
            </Suspense>
          </fieldset>
        </TabsContent>
      </Tabs>
    </div>
  );
}
