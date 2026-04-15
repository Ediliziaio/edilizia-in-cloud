/**
 * StatTileWidget — card di stato con sfondo tintato.
 *
 * Stile ispirato ai tile "CASSA / LAVORO / INCASSI" dell'home dashboard:
 *   ● dot colorato + LABEL uppercase piccola
 *   • valore grande tabular-nums
 *   • descrizione/status sotto
 *
 * Il tono è controllato da `cfg.tone` (success / warning / danger / info /
 * neutral). In assenza di tono esplicito prova a dedurlo da `cfg.target`
 * (value ≥ target → success, value < target/2 → danger, altrimenti warning).
 */
import { Wallet, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
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

// ─── Palette per tono ──────────────────────────────────────────────
// Usa token semantici + fallback Tailwind: restiamo robusti al theme switch.
const TONE_CLASSES: Record<
  WidgetTone,
  { bg: string; text: string; dot: string; icon: string; border: string }
> = {
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-900",
    dot: "bg-emerald-500",
    icon: "text-emerald-600",
    border: "border-emerald-100",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-900",
    dot: "bg-amber-500",
    icon: "text-amber-600",
    border: "border-amber-100",
  },
  danger: {
    bg: "bg-rose-50",
    text: "text-rose-900",
    dot: "bg-rose-500",
    icon: "text-rose-600",
    border: "border-rose-100",
  },
  info: {
    bg: "bg-sky-50",
    text: "text-sky-900",
    dot: "bg-sky-500",
    icon: "text-sky-600",
    border: "border-sky-100",
  },
  neutral: {
    bg: "bg-muted/50",
    text: "text-foreground",
    dot: "bg-muted-foreground",
    icon: "text-muted-foreground",
    border: "border-border",
  },
};

function deriveTone(
  cfg: NonNullable<DashboardWidget["config"]>,
  value: number | null,
): WidgetTone {
  if (cfg.tone) return cfg.tone;
  if (value == null || !cfg.target) return "neutral";
  const ratio = value / cfg.target;
  if (ratio >= 1) return "success";
  if (ratio >= 0.5) return "warning";
  return "danger";
}

function displayTitle(widget: DashboardWidget): string {
  const cfg = widget.config ?? {};
  if (cfg.title && cfg.title.trim()) return cfg.title.trim();
  if (cfg.metric) return cfg.metric;
  return widgetLabel(widget.type);
}

export function StatTileWidget({ widget, resolved }: Props) {
  const cfg = widget.config ?? {};
  const title = displayTitle(widget);
  const value = resolved?.status === "ok" ? resolved.value ?? null : null;
  const error = resolved?.status === "error" ? resolved.error : null;
  const tone = deriveTone(cfg, value);
  const palette = TONE_CLASSES[tone];

  // Description: priorità a cfg.description, poi subtitle, poi statusLabel.
  const description =
    cfg.description ?? cfg.subtitle ?? cfg.statusLabel ?? undefined;

  return (
    <div
      className={cn(
        "h-full w-full rounded-xl border p-4 flex flex-col justify-center gap-1.5 shadow-sm",
        palette.bg,
        palette.border,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            error ? "bg-rose-500" : palette.dot,
          )}
          aria-hidden
        />
        {/* Icona opzionale a destra del dot (wallet di default, alert su errore) */}
        {error ? (
          <AlertTriangle className={cn("h-3.5 w-3.5", palette.icon)} />
        ) : (
          <Wallet className={cn("h-3.5 w-3.5", palette.icon)} />
        )}
        <p
          className={cn(
            "text-[11px] uppercase font-semibold tracking-wider truncate",
            palette.text,
          )}
        >
          {title}
        </p>
      </div>
      {error ? (
        <p className="text-xs text-rose-700 line-clamp-2 leading-snug">
          {error}
        </p>
      ) : (
        <>
          <p
            className={cn(
              "text-xl font-bold tabular-nums tracking-tight leading-tight",
              palette.text,
            )}
          >
            {formatValue(value, cfg)}
          </p>
          {description && (
            <p className={cn("text-[11px] leading-snug opacity-80", palette.text)}>
              {description}
            </p>
          )}
        </>
      )}
    </div>
  );
}
