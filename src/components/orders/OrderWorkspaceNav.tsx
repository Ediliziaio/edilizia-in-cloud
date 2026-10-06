import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function OrderWorkspaceNav<T extends string>({
  label,
  views,
  value,
  onChange,
  counts,
}: {
  label: string;
  views: readonly { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Quanti elementi ha ogni vista («Diario 16»). Zero o ignoto: nessun numero. */
  counts?: Partial<Record<T, number | null | undefined>>;
}) {
  const isMobile = useIsMobile();
  // Telefono: la tendina basta, senza riga sotto né spazio in più (06/10/2026).
  if (isMobile) return <nav aria-label={label} className="min-h-0">
    <select aria-label={label} value={value} onChange={event => {
      const selected = views.find(view => view.value === event.target.value);
      if (selected) onChange(selected.value);
    }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
      {views.map(view => {
        const n = counts?.[view.value];
        return <option key={view.value} value={view.value}>{view.label}{typeof n === "number" && n > 0 ? ` (${n})` : ""}</option>;
      })}
    </select>
  </nav>;
  // Secondo livello: schede sottolineate, più leggere di quelle principali
  // (riquadro + arancio). Il livello si capisce dalla forma, non solo dal colore;
  // la descrizione sta sulla stessa riga e a destra, non su una riga a parte.
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-slate-200">
      {/* min-h-0: il CSS globale dà `nav { min-height: 64px }` e allungava le schede. */}
      <nav aria-label={label} className="-mb-px flex min-h-0 flex-wrap gap-x-1">
        {views.map((view) => {
          const n = counts?.[view.value];
          return (
            <button
              key={view.value}
              type="button"
              aria-current={value === view.value ? "page" : undefined}
              onClick={() => onChange(view.value)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600",
                value === view.value
                  ? "border-orange-500 text-blue-950"
                  : "border-transparent text-slate-600 hover:border-slate-300 hover:text-blue-950",
              )}
            >
              {view.label}
              {typeof n === "number" && n > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                  value === view.value ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600",
                )}>
                  <span className="sr-only">, </span>{n}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <p className="pb-2.5 text-xs text-slate-500">
        {views.find((view) => view.value === value)?.description}
      </p>
    </div>
  );
}
