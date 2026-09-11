/**
 * Le due schede dell'Outreach Engine costruite sulle campagne:
 *  - Pipeline: il flusso di UNA campagna (serve sceglierne una);
 *  - Statistiche: una campagna o la panoramica di tutte.
 * La campagna scelta è la stessa nelle due schede (useCampagnaScelta sta nella
 * pagina e arriva qui già pronta).
 */
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CampagnaSelettore } from "./CampagnaSelettore";
import type { useCampagnaScelta } from "./useCampagneOutreach";
import { CampagnaPipeline } from "./CampagnaPipeline";
import { CampagnaStatistiche } from "./CampagnaStatistiche";

type Scelta = ReturnType<typeof useCampagnaScelta>;

function Stato({ sc, onVaiSequenze }: { sc: Scelta; onVaiSequenze: () => void }) {
  if (sc.riepilogo.isLoading) {
    return (
      <div className="flex gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[118px] w-[260px] rounded-xl" />)}
      </div>
    );
  }
  if (sc.riepilogo.error) {
    return (
      <Card><CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" /> Non riesco a leggere le campagne. Riprova tra poco.
      </CardContent></Card>
    );
  }
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-foreground">Nessuna campagna ancora</p>
          <p className="text-sm text-muted-foreground">Crea una sequenza e arruola una lista: qui vedrai dove sono i contatti, fase per fase.</p>
        </div>
        <Button onClick={onVaiSequenze} className="gap-2"><Send className="h-4 w-4" /> Vai alle sequenze</Button>
      </CardContent>
    </Card>
  );
}

export function PipelineCampagne({ companyId, sc, onVaiSequenze }: { companyId: string; sc: Scelta; onVaiSequenze: () => void }) {
  if (sc.campagne.length === 0) return <Stato sc={sc} onVaiSequenze={onVaiSequenze} />;
  // La pipeline è di una campagna: dalla panoramica si parte dalla prima.
  const campagna = sc.campagna ?? sc.campagne[0];
  return (
    <div className="space-y-4">
      <CampagnaSelettore campagne={sc.campagne} scelta={campagna.sequence_id} onCambia={(id) => id && sc.cambia(id)} />
      <CampagnaPipeline key={campagna.sequence_id} companyId={companyId} campagna={campagna} />
    </div>
  );
}

export function StatisticheCampagne({ companyId, sc, onVaiSequenze }: { companyId: string; sc: Scelta; onVaiSequenze: () => void }) {
  if (sc.campagne.length === 0) return <Stato sc={sc} onVaiSequenze={onVaiSequenze} />;
  // La panoramica ha senso da due campagne in su; con una sola si mostra quella.
  const panoramica = sc.scelta === "tutte" && sc.campagne.length > 1;
  const campagna = panoramica ? null : (sc.campagna ?? sc.campagne[0]);
  return (
    <div className="space-y-5">
      <CampagnaSelettore campagne={sc.campagne} scelta={campagna?.sequence_id ?? "tutte"} onCambia={sc.cambia} conTutte={sc.campagne.length > 1} />
      <CampagnaStatistiche companyId={companyId} campagna={campagna} campagne={sc.campagne} onScegli={(id) => sc.cambia(id)} />
    </div>
  );
}
