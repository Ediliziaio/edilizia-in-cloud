import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Keep working tabs close to the top on phones; overview retains its numbers. */
export function OrderHeaderSummary({ compact, children }: { compact: boolean; children: ReactNode }) {
  if (!compact) return <>{children}</>;
  return <details className="group/header-summary rounded-lg border border-slate-200 bg-white">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 [&::-webkit-details-marker]:hidden">
      Numeri e stato commessa
      <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open/header-summary:rotate-180" />
    </summary>
    <div className="space-y-3 border-t border-slate-100 p-2">{children}</div>
  </details>;
}
