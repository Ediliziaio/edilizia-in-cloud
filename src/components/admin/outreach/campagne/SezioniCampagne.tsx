/**
 * Le due schede dell'Outreach Engine costruite sulle campagne:
 *  - Pipeline: il flusso di UNA campagna (serve sceglierne una);
 *  - Statistiche: una campagna o la panoramica di tutte.
 * La campagna scelta è la stessa nelle due schede (useCampagnaScelta sta nella
 * pagina e arriva qui già pronta). Il ritmo delle caselle serve a tutte e due
 * per dire quando finiscono davvero gli invii.
 */
import { useMemo, useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CampagnaSelettore } from "./CampagnaSelettore";
import { CampagnaPipeline } from "./CampagnaPipeline";
import { CampagnaStatistiche } from "./CampagnaStatistiche";
import { useCampagneRitmo, stimaCampagna, type useCampagnaScelta } from "./useCampagneOutreach";

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
  const ritmo = useCampagneRitmo(companyId);
  const [adesso] = useState(() => new Date());
  // La pipeline è di una campagna: dalla panoramica si parte dalla prima.
  const campagna = sc.campagna ?? sc.campagne[0] ?? null;
  const stima = useMemo(
    () => (campagna ? stimaCampagna(campagna, null, sc.campagne, ritmo.data ?? [], adesso) : null),
    [campagna, sc.campagne, ritmo.data, adesso],
  );
  if (!campagna) return <Stato sc={sc} onVaiSequenze={onVaiSequenze} />;
  return (
    <div className="space-y-4">
      <CampagnaSelettore campagne={sc.campagne} scelta={campagna.sequence_id} onCambia={(id) => id && sc.cambia(id)} />
      <CampagnaPipeline key={campagna.sequence_id} companyId={companyId} campagna={campagna} stima={stima} />
    </div>
  );
}

export function StatisticheCampagne({ companyId, sc, onVaiSequenze }: { companyId: string; sc: Scelta; onVaiSequenze: () => void }) {
  const ritmo = useCampagneRitmo(companyId);
  const [adesso] = useState(() => new Date());
  // La panoramica ha senso da due campagne in su; con una sola si mostra quella.
  const panoramica = sc.scelta === "tutte" && sc.campagne.length > 1;
  const campagna = panoramica ? null : (sc.campagna ?? sc.campagne[0] ?? null);
  const stime = useMemo(() => {
    const ritmi = ritmo.data ?? [];
    if (campagna) {
      const s = stimaCampagna(campagna, null, sc.campagne, ritmi, adesso);
      return s ? [s] : [];
    }
    // Panoramica: una stima per ogni brand con campagne attive.
    const brand = [...new Set(sc.campagne.filter((c) => c.stato === "active" && c.brand_id).map((c) => c.brand_id as string))];
    return brand.map((b) => stimaCampagna(null, b, sc.campagne, ritmi, adesso)).filter((s): s is NonNullable<typeof s> => !!s);
  }, [campagna, sc.campagne, ritmo.data, adesso]);

  if (sc.campagne.length === 0) return <Stato sc={sc} onVaiSequenze={onVaiSequenze} />;
  return (
    <div className="space-y-5">
      <CampagnaSelettore campagne={sc.campagne} scelta={campagna?.sequence_id ?? "tutte"} onCambia={sc.cambia} conTutte={sc.campagne.length > 1} />
      <CampagnaStatistiche companyId={companyId} campagna={campagna} campagne={sc.campagne} stime={stime} onScegli={(id) => sc.cambia(id)} />
    </div>
  );
}
