import { createContext, useContext, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface SummaryProps {
  label: string;
  title: ReactNode;
  icon: ElementType;
  children: ReactNode;
  columns?: 3 | 4;
  note?: ReactNode;
  embedded?: boolean;
  error?: boolean;
  /** Fascia bassa come il riepilogo di Commesse (25/11/2026): icona 28px, titolo 16px, cifre 16px,
   *  niente nota né etichetta in maiuscolo sopra il titolo. Le schede di /azienda/ordini la usano
   *  tutte, così passando da una all'altra il blu non cambia misura. */
  compatto?: boolean;
  /** Solo con `compatto` (25/11/2026, scheda Anomalie): da 1280px titolo a sinistra e riquadri a destra
   *  sulla stessa fascia, cifra e suggerimento sulla stessa riga. La nota resta per i lettori di schermo
   *  e nel suggerimento del titolo. */
  inLinea?: boolean;
  /** Indicatori su una fascia compatta, come l'anagrafica clienti. */
  fascia?: boolean;
}
const RiepilogoCompatto = createContext(false);
const RiepilogoInLinea = createContext(false);
const RiepilogoFascia = createContext(false);
/**
 * Shared navy summary, based on the Rapportini header. Business logic stays in each page.
 * Telefono (collaudo 23/11/2026): niente icona grande né nota, cifre a 16px e suggerimenti
 * nascosti — prima il riepilogo occupava ~260px prima dell'elenco. Tablet (fino a 1024): stessa
 * cura, senza icona, etichetta piccola né suggerimenti, cifre a 18px (segnalazione del founder).
 */
export function OperationalSummary({ label, title, icon: Icon, children, columns = 4, note, embedded, error, compatto, inLinea, fascia }: SummaryProps) {
  const t = useT();
  const linea = !!compatto && !!inLinea;
  const griglia = <div className={cn(compatto ? "mt-1.5 grid grid-cols-2 gap-1.5 max-sm:mt-0" : "mt-2.5 grid grid-cols-2 gap-2 max-sm:mt-0 lg:mt-3", columns === 3 ? "grid-cols-3" : compatto ? "lg:grid-cols-4" : "grid-cols-4 max-lg:gap-1.5", linea && "xl:mt-0 xl:min-w-0 xl:flex-1")}>{children}</div>;
  const avviso = <p role="alert" className="mt-3 rounded-xl border border-white/20 bg-white/10 p-3 text-sm">{t("Riepilogo non disponibile: verifica il caricamento dei dati e riprova.")}</p>;
  if (fascia) return <section aria-label={label} className={cn("rounded-xl bg-eic-navy-deep px-3 py-2 text-white", embedded && "rounded-none")}>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold" title={typeof note === "string" ? note : undefined}><Icon className="size-4" aria-hidden="true" />{title}</h2>
      <RiepilogoFascia.Provider value><RiepilogoCompatto.Provider value>{error ? avviso : <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">{children}</div>}</RiepilogoCompatto.Provider></RiepilogoFascia.Provider>
    </div>
    {note && <div className={typeof note === "string" ? "sr-only" : "mt-1 text-xs text-blue-100"}>{note}</div>}
  </section>;
  if (compatto) return <section aria-label={label} className={cn("bg-eic-navy-deep px-3 py-2 text-white", !embedded && "overflow-hidden rounded-2xl border border-white/10 shadow-sm", linea && "xl:flex xl:items-center xl:gap-3")}>
    <div className={cn("flex items-center gap-2.5 max-sm:hidden", linea && "xl:shrink-0")}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white"><Icon className="h-4 w-4" aria-hidden="true" /></div>
      <h2 className="shrink-0 text-base font-semibold text-white" title={linea && typeof note === "string" ? note : undefined}>{title}</h2>
      {/* La nota resta, piccola e sulla stessa riga, solo dove c'è posto. */}
      {note && <p className={cn("min-w-0 truncate text-xs text-blue-100/70", !error && "max-xl:hidden", linea && !error && "xl:sr-only")}>· {note}</p>}
    </div>
    <RiepilogoCompatto.Provider value><RiepilogoInLinea.Provider value={linea}>{error ? avviso : griglia}</RiepilogoInLinea.Provider></RiepilogoCompatto.Provider>
  </section>;
  return <section aria-label={label} className={cn("bg-eic-navy-deep p-3 text-white lg:p-4", !embedded && "overflow-hidden rounded-2xl border border-white/10 shadow-sm")}>
    <div className="flex items-start gap-2.5 max-sm:hidden lg:gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white max-lg:hidden"><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-orange-100 max-lg:hidden">{label}</p><h2 className="text-[15px] font-semibold text-white lg:mt-0.5 lg:text-lg">{title}</h2></div>
    </div>
    {note && <p className="mt-2 text-xs text-blue-100/80 max-lg:hidden">{note}</p>}
    {error ? avviso : griglia}
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
export function OperationalSummaryMetric({ label, value, hint, tone, icon: Icon, isLoading, active, onClick, className }: MetricProps) {
  const t = useT();
  const Element = onClick ? "button" : "div";
  const highlight = ["red", "amber", "orange"].includes(tone ?? "");
  const compatto = useContext(RiepilogoCompatto);
  const linea = useContext(RiepilogoInLinea);
  const fascia = useContext(RiepilogoFascia);
  return <Element {...(onClick ? { type: "button" as const, onClick, "aria-pressed": !!active, disabled: !!isLoading } : {})}
    aria-label={onClick && typeof label === "string" && (typeof value === "string" || typeof value === "number") ? `${label} ${isLoading ? t("in caricamento") : value}` : undefined}
    aria-busy={!!isLoading}
    title={fascia && typeof hint === "string" ? hint : undefined}
    className={cn("flex min-w-0 flex-col items-start justify-start border border-white/15 text-left", compatto ? "rounded-lg bg-white/[0.06] px-2.5 py-1.5" : "rounded-xl bg-white/10 p-2 lg:p-3", onClick && "transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-eic-navy-deep disabled:cursor-wait", active && "border-amber-300/70 bg-white/15 ring-1 ring-amber-300/40", linea && "xl:grid xl:grid-cols-[auto_minmax(0,1fr)] xl:items-baseline xl:gap-x-2 xl:py-1", fascia && "flex-row items-center gap-2 border-0 bg-transparent px-1 py-0.5", className)}>
    {fascia && Icon && <Icon className="size-4 shrink-0 text-blue-100" aria-hidden="true" />}
    <span className={cn("block font-semibold uppercase tracking-wide text-blue-100 max-sm:w-full max-sm:truncate max-sm:font-medium max-sm:normal-case max-sm:tracking-normal", compatto ? "text-[10px] sm:text-[11px]" : "text-[11px] lg:text-xs", linea && "xl:col-span-2", fascia && "w-auto text-sm font-normal normal-case tracking-normal sm:text-sm")}>{label}{" "}</span>
    {isLoading ? <span role="status" aria-label={t("Caricamento {nome}", { nome: typeof label === "string" ? label : t("indicatore") })} className={cn("block w-16 animate-pulse rounded bg-white/20", compatto ? "mt-0.5 h-5" : "mt-1 h-7")} /> : <span className={cn("block max-w-full break-words leading-tight tabular-nums text-white max-sm:whitespace-nowrap max-sm:text-[15px] max-sm:tracking-tight", compatto ? "mt-0.5 text-base font-semibold tracking-tight" : "mt-1 text-xl font-bold sm:text-lg lg:text-2xl", fascia && "mt-0 text-lg", highlight && "text-amber-300")}>{value}</span>}
    {hint && <span title={linea && typeof hint === "string" ? hint : undefined} className={cn("block text-[11px] leading-snug text-blue-100/80", compatto ? "leading-4 max-sm:hidden" : "mt-1 max-lg:hidden", linea && "xl:truncate", fascia && "sr-only")}>{hint}</span>}
  </Element>;
}
