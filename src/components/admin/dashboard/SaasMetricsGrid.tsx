import { useState } from "react";
import { TrendingUp, TrendingDown, Users, DollarSign, Target, Clock, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { CacInputModal } from "./CacInputModal";
import { useSaasMetrics } from "@/hooks/useSaasMetrics";

const fmtEur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtMesi = (v: number) => `${v.toFixed(1)} mesi`;

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ElementType;
  tooltip: string;
  color?: string;
}

function MetricCard({ label, value, icon: Icon, tooltip, color = "text-primary" }: MetricCardProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-lg border bg-card p-3 cursor-default hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-xl font-bold tabular-nums">{value}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SaasMetricsGrid() {
  const { metrics, isLoading, salvaInputCac } = useSaasMetrics();
  const [cacOpen, setCacOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Metriche SaaS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Metriche SaaS
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setCacOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Inserisci CAC
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="ARPU"
            value={fmtEur.format(metrics.arpu)}
            icon={DollarSign}
            color="text-blue-500"
            tooltip={`ARPU (Average Revenue Per User): ${fmtEur.format(metrics.mrrStripe)} MRR Stripe ÷ ${metrics.activeCompanies} aziende attive`}
          />
          <MetricCard
            label="Churn Rate"
            value={fmtPct(metrics.churnRate)}
            icon={metrics.churnRate > 5 ? TrendingDown : TrendingUp}
            color={metrics.churnRate > 5 ? "text-red-500" : "text-green-500"}
            tooltip="Percentuale di aziende cancellate negli ultimi 30 giorni rispetto al totale attive"
          />
          <MetricCard
            label="LTV"
            value={fmtEur.format(metrics.ltv)}
            icon={Users}
            color="text-purple-500"
            tooltip={`LTV (Lifetime Value): ARPU ÷ Churn Rate mensile. Valore stimato per ogni azienda nel ciclo di vita.`}
          />
          <MetricCard
            label="CAC"
            value={metrics.cac > 0 ? fmtEur.format(metrics.cac) : "N/D"}
            icon={Target}
            color="text-orange-500"
            tooltip="CAC (Customer Acquisition Cost): spesa marketing media ÷ nuove aziende acquisite (ultime 3 mensilità). Inserisci i dati tramite il pulsante."
          />
          <MetricCard
            label="Payback Period"
            value={metrics.paybackPeriod > 0 ? fmtMesi(metrics.paybackPeriod) : "N/D"}
            icon={Clock}
            color="text-cyan-500"
            tooltip="Payback Period: CAC ÷ ARPU. Mesi necessari per recuperare il costo di acquisizione di una nuova azienda."
          />
        </div>

        {metrics.cac === 0 && (
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Inserisci la spesa marketing mensile per calcolare CAC e Payback Period
          </p>
        )}
      </CardContent>

      <CacInputModal
        open={cacOpen}
        onOpenChange={setCacOpen}
        onSubmit={(data) =>
          salvaInputCac.mutate(data, { onSuccess: () => setCacOpen(false) })
        }
        isLoading={salvaInputCac.isPending}
      />
    </Card>
  );
}
