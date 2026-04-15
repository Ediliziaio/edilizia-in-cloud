import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardWidget, ResolvedWidget } from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";
import { widgetLabel } from "@/lib/dashboardBuilder/widgetLabels";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

/** Ritorna un titolo leggibile: config.title → catalog name (se presente)
 *  → fallback amichevole per tipo. MAI esporre widget.id all'utente. */
function displayTitle(widget: DashboardWidget): string {
  const cfg = widget.config ?? {};
  if (cfg.title && cfg.title.trim()) return cfg.title.trim();
  if (cfg.metric) return cfg.metric;
  return widgetLabel(widget.type);
}

export function KpiCard({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = displayTitle(widget);
  const value = resolved?.status === "ok" ? resolved.value ?? null : null;
  const error = resolved?.status === "error" ? resolved.error : null;

  // Delta badge: opzionale. Cerchiamo un valore "previous" nei meta del resolved
  // (esposto dal backend quando compareTo è impostato). Fallback: nessun badge.
  const previous = (resolved?.meta as unknown as { previous_value?: number | null } | undefined)
    ?.previous_value;
  const showDelta =
    cfg.compareTo && cfg.compareTo !== "none" &&
    typeof value === "number" && typeof previous === "number" && previous !== 0;
  const deltaPct = showDelta ? ((value! - previous!) / Math.abs(previous!)) * 100 : null;
  const deltaDir: "up" | "down" | "flat" | null =
    deltaPct == null ? null : deltaPct > 0.5 ? "up" : deltaPct < -0.5 ? "down" : "flat";
  const DeltaIcon = deltaDir === "up" ? ArrowUpRight : deltaDir === "down" ? ArrowDownRight : Minus;
  const deltaLabel = cfg.compareTo === "prev_year" ? "vs anno" : "vs periodo";

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs uppercase text-muted-foreground tracking-wide truncate">
              {title}
            </p>
            {cfg.subtitle && (
              <p className="text-[11px] text-muted-foreground/70 truncate">{cfg.subtitle}</p>
            )}
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
        <div className={cn("mt-3 space-y-1.5", error && "text-destructive")}>
          {error ? (
            <p className="text-xs">Errore: {error}</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums leading-tight">
                {formatValue(value, cfg)}
              </p>
              {showDelta && deltaPct !== null && (
                <div
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md",
                    deltaDir === "up" && "bg-emerald-50 text-emerald-700",
                    deltaDir === "down" && "bg-rose-50 text-rose-700",
                    deltaDir === "flat" && "bg-muted text-muted-foreground",
                  )}
                >
                  <DeltaIcon className="h-3 w-3" />
                  {deltaPct > 0 ? "+" : ""}
                  {deltaPct.toFixed(1)}%
                  <span className="ml-1 text-muted-foreground/80 font-normal">{deltaLabel}</span>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
