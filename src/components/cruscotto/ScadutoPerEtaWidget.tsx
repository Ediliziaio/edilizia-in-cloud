import { useNavigate } from "react-router-dom";
import { ArrowRight, Hourglass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { ScadutoPerEta } from "@/hooks/useCruscottoData";

/**
 * Lo scaduto da incassare (lo stesso numero in cima alla pagina) diviso per
 * età. 325.000 € scaduti da una settimana e scaduti da sei mesi sono due
 * problemi diversi: il primo è un sollecito, il secondo un credito a rischio.
 */
export function ScadutoPerEtaWidget({ scaduto, isLoading }: { scaduto: ScadutoPerEta; isLoading: boolean }) {
  const navigate = useNavigate();
  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (scaduto.rate === 0) return null;

  const colori = ["bg-amber-300", "bg-orange-400", "bg-red-400", "bg-red-600"];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <Hourglass className="h-4 w-4 text-muted-foreground" />
          Scaduto per età
          <span className="basis-full text-xs font-normal text-muted-foreground sm:ml-auto sm:basis-auto">
            {formatCurrency(scaduto.totale)} · {scaduto.rate} {scaduto.rate === 1 ? "rata" : "rate"}
            {scaduto.ritardoMedio !== null && <> · ritardo medio {scaduto.ritardoMedio} gg</>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
          {scaduto.fasce.map((f, i) => f.importo > 0 && (
            <div key={f.etichetta} className={colori[i]} style={{ width: `${(f.importo / scaduto.totale) * 100}%` }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {scaduto.fasce.map((f, i) => (
            <div key={f.etichetta} className={cn("rounded-lg border border-slate-200 px-3 py-2", i === 3 && f.importo > 0 && "border-red-200 bg-red-50/60")}>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <span className={cn("h-2 w-2 rounded-full", colori[i])} />
                {f.etichetta}
              </div>
              <div className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(f.importo)}</div>
              <div className="text-[11px] text-muted-foreground">{f.rate} {f.rate === 1 ? "rata" : "rate"}</div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => navigate("/azienda/scadenzario")}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Apri lo scadenzario <ArrowRight className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  );
}
