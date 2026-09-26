import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Timer, Zap, Clock, AlertTriangle } from "lucide-react";
import type { VendorKPI } from "@/hooks/useVendorReport";
import { giorniTesto, semaforoVenditori } from "@/lib/reporting/venditoriRegole";

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
  const vinte = kpi?.opp_vinte ?? 0;
  const perse = kpi?.opp_perse ?? 0;

  // Stesse soglie della scheda «Ciclo Vendita Medio» (erano 20/45 qui e 30/60 là).
  const semaforo = vinte > 0 ? semaforoVenditori("avg_giorni_chiusura", Math.max(avg, 0.1)) : null;
  const velocita = semaforo === "buono"
    ? { label: "Rapido", color: "text-green-600 dark:text-green-400", Icon: Zap }
    : semaforo === "medio"
      ? { label: "Nella media", color: "text-blue-600 dark:text-blue-400", Icon: Clock }
      : semaforo === "critico"
        ? { label: "Lento", color: "text-amber-600 dark:text-amber-400", Icon: AlertTriangle }
        : { label: "Nessuna vendita nel periodo", color: "text-muted-foreground", Icon: Clock };

  const details = [
    { label: "Più veloce chiusura", value: giorniTesto(kpi?.min_giorni_chiusura, vinte > 0), color: "text-green-600" },
    { label: "Chiusura più lenta", value: giorniTesto(kpi?.max_giorni_chiusura, vinte > 0), color: "text-red-500" },
    { label: "Media opp. PERSE", value: giorniTesto(avgPersi, perse > 0), color: "text-muted-foreground" },
  ];

  // Telefono: il ciclo medio è già nei numeri in alto; il dettaglio resta al computer.
  return (
    <Card className="max-sm:hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" />
          Ciclo di Vendita
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Valore prominente */}
        <div className="text-center space-y-1">
          <p className="text-3xl font-bold">{giorniTesto(avg, vinte > 0)}</p>
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
        {perse > 0 && vinte > 0 && avgPersi < avg * 0.7 && (
          <div className="text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-md p-2.5 mt-2">
            ⚠️ Le opportunità perse si chiudono prima di quelle vinte: potenziale problema di qualificazione lead.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
