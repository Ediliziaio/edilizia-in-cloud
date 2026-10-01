import { Check } from "lucide-react";
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
  return (
    <div className="space-y-3 border-b border-slate-200 pb-4">
      <nav
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      >
        {views.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-current={value === view.value ? "page" : undefined}
            onClick={() => onChange(view.value)}
            className={cn(
              "flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 sm:px-4",
              views.length % 2 !== 0 && view === views.at(-1) && "col-span-2",
              value === view.value
                ? "border-blue-950 bg-blue-950 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50",
            )}
          >
            {value === view.value && (
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {view.label}
          </button>
        ))}
      </nav>
      <p className="text-sm text-slate-600">
        {views.find((view) => view.value === value)?.description}
      </p>
    </div>
  );
}
