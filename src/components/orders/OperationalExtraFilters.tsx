import type { ReactNode } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
export function OperationalExtraFilters({ count = 0, children }: { count?: number; children: ReactNode }) {
  return <details className="group border-t border-slate-100 pt-2">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />Altri filtri
      {count > 0 && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-800">{count} attivi</span>}
      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-3 pt-3 [&_select]:max-w-full">{children}</div>
  </details>;
}
