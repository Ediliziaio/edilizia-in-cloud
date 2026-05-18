/**
 * SettingsFatturazioneUnified — v8.6.57
 *
 * Unifica le 2 ex pagine /azienda/impostazioni/fatturazione (provider esterni)
 * e /azienda/impostazioni/fatturazione-nativa (config SDI nativa) in un'unica
 * vista con tab.
 *
 * Tab "Provider esterni" — sempre disponibile, contiene il BillingModeSelector
 *   + lista provider connessi (Fatture in Cloud, Fattura24, Aruba, ecc.)
 *   + log webhook + import documenti.
 *
 * Tab "Configurazione elettronica nativa" — visibile sempre, ma le modifiche
 *   sono permesse SOLO se mode === "native". Se mode === "external" mostra
 *   un banner che spiega come abilitare la modalità nativa.
 *
 * URL: /azienda/impostazioni/fatturazione?tab=esterna|nativa (default: esterna)
 * Redirect: /azienda/impostazioni/fatturazione-nativa → ?tab=nativa
 */
import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2, Plug, FileSignature, Lock, ArrowRight } from "lucide-react";
import { useBillingMode } from "@/contexts/BillingModeContext";

// Code-split: le 2 pagine sono pesanti (574 + 1162 righe).
// Carico solo il tab visibile + l'altro on-demand.
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
  const activeTab = VALID_TABS.has(tabParam) ? tabParam : "esterna";
  const { isNative, isLoading } = useBillingMode();

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  };

  const nativeReadOnlyMessage = useMemo(
    () =>
      "La modalità di fatturazione attiva è 'Provider esterno'. Per modificare la configurazione elettronica nativa devi prima passare alla modalità 'Nativa SDI' dal tab 'Provider esterni'.",
    [],
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-2">
          <TabsTrigger value="esterna" className="gap-1.5">
            <Plug className="h-3.5 w-3.5" />
            <span>Provider esterni</span>
          </TabsTrigger>
          <TabsTrigger value="nativa" className="gap-1.5">
            <FileSignature className="h-3.5 w-3.5" />
            <span>Configurazione elettronica nativa</span>
            {!isLoading && !isNative && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Lettura sola" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="esterna" className="mt-4">
          <Suspense fallback={<TabFallback />}>
            <SettingsBilling />
          </Suspense>
        </TabsContent>

        <TabsContent value="nativa" className="mt-4 space-y-4">
          {/* v8.6.57 — Banner read-only se modalità external attiva */}
          {!isLoading && !isNative && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertTitle>Configurazione in sola lettura</AlertTitle>
              <AlertDescription className="space-y-2 text-sm">
                <p>{nativeReadOnlyMessage}</p>
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 h-auto"
                  onClick={() => setTab("esterna")}
                >
                  Vai a "Provider esterni" per cambiare modalità
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {/* Disabilita interazioni se non-native via pointer-events + opacity.
              I form interni continuano a renderizzare le INFO ma non sono submittibili
              perché tutti i submit usano edge function che require billing_mode=native. */}
          <div className={!isLoading && !isNative ? "pointer-events-none opacity-70" : ""}>
            <Suspense fallback={<TabFallback />}>
              <ImpostazioniFatturazione />
            </Suspense>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
