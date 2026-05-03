import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePianoIndustriale, type PianoResult } from "@/hooks/controlloGestione/usePianoIndustriale";
import { AssumptionEditor } from "@/components/controllo-gestione/ui/AssumptionEditor";
import { PianoChart } from "@/components/controllo-gestione/ui/PianoChart";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface TabPianoIndustrialeProps {
  scenarioId: string | null;
}

/**
 * Riconosce l'errore "Nessuno scenario base trovato" della RPC e lo distingue
 * da errori generici di connessione/RLS.
 */
function isNoScenarioError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? err.message
      : String((err as { message?: string })?.message ?? err);
  return /scenario/i.test(msg) && /(non trov|esegui bootstrap|base)/i.test(msg);
}

export function TabPianoIndustriale({ scenarioId }: TabPianoIndustrialeProps) {
  const baseQuery = usePianoIndustriale("base", 5);
  const [whatIf, setWhatIf] = useState<PianoResult | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const qc = useQueryClient();

  const piano = whatIf ?? baseQuery.data ?? null;
  const noScenario = baseQuery.isError && isNoScenarioError(baseQuery.error);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        already_bootstrapped: boolean;
        scenari_creati: number;
      }>("cg-bootstrap-scenari", { body: { orizzonte: 5 } });
      if (error) throw error;
      if (data?.already_bootstrapped) {
        toast.info("Scenari già presenti — ricarico");
      } else {
        toast.success(`Creati ${data?.scenari_creati ?? 3} scenari di base`);
      }
      // Invalida e refetch immediato
      await qc.invalidateQueries({ queryKey: queryKeys.controlloGestione.piano("base", 5) });
      await baseQuery.refetch();
    } catch (e) {
      toast.error(`Errore creazione scenari: ${(e as Error).message ?? "sconosciuto"}`);
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <AssumptionEditor
          scenarioId={scenarioId}
          onResult={setWhatIf}
          disabled={noScenario || bootstrapping}
        />
      </div>

      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Proiezione piano industriale</CardTitle>
        </CardHeader>
        <CardContent>
          {baseQuery.isLoading && !whatIf ? (
            <ChartSkeleton />
          ) : noScenario ? (
            <EmptyState
              title="Nessuno scenario configurato"
              description="Per generare le proiezioni servono almeno 3 scenari di base (prudente, base, aggressivo). Possiamo crearli automaticamente partendo dai tuoi dati storici."
              ctaLabel={bootstrapping ? "Creazione in corso…" : "Crea scenari di base"}
              onCta={bootstrapping ? undefined : handleBootstrap}
              icon={
                bootstrapping ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Sparkles className="h-6 w-6 text-orange-500" />
                )
              }
            />
          ) : baseQuery.isError && !whatIf ? (
            <ErrorBlock onRetry={() => baseQuery.refetch()} />
          ) : !piano || piano.periodi.length === 0 ? (
            <EmptyState
              title="Nessuna proiezione disponibile"
              description="Configura uno scenario di piano industriale per generare la proiezione."
            />
          ) : (
            <PianoChart periodi={piano.periodi} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
