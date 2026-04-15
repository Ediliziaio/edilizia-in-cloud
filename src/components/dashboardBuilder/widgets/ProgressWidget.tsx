import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DashboardWidget, ResolvedWidget } from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

export function ProgressWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? widget.id;
  const value = resolved?.status === "ok" ? resolved.value ?? 0 : 0;
  const target = cfg.target ?? 100;
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  const error = resolved?.status === "error" ? resolved.error : null;

  return (
    <Card className="h-full flex flex-col">
      <CardContent className="p-4 flex-1 flex flex-col justify-center gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{title}</span>
          <span className="tabular-nums">
            {formatValue(value, cfg)} / {formatValue(target, cfg)}
          </span>
        </div>
        <Progress value={pct} />
        <div className="text-[11px] text-muted-foreground text-right">
          {pct.toFixed(0)}%
        </div>
        {error && <p className="text-xs text-destructive">Errore: {error}</p>}
      </CardContent>
    </Card>
  );
}

export function GaugeWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? widget.id;
  const value = resolved?.status === "ok" ? resolved.value ?? 0 : 0;
  const min = cfg.min ?? 0;
  const max = cfg.max ?? cfg.target ?? 100;
  const range = max - min;
  const pct = range > 0 ? Math.min(100, Math.max(0, ((value - min) / range) * 100)) : 0;

  // Color based on thresholds
  const color =
    pct >= 80
      ? "text-emerald-500"
      : pct >= 50
      ? "text-amber-500"
      : "text-red-500";

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <Card className="h-full flex flex-col items-center justify-center p-4">
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      <div className="relative">
        <svg viewBox="0 0 120 120" className="w-32 h-32">
          <circle
            cx={60}
            cy={60}
            r={45}
            stroke="hsl(var(--muted))"
            strokeWidth={10}
            fill="none"
          />
          <circle
            cx={60}
            cy={60}
            r={45}
            stroke="currentColor"
            className={color}
            strokeWidth={10}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">
            {formatValue(value, cfg)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            / {formatValue(max, cfg)}
          </span>
        </div>
      </div>
    </Card>
  );
}
