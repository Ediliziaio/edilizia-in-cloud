import { useId, useState } from "react";
import { CheckCircle2, ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  checks: ReadonlyArray<{ label: string; done: boolean }>;
}

/** Una sola riga su mobile; i singoli controlli si aprono su richiesta. */
export function CreateOrderChecklist({ checks }: Props) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const missing = checks.filter((check) => !check.done).length;
  const summary = missing ? `${missing} da completare` : "Tutto pronto";
  return (
    <section aria-label="Controlli commessa" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 md:p-4">
      <button
        type="button"
        aria-label={`Controlli commessa: ${summary}`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full min-w-0 items-center gap-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 md:hidden"
      >
        <CheckCircle2 aria-hidden="true" className={cn("h-4 w-4 shrink-0", missing ? "text-slate-500" : "text-emerald-600")} />
        <span className="min-w-0 flex-1 font-medium text-slate-900">Controlli</span>
        <span className={cn("shrink-0 text-xs", missing ? "text-amber-700" : "text-emerald-700")}>{summary}</span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-slate-500", expanded && "rotate-180")} />
      </button>
      <div className="hidden items-center gap-2 md:flex">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-600" />
        <h2 className="text-sm font-medium text-slate-900">Controlli commessa</h2>
        <span className="ml-auto text-xs text-slate-500">{summary}</span>
      </div>
      <ul id={detailsId} className={cn("border-t border-slate-100 pb-2 pt-2 md:mt-3 md:flex md:flex-wrap md:gap-2 md:border-0 md:p-0", !expanded && "hidden")}>
        {checks.map((check) => (
          <li key={check.label} className={cn("flex min-w-0 items-center gap-2 py-1.5 text-xs md:rounded-full md:border md:px-2 md:py-1", check.done ? "md:border-emerald-200 md:bg-emerald-50" : "md:border-amber-200 md:bg-amber-50")}>
            {check.done
              ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              : <Circle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
            <span className="min-w-0 flex-1 text-slate-700">{check.label}</span>
            <span className={cn("shrink-0", check.done ? "text-emerald-700" : "text-amber-700")}>{check.done ? "OK" : "Da fare"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
