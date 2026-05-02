import { useMemo } from "react";
import { AlertTriangle, CircleDot, Percent, Trophy, XCircle, Ban, Euro, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  opportunities: any[];
}

const STATS_CONFIG = [
  { key: "open", label: "Aperte", icon: CircleDot, colorClass: "border-l-blue-500 text-blue-600 dark:text-blue-400" },
  { key: "won", label: "Vinte", icon: Trophy, colorClass: "border-l-green-500 text-green-600 dark:text-green-400" },
  { key: "lost", label: "Perse", icon: XCircle, colorClass: "border-l-red-500 text-red-600 dark:text-red-400" },
  { key: "abandoned", label: "Abbandonate", icon: Ban, colorClass: "border-l-muted-foreground/50 text-muted-foreground" },
  { key: "pipeline_value", label: "Pipeline", icon: Euro, colorClass: "border-l-blue-500 text-blue-600 dark:text-blue-400" },
  { key: "weighted_value", label: "Ponderato", icon: Percent, colorClass: "border-l-violet-500 text-violet-600 dark:text-violet-400" },
  { key: "won_value", label: "Fatturato Vinto", icon: TrendingUp, colorClass: "border-l-green-500 text-green-600 dark:text-green-400" },
  { key: "stale", label: "Ferme >14gg", icon: AlertTriangle, colorClass: "border-l-amber-500 text-amber-600 dark:text-amber-400" },
] as const;

export function OpportunityStatsStrip({ opportunities }: Props) {
  const stats = useMemo(() => {
    let open = 0, won = 0, lost = 0, abandoned = 0, pipelineValue = 0, weightedValue = 0, wonValue = 0, stale = 0;
    const staleThreshold = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const o of opportunities) {
      const v = Number(o.value || 0);
      const probability = Math.max(0, Math.min(100, Number(o.probability ?? 50))) / 100;
      switch (o.status) {
        case "open":
          open++;
          pipelineValue += v;
          weightedValue += v * probability;
          {
            const lastTouched = new Date(o.stage_changed_at || o.updated_at || o.created_at || 0).getTime();
            if (lastTouched && lastTouched < staleThreshold) stale++;
          }
          break;
        case "won": won++; wonValue += v; break;
        case "lost": lost++; break;
        case "abandoned": abandoned++; break;
      }
    }
    return { open, won, lost, abandoned, pipeline_value: pipelineValue, weighted_value: weightedValue, won_value: wonValue, stale };
  }, [opportunities]);

  const fmt = (v: number, isCurrency: boolean) =>
    isCurrency ? formatCurrency(v) : String(v);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
      {STATS_CONFIG.map(({ key, label, icon: Icon, colorClass }) => {
        const isCurrency = key === "pipeline_value" || key === "weighted_value" || key === "won_value";
        const value = stats[key];
        return (
          <div
            key={key}
            className={`flex items-center gap-2 rounded-md border-l-2 bg-muted/30 px-2.5 py-1.5 ${colorClass.split(" ")[0]}`}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass.split(" ").slice(1).join(" ")}`} />
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight text-foreground truncate">
                {fmt(value, isCurrency)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
