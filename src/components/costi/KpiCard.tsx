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
import { PillolaVariazione } from "@/components/charts/grafici/comune";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  onClick,
  active = false,
  variazione,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  accent: string;
  onClick?: () => void;
  active?: boolean;
  /** Pillola della variazione accanto al numero (es. sull'anno prima). */
  variazione?: { pct: number | null; piuEMeglio?: boolean; neutra?: boolean; nota?: string };
}) {
  const inner = (
    <>
      <div className={cn("absolute inset-y-0 left-0 w-1", accent)} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
        {variazione && (
          <PillolaVariazione pct={variazione.pct} piuEMeglio={variazione.piuEMeglio} neutra={variazione.neutra} titolo={variazione.nota} />
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </>
  );

  // 14/11/2026: colori del tema (anche scuro) ed entrata dal basso.
  const baseClass = "relative overflow-hidden rounded-xl border bg-gradient-to-br from-card to-muted/40 p-3 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500 motion-safe:fill-mode-both";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          baseClass,
          "text-left transition-all hover:border-primary/30 hover:shadow-md motion-safe:hover:-translate-y-0.5",
          active && "ring-2 ring-orange-400",
        )}
      >
        {inner}
      </button>
    );
  }
  return <div className={baseClass}>{inner}</div>;
}

/**
 * NavyStatCard — la card "in vetro" della testata blu navy (stile Riepilogo
 * commesse), condivisa da Spese fisse, Spese variabili e Personale.
 * Con `onClick` filtra (anello arancio quando attiva).
 */
export function NavyStatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "text-blue-100",
  onClick,
  active = false,
  variazione,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: LucideIcon;
  /** Colore dell'icona sul navy (es. text-orange-300 per gli allarmi). */
  tone?: string;
  onClick?: () => void;
  active?: boolean;
  /** Pillola della variazione accanto al numero (es. sull'anno prima). */
  variazione?: { pct: number | null; piuEMeglio?: boolean; neutra?: boolean; nota?: string };
}) {
  const inner = (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* L'icona solo da 1024 px: sotto, i tre riquadri affiancati non avevano spazio per la cifra. */}
      <span className={cn("hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 lg:flex", tone)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-100 sm:text-[11px]">{label}</span>
        {/* 15/11/2026: la pillola va a capo invece di tagliare la cifra («263.0…»). */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="block whitespace-nowrap text-base font-semibold tabular-nums tracking-tight text-white">{value}</span>
          {variazione && (
            <PillolaVariazione pct={variazione.pct} piuEMeglio={variazione.piuEMeglio} neutra={variazione.neutra} titolo={variazione.nota} suScuro className="shrink-0" />
          )}
        </span>
        {sub && <span className="block text-[11px] leading-4 text-blue-50/70">{sub}</span>}
      </span>
    </div>
  );
  // Compatto come i riquadri del riepilogo di Commesse (25/11/2026): cifre a 16px, riquadro basso.
  const base = "rounded-lg border border-white/12 bg-white/9 px-2.5 py-1.5";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(base, "text-left transition-colors hover:bg-white/15", active && "ring-2 ring-orange-400")}
      >
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}
