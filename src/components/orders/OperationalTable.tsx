import { useState, type ReactNode } from "react";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { cn } from "@/lib/utils";

/** The list view stays tabular at every width; narrow screens scroll inside the table. */
export function OperationalTable({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <BarraScorrimentoOrizzontale
        contenitore={container}
        className="mx-3 my-2"
      />
      <div
        ref={setContainer}
        role="region"
        aria-label={`Scorri ${label.toLowerCase()}`}
        tabIndex={0}
        className="max-h-[70vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <table
          aria-label={label}
          className={cn(
            "w-full min-w-[960px] text-left text-sm [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-slate-50 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-r [&_th]:border-slate-200 [&_th]:px-3 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:text-slate-600 [&_th:last-child]:border-r-0 [&_td]:border-b [&_td]:border-r [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:whitespace-nowrap [&_td:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-slate-50/80 [&_tbody_tr:focus-within]:bg-blue-50/40",
            className,
          )}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
