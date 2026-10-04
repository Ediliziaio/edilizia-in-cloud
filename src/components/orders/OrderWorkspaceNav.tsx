import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function OrderWorkspaceNav<T extends string>({
  label,
  views,
  value,
  onChange,
}: {
  label: string;
  views: readonly { value: T; label: string; description: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return <nav aria-label={label} className="border-b border-slate-200 pb-2">
    <select aria-label={label} value={value} onChange={event => {
      const selected = views.find(view => view.value === event.target.value);
      if (selected) onChange(selected.value);
    }} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600">
      {views.map(view => <option key={view.value} value={view.value}>{view.label}</option>)}
    </select>
  </nav>;
  // Secondo livello: schede sottolineate, più leggere di quelle principali
  // (riquadro + arancio). Il livello si capisce dalla forma, non solo dal colore;
  // la descrizione sta sulla stessa riga e a destra, non su una riga a parte.
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-slate-200">
      {/* min-h-0: il CSS globale dà `nav { min-height: 64px }` e allungava le schede. */}
      <nav aria-label={label} className="-mb-px flex min-h-0 flex-wrap gap-x-1">
        {views.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-current={value === view.value ? "page" : undefined}
            onClick={() => onChange(view.value)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-t-md border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600",
              value === view.value
                ? "border-orange-500 text-blue-950"
                : "border-transparent text-slate-600 hover:border-slate-300 hover:text-blue-950",
            )}
          >
            {view.label}
          </button>
        ))}
      </nav>
      <p className="pb-2.5 text-xs text-slate-500">
        {views.find((view) => view.value === value)?.description}
      </p>
    </div>
  );
}
