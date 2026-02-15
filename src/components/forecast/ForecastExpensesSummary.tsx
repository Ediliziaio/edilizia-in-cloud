import {
  Building2,
  UserCheck,
  Truck,
  Receipt,
  TrendingDown,
  Flame,
  ArrowLeftRight,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import type { ForecastStats, CfoKpis, CostsSummary, MaterialCosts } from "@/lib/forecastTypes";

interface ForecastExpensesSummaryProps {
  stats: ForecastStats;
  cfoKpis: CfoKpis;
  costsSummary: CostsSummary;
  hasPendingMaterials: boolean;
  pendingMaterialsCount: number;
  pendingMaterialsTotal: number;
}

function MiniStat({ icon: Icon, label, amount, color }: {
  icon: React.ElementType;
  label: string;
  amount: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-muted/50 min-w-0 flex-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-xs text-muted-foreground text-center truncate w-full">{label}</span>
      <span className="text-sm font-semibold">{formatCurrency(amount)}</span>
    </div>
  );
}

export function ForecastExpensesSummary({
  stats,
  cfoKpis,
  costsSummary,
  hasPendingMaterials,
  pendingMaterialsCount,
  pendingMaterialsTotal,
}: ForecastExpensesSummaryProps) {
  const [alertOpen, setAlertOpen] = useState(false);

  // Calculate teams total from total expenses minus known categories
  const teamsTotal = stats.total.expenses - stats.total.commissionsTotal - stats.total.supplierPaymentsTotal - stats.total.costsTotal;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Riepilogo Uscite in Sospeso
          </CardTitle>
          <span className="text-lg font-bold text-destructive">
            {formatCurrency(stats.total.expenses)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <MiniStat
            icon={Building2}
            label="Squadre Esterne"
            amount={teamsTotal > 0 ? teamsTotal : 0}
            color="text-orange-500"
          />
          <MiniStat
            icon={UserCheck}
            label="Provvigioni"
            amount={stats.total.commissionsTotal}
            color="text-violet-500"
          />
          <MiniStat
            icon={Truck}
            label="Fornitori"
            amount={stats.total.supplierPaymentsTotal}
            color="text-indigo-500"
          />
          <MiniStat
            icon={Receipt}
            label="Costi Fissi"
            amount={costsSummary.fixedTotal}
            color="text-red-500"
          />
          <MiniStat
            icon={Receipt}
            label="Costi Variabili"
            amount={costsSummary.variableTotal}
            color="text-amber-500"
          />
        </div>

        {/* KPI Footer */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t text-sm">
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-destructive" />
            <span className="text-muted-foreground">Burn Rate:</span>
            <span className="font-medium text-destructive">{formatCurrency(cfoKpis.burnRate)}/mese</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Rapporto E/U:</span>
            <span className={`font-medium ${cfoKpis.ratio >= 1 ? "text-green-600" : "text-destructive"}`}>
              {cfoKpis.ratio.toFixed(2)}x
            </span>
          </div>
          {cfoKpis.overdueTotal > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {cfoKpis.overdueCount} scaduti ({formatCurrency(cfoKpis.overdueTotal)})
            </Badge>
          )}
        </div>

        {/* Pending Materials Alert */}
        {hasPendingMaterials && (
          <Collapsible open={alertOpen} onOpenChange={setAlertOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-sm text-amber-600 hover:text-amber-700 pt-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{pendingMaterialsCount} materiali pendenti ({formatCurrency(pendingMaterialsTotal)})</span>
              <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${alertOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 text-xs text-muted-foreground">
              Materiali da ordinare o già ordinati che rappresentano uscite future non ancora confermate.
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
