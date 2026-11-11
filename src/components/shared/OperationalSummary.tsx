import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SummaryProps {
  label: string;
  title: ReactNode;
  icon: ElementType;
  children: ReactNode;
  columns?: 3 | 4;
  note?: ReactNode;
  embedded?: boolean;
  error?: boolean;
}
/** Shared navy summary, based on the Rapportini header. Business logic stays in each page. */
export function OperationalSummary({ label, title, icon: Icon, children, columns = 4, note, embedded, error }: SummaryProps) {
  return <section aria-label={label} className={cn("bg-eic-navy-deep p-3 text-white sm:p-4", !embedded && "overflow-hidden rounded-2xl border border-white/10 shadow-sm")}>
    <div className="flex items-start gap-2.5 sm:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white"><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">{label}</p><h2 className="mt-0.5 text-base font-semibold text-white sm:text-lg">{title}</h2></div>
    </div>
    {note && <p className="mt-2 text-xs text-blue-100/80">{note}</p>}
    {error ? <p role="alert" className="mt-3 rounded-xl border border-white/20 bg-white/10 p-3 text-sm">Riepilogo non disponibile: verifica il caricamento dei dati e riprova.</p> : <div className={cn("mt-3 grid grid-cols-2 gap-2", columns === 3 ? "sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1" : "sm:grid-cols-4")}>{children}</div>}
  </section>;
}
interface MetricProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  icon?: ElementType;
  isLoading?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}
export function OperationalSummaryMetric({ label, value, hint, tone, isLoading, active, onClick, className }: MetricProps) {
  const Element = onClick ? "button" : "div";
  const highlight = ["red", "amber", "orange"].includes(tone ?? "");
  return <Element {...(onClick ? { type: "button" as const, onClick, "aria-pressed": !!active, disabled: !!isLoading } : {})}
    aria-label={onClick && typeof label === "string" && (typeof value === "string" || typeof value === "number") ? `${label} ${isLoading ? "in caricamento" : value}` : undefined}
    aria-busy={!!isLoading}
    className={cn("flex min-w-0 flex-col items-start justify-start rounded-xl border border-white/15 bg-white/10 p-2.5 text-left sm:p-3", onClick && "transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-eic-navy-deep disabled:cursor-wait", active && "border-amber-300/70 bg-white/15 ring-1 ring-amber-300/40", className)}>
    <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-100 sm:text-xs">{label}{" "}</span>
    {isLoading ? <span role="status" aria-label={`Caricamento ${typeof label === "string" ? label : "indicatore"}`} className="mt-1 block h-7 w-16 animate-pulse rounded bg-white/20" /> : <span className={cn("mt-1 block max-w-full break-words text-xl font-bold leading-tight tabular-nums text-white sm:text-2xl", highlight && "text-amber-300")}>{value}</span>}
    {hint && <span className="mt-1 block text-[11px] leading-snug text-blue-100/80">{hint}</span>}
  </Element>;
}
