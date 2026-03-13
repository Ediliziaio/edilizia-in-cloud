import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Timer, Zap, Clock, AlertTriangle } from "lucide-react";
import type { VendorKPI } from "@/hooks/useVendorReport";

interface Props { kpi: VendorKPI | null; isLoading: boolean; }

export function TempisticheScorecard({ kpi, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-20 mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const avg = kpi?.avg_giorni_chiusura ?? 0;
  const avgPersi = kpi?.avg_giorni_chiusura_perse ?? 0;

  const velocita = avg <= 0
    ? { label: "N/D", color: "text-muted-foreground", Icon: Clock }
    : avg < 20
      ? { label: "Rapido", color: "text-green-600 dark:text-green-400", Icon: Zap }
      : avg < 45
        ? { label: "Nella media", color: "text-blue-600 dark:text-blue-400", Icon: Clock }
        : { label: "Lento", color: "text-amber-600 dark:text-amber-400", Icon: AlertTriangle };

  const details = [
    { label: "Più veloce chiusura", value: `${kpi?.min_giorni_chiusura ?? 0}gg`, color: "text-green-600" },
    { label: "Chiusura più lenta", value: `${kpi?.max_giorni_chiusura ?? 0}gg`, color: "text-red-500" },
    { label: "Media opp. PERSE", value: `${avgPersi}gg`, color: "text-muted-foreground" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" />
          Ciclo di Vendita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valore prominente */}
        <div className="text-center space-y-1">
          <p className="text-3xl font-bold">{avg}gg</p>
          <p className="text-xs text-muted-foreground">Media chiusura opportunità VINTE</p>
          <span className={`inline-flex items-center gap-1 text-sm font-medium ${velocita.color}`}>
            <velocita.Icon className="h-3.5 w-3.5" />
            {velocita.label}
          </span>
        </div>

        {/* Dettagli */}
        <div className="space-y-2 pt-2 border-t">
          {details.map(({ label, value, color }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-medium ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Insight */}
        {avgPersi > 0 && avg > 0 && avgPersi < avg * 0.7 && (
          <div className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-md p-2.5 mt-2">
            ⚠️ Le opportunità perse si chiudono prima di quelle vinte: potenziale problema di qualificazione lead.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
