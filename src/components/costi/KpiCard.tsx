/**
 * KpiCard — il riquadro statistica della sezione Costi.
 *
 * Nato nella tab Personale, ora condiviso con Spese fisse e Spese variabili
 * così le tre schede parlano la stessa lingua visiva: barretta colorata a
 * sinistra, etichetta maiuscola, numero grande, sottotitolo. Con `onClick`
 * diventa un filtro cliccabile (e `active` accende l'anello).
 */
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  onClick,
  active = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const inner = (
    <>
      <div className={cn("absolute inset-y-0 left-0 w-1", accent)} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </>
  );

  const baseClass = "relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/80 p-3 shadow-sm";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          baseClass,
          "text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
          active && "ring-2 ring-orange-400",
        )}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}
