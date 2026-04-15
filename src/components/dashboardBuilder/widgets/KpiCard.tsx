import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardWidget, ResolvedWidget } from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

export function KpiCard({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? widget.id;
  const value = resolved?.status === "ok" ? resolved.value ?? null : null;
  const error = resolved?.status === "error" ? resolved.error : null;

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="flex-1 flex flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-xs uppercase text-muted-foreground tracking-wide">{title}</p>
            {cfg.subtitle && (
              <p className="text-[11px] text-muted-foreground/70">{cfg.subtitle}</p>
            )}
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={cn("mt-3", error && "text-destructive")}>
          {error ? (
            <p className="text-xs">Errore: {error}</p>
          ) : (
            <p className="text-2xl font-semibold tabular-nums">{formatValue(value, cfg)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
