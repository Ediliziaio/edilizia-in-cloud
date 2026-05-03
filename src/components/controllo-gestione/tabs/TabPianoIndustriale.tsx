import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePianoIndustriale, type PianoResult } from "@/hooks/controlloGestione/usePianoIndustriale";
import { AssumptionEditor } from "@/components/controllo-gestione/ui/AssumptionEditor";
import { PianoChart } from "@/components/controllo-gestione/ui/PianoChart";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";

interface TabPianoIndustrialeProps {
  scenarioId: string | null;
}

export function TabPianoIndustriale({ scenarioId }: TabPianoIndustrialeProps) {
  const baseQuery = usePianoIndustriale("base", 5);
  const [whatIf, setWhatIf] = useState<PianoResult | null>(null);

  const piano = whatIf ?? baseQuery.data ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <AssumptionEditor scenarioId={scenarioId} onResult={setWhatIf} />
      </div>

      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Proiezione piano industriale</CardTitle>
        </CardHeader>
        <CardContent>
          {baseQuery.isLoading && !whatIf ? (
            <ChartSkeleton />
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
