/**
 * Sprint C — Catalogo Esteso
 * Widget che mostra statistiche di consumo AI (solo admin, via RLS ai_usage_logs).
 */
import { useAiUsageStats } from "@/hooks/useAiUsageStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function AiUsageWidget({ days = 30 }: { days?: number }) {
  const { data, isLoading, error } = useAiUsageStats(days);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Consumo AI
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Consumo AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Dati non disponibili</p>
        </CardContent>
      </Card>
    );
  }

  const euro = (data.totalCostCentsMonth / 100).toFixed(4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Consumo AI ({days}gg)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Chiamate" value={data.totalCallsMonth.toString()} />
          <Stat label="Token" value={data.totalTokensMonth.toLocaleString()} />
          <Stat label="Costo" value={`${euro} €`} />
        </div>

        {Object.keys(data.callsByFunction).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Per function</div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.callsByFunction).map(([fn, n]) => (
                <Badge key={fn} variant="secondary" className="text-[10px]">
                  {fn}: {n}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {data.lastCalls.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-auto">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ultime</div>
            {data.lastCalls.slice(0, 5).map((c) => (
              <div key={c.id} className="text-[11px] flex items-center justify-between border-b last:border-0 py-1">
                <span className="truncate max-w-[60%]">{c.function_name}</span>
                <span className="text-muted-foreground">
                  {format(new Date(c.created_at), "d MMM HH:mm", { locale: it })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
