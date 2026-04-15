/**
 * ProgressWidget + GaugeWidget
 *
 * Progress: barra orizzontale con valore / target + percentuale a destra.
 * Gauge:    ring SVG circolare con big number al centro + statusLabel /
 *           description sotto (stile "98/100 Eccellente" del cruscotto home).
 *
 * Entrambi derivano il colore dal tono (`cfg.tone`) oppure dal rapporto
 * value/target. Threshold di default: ≥100% success, ≥50% warning, <50% danger.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  DashboardWidget,
  ResolvedWidget,
  WidgetTone,
} from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

// ─── Derivazione tono da soglia ────────────────────────────────────
function deriveTone(pct: number, explicit?: WidgetTone): WidgetTone {
  if (explicit) return explicit;
  if (pct >= 100) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}

const TONE_COLOR: Record<WidgetTone, { stroke: string; text: string }> = {
  success: { stroke: "rgb(16 185 129)", text: "text-emerald-600" },
  warning: { stroke: "rgb(245 158 11)", text: "text-amber-500" },
  danger: { stroke: "rgb(239 68 68)", text: "text-rose-500" },
  info: { stroke: "rgb(14 165 233)", text: "text-sky-500" },
  neutral: { stroke: "hsl(var(--primary))", text: "text-primary" },
};

// ─── Progress widget ──────────────────────────────────────────────
export function ProgressWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? "Progress";
  const value = resolved?.status === "ok" ? resolved.value ?? 0 : 0;
  const target = cfg.target ?? 100;
  const pct =
    target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  const error = resolved?.status === "error" ? resolved.error : null;
  const tone = deriveTone(pct, cfg.tone);

  return (
    <Card className="h-full flex flex-col shadow-sm">
      <CardContent className="p-4 flex-1 flex flex-col justify-center gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </span>
          <span className="tabular-nums font-semibold">
            {formatValue(value, cfg)} /{" "}
            <span className="text-muted-foreground font-normal">
              {formatValue(target, cfg)}
            </span>
          </span>
        </div>
        <Progress value={pct} />
        <div className="flex items-center justify-between text-[11px]">
          <span className={cn("font-medium", TONE_COLOR[tone].text)}>
            {cfg.statusLabel ??
              (tone === "success"
                ? "Obiettivo raggiunto"
                : tone === "warning"
                  ? "In linea"
                  : "Sotto target")}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {pct.toFixed(0)}%
          </span>
        </div>
        {error && (
          <p className="text-xs text-destructive line-clamp-2">Errore: {error}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Gauge widget (ring circolare grande) ──────────────────────────
export function GaugeWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = cfg.title ?? cfg.metric ?? "Gauge";
  const value = resolved?.status === "ok" ? resolved.value ?? 0 : 0;
  const min = cfg.min ?? 0;
  const max = cfg.max ?? cfg.target ?? 100;
  const range = max - min;
  const pct =
    range > 0 ? Math.min(100, Math.max(0, ((value - min) / range) * 100)) : 0;
  const error = resolved?.status === "error" ? resolved.error : null;

  const tone = deriveTone(pct, cfg.tone);
  const color = TONE_COLOR[tone];

  // Status label defaults per tono
  const statusLabel =
    cfg.statusLabel ??
    (tone === "success"
      ? "Eccellente"
      : tone === "warning"
        ? "Attenzione"
        : tone === "danger"
          ? "Critico"
          : "—");

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <Card className="h-full flex shadow-sm overflow-hidden">
      <CardContent className="flex-1 flex items-center gap-4 p-4 min-w-0">
        {/* Ring a sinistra, sempre visibile */}
        <div className="relative shrink-0">
          <svg viewBox="0 0 120 120" className="w-24 h-24 -rotate-90">
            <circle
              cx={60}
              cy={60}
              r={radius}
              stroke="hsl(var(--muted))"
              strokeWidth={10}
              fill="none"
            />
            <circle
              cx={60}
              cy={60}
              r={radius}
              stroke={color.stroke}
              strokeWidth={10}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums leading-none">
              {Math.round(value)}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
              /{Math.round(max)}
            </span>
          </div>
        </div>

        {/* Block a destra: status + label */}
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground truncate">
            {title}
          </p>
          {error ? (
            <p className="text-xs text-rose-700 line-clamp-2">Errore: {error}</p>
          ) : (
            <>
              <p className={cn("text-base font-bold truncate", color.text)}>
                {statusLabel}
              </p>
              {cfg.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-3 leading-snug">
                  {cfg.description}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
