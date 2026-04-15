/**
 * AlertListWidget — lista compatta di "voci di attenzione".
 *
 * Pensato per riprodurre le sezioni "ALERTS / TODO" del cruscotto Executive:
 * ogni riga ha un bordo sinistro colorato (success/warning/danger), un'icona
 * tonda, label + valore, e opzionalmente un link azione in fondo.
 *
 * Sorgente dati: il breakdown del resolver. Le righe vengono tonalizzate in
 * base alla quota relativa rispetto al valore massimo (top decile = danger,
 * top quartile = warning, resto = info), oppure tutte forzate a `cfg.tone`.
 *
 * Quando il widget non ha breakdown, mostra un singolo "stato" basato su
 * value vs target → success / warning / danger.
 */
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  BreakdownRow,
  DashboardWidget,
  ResolvedWidget,
  WidgetTone,
} from "@/lib/dashboardBuilder/types";
import { formatValue } from "../formatValue";
import { widgetLabel } from "@/lib/dashboardBuilder/widgetLabels";

interface Props {
  widget: DashboardWidget;
  resolved: ResolvedWidget | undefined;
}

const TONE_PALETTE: Record<
  WidgetTone,
  { border: string; icon: string; iconBg: string; text: string }
> = {
  success: {
    border: "border-l-emerald-500",
    icon: "text-emerald-600",
    iconBg: "bg-emerald-50",
    text: "text-emerald-700",
  },
  warning: {
    border: "border-l-amber-500",
    icon: "text-amber-600",
    iconBg: "bg-amber-50",
    text: "text-amber-700",
  },
  danger: {
    border: "border-l-rose-500",
    icon: "text-rose-600",
    iconBg: "bg-rose-50",
    text: "text-rose-700",
  },
  info: {
    border: "border-l-sky-500",
    icon: "text-sky-600",
    iconBg: "bg-sky-50",
    text: "text-sky-700",
  },
  neutral: {
    border: "border-l-muted-foreground/40",
    icon: "text-muted-foreground",
    iconBg: "bg-muted",
    text: "text-foreground",
  },
};

function ToneIcon({ tone, className }: { tone: WidgetTone; className?: string }) {
  switch (tone) {
    case "success":
      return <CheckCircle2 className={className} />;
    case "warning":
    case "danger":
      return <AlertTriangle className={className} />;
    default:
      return <Info className={className} />;
  }
}

function deriveRowTone(value: number, max: number, explicit?: WidgetTone): WidgetTone {
  if (explicit) return explicit;
  if (max <= 0) return "neutral";
  const ratio = value / max;
  if (ratio >= 0.75) return "danger";
  if (ratio >= 0.4) return "warning";
  return "info";
}

function displayTitle(widget: DashboardWidget): string {
  const cfg = widget.config ?? {};
  if (cfg.title?.trim()) return cfg.title.trim();
  if (cfg.metric) return cfg.metric;
  return widgetLabel(widget.type);
}

export function AlertListWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = displayTitle(widget);
  const error = resolved?.status === "error" ? resolved.error : null;
  const rows: BreakdownRow[] =
    resolved?.status === "ok" ? resolved.breakdown ?? [] : [];
  const totalValue = resolved?.status === "ok" ? resolved.value ?? 0 : 0;
  const max = rows.reduce((acc, r) => Math.max(acc, r.value ?? 0), 0);

  // Modalità "sintesi" quando non c'è breakdown ma sì un valore singolo.
  const summaryMode = rows.length === 0 && resolved?.status === "ok";
  const summaryTone: WidgetTone =
    cfg.tone ??
    (cfg.target == null
      ? "info"
      : totalValue >= cfg.target
        ? "success"
        : totalValue >= cfg.target / 2
          ? "warning"
          : "danger");

  return (
    <Card className="h-full flex flex-col overflow-hidden shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold text-foreground/90 truncate">
          {title}
        </CardTitle>
        {cfg.subtitle && (
          <p className="text-[11px] text-muted-foreground truncate">
            {cfg.subtitle}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 p-3 pt-0 overflow-auto space-y-1.5 min-h-0">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-[11px] text-destructive/90 leading-snug line-clamp-3">
              {error}
            </p>
          </div>
        ) : summaryMode ? (
          <SummaryRow
            tone={summaryTone}
            label={cfg.statusLabel ?? cfg.description ?? "Stato attuale"}
            value={formatValue(totalValue, cfg)}
          />
        ) : rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 px-4 py-6 text-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              {cfg.statusLabel ?? "Nessun alert nel periodo"}
            </p>
          </div>
        ) : (
          rows.map((row) => {
            const tone = deriveRowTone(row.value ?? 0, max, cfg.tone);
            const palette = TONE_PALETTE[tone];
            return (
              <div
                key={row.key}
                className={cn(
                  "flex items-center gap-3 rounded-md border-l-4 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2",
                  palette.border,
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 shrink-0 rounded-full flex items-center justify-center",
                    palette.iconBg,
                  )}
                  aria-hidden
                >
                  <ToneIcon
                    tone={tone}
                    className={cn("h-3.5 w-3.5", palette.icon)}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{row.label}</p>
                </div>
                <span
                  className={cn(
                    "tabular-nums text-xs font-semibold shrink-0",
                    palette.text,
                  )}
                >
                  {formatValue(row.value, cfg)}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
      {cfg.actionHref && cfg.actionLabel && (
        <div className="border-t px-3 py-2 shrink-0">
          <a
            href={cfg.actionHref}
            target={cfg.actionHref.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            {cfg.actionLabel}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      )}
    </Card>
  );
}

function SummaryRow({
  tone,
  label,
  value,
}: {
  tone: WidgetTone;
  label: string;
  value: string;
}) {
  const palette = TONE_PALETTE[tone];
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border-l-4 bg-muted/20 px-3 py-3",
        palette.border,
      )}
    >
      <div
        className={cn(
          "w-8 h-8 shrink-0 rounded-full flex items-center justify-center",
          palette.iconBg,
        )}
        aria-hidden
      >
        <ToneIcon tone={tone} className={cn("h-4 w-4", palette.icon)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{label}</p>
      </div>
      <span
        className={cn(
          "tabular-nums text-sm font-bold shrink-0",
          palette.text,
        )}
      >
        {value}
      </span>
    </div>
  );
}
