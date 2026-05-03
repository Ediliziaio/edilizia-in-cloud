import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCEriclassificato, useBEP } from "@/hooks/controlloGestione/useCEriclassificato";
import { CETable } from "@/components/controllo-gestione/ui/CETable";
import { BEPChart } from "@/components/controllo-gestione/ui/BEPChart";
import { KPIBox } from "@/components/controllo-gestione/ui/KPIBox";
import { CESkeleton } from "@/components/controllo-gestione/skeletons/CESkeleton";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { InsightsPanel } from "@/components/controllo-gestione/ui/InsightsPanel";
import { useControlloGestioneInsights } from "@/hooks/controlloGestione/useControlloGestioneInsights";

interface TabCERiclassificatoProps {
  anno: number;
  meseDa: number;
  meseA: number;
}

function findVoce(voci: { codice: string; valore: number }[], codice: string) {
  return voci.find((v) => v.codice === codice)?.valore ?? 0;
}

export function TabCERiclassificato({ anno, meseDa, meseA }: TabCERiclassificatoProps) {
  const ce = useCEriclassificato(anno, meseDa, meseA);
  const bep = useBEP(anno);
  const { insights } = useControlloGestioneInsights(anno);

  const allZero = useMemo(() => {
    if (!ce.data) return false;
    return ce.data.voci.every((v) => v.valore === 0);
  }, [ce.data]);

  if (ce.isLoading) return <CESkeleton />;
  if (ce.isError) return <ErrorBlock onRetry={() => ce.refetch()} />;
  if (!ce.data) return null;

  if (allZero) {
    return (
      <EmptyState
        title="Nessun dato di conto economico"
        description={`Per il periodo selezionato (${anno}) non ci sono movimenti registrati. Inserisci le scritture in Prima Nota per popolare il CE riclassificato.`}
        ctaLabel="Vai a Prima Nota"
        onCta={() => { window.location.href = "/azienda/prima-nota"; }}
      />
    );
  }

  const pil = findVoce(ce.data.voci, "01");
  const ebitda = findVoce(ce.data.voci, "G");
  const utile = findVoce(ce.data.voci, "L");
  const ebitdaPctPil = pil !== 0 ? (ebitda / pil) * 100 : 0;

  return (
    <div className="space-y-4">
      <InsightsPanel insights={insights} title="Cosa devi guardare per primo" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="rounded-2xl lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conto Economico Riclassificato</CardTitle>
        </CardHeader>
        <CardContent>
          <CETable voci={ce.data.voci} />
        </CardContent>
      </Card>

      <div className="space-y-3 lg:col-span-1">
        <KPIBox
          label="PIL (Produzione)"
          value={formatCurrency(pil)}
          tone="blue"
        />
        <KPIBox
          label="EBITDA"
          value={formatCurrency(ebitda)}
          sub={`${ebitdaPctPil.toFixed(1)}% del PIL`}
          tone={ebitda >= 0 ? "green" : "red"}
        />
        <KPIBox
          label="Utile di bilancio"
          value={formatCurrency(utile)}
          tone={utile >= 0 ? "green" : "red"}
        />
        <KPIBox
          label="Break Even Point"
          value={
            bep.isLoading
              ? "…"
              : bep.data?.bep_data
                ? formatDate(bep.data.bep_data)
                : "Non raggiunto"
          }
          sub={
            bep.data?.gia_raggiunto
              ? "BEP già raggiunto"
              : bep.data?.giorni_residui != null
                ? `${bep.data.giorni_residui} giorni residui`
                : undefined
          }
          tone={bep.data?.gia_raggiunto ? "green" : "neutral"}
        />
      </div>

      <Card className="rounded-2xl lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Andamento Ricavi vs Costi vs BEP</CardTitle>
        </CardHeader>
        <CardContent>
          <BEPChart anno={anno} />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
