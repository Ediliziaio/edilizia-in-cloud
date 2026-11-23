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
/**
 * Shared navy summary, based on the Rapportini header. Business logic stays in each page.
 * Telefono (collaudo 23/11/2026): niente icona grande né nota, cifre a 16px e suggerimenti
 * nascosti — prima il riepilogo occupava ~260px prima dell'elenco. Tablet (fino a 1024): stessa
 * cura, senza icona, etichetta piccola né suggerimenti, cifre a 18px (segnalazione del founder).
 */
export function OperationalSummary({ label, title, icon: Icon, children, columns = 4, note, embedded, error }: SummaryProps) {
  return <section aria-label={label} className={cn("bg-eic-navy-deep p-3 text-white lg:p-4", !embedded && "overflow-hidden rounded-2xl border border-white/10 shadow-sm")}>
    <div className="flex items-start gap-2.5 max-sm:hidden lg:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white max-lg:hidden"><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-orange-100 max-lg:hidden">{label}</p><h2 className="text-[15px] font-semibold text-white lg:mt-0.5 lg:text-lg">{title}</h2></div>
    </div>
    {note && <p className="mt-2 text-xs text-blue-100/80 max-lg:hidden">{note}</p>}
    {error ? <p role="alert" className="mt-3 rounded-xl border border-white/20 bg-white/10 p-3 text-sm">Riepilogo non disponibile: verifica il caricamento dei dati e riprova.</p> : <div className={cn("mt-2.5 grid grid-cols-2 gap-2 max-sm:mt-0 lg:mt-3", columns === 3 ? "grid-cols-3" : "grid-cols-4 max-lg:gap-1.5")}>{children}</div>}
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
    className={cn("flex min-w-0 flex-col items-start justify-start rounded-xl border border-white/15 bg-white/10 p-2 text-left lg:p-3", onClick && "transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-eic-navy-deep disabled:cursor-wait", active && "border-amber-300/70 bg-white/15 ring-1 ring-amber-300/40", className)}>
    <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100 max-sm:w-full max-sm:truncate max-sm:font-medium max-sm:normal-case max-sm:tracking-normal lg:text-xs">{label}{" "}</span>
    {isLoading ? <span role="status" aria-label={`Caricamento ${typeof label === "string" ? label : "indicatore"}`} className="mt-1 block h-7 w-16 animate-pulse rounded bg-white/20" /> : <span className={cn("mt-1 block max-w-full break-words text-xl font-bold leading-tight tabular-nums text-white max-sm:whitespace-nowrap max-sm:text-[15px] max-sm:tracking-tight sm:text-lg lg:text-2xl", highlight && "text-amber-300")}>{value}</span>}
    {hint && <span className="mt-1 block text-[11px] leading-snug text-blue-100/80 max-lg:hidden">{hint}</span>}
  </Element>;
}
