import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Native disclosure: keyboard accessible and compatible with section deep links. */
export function OrderDisclosure({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className="group/order-disclosure rounded-xl border border-slate-300 bg-white scroll-mt-24"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2 text-blue-950 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 md:min-h-14 md:gap-3 md:px-4 md:py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {description && (
            <span className="mt-1 hidden text-xs text-slate-600 md:block">
              {description}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
          <span className="group-open/order-disclosure:hidden">Apri</span>
          <span className="hidden group-open/order-disclosure:inline">
            Chiudi
          </span>
          <ChevronDown
            className="h-4 w-4 transition-transform group-open/order-disclosure:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 p-3 sm:p-4">
        {children}
      </div>
    </details>
  );
}
