import { Children, useState, type ReactNode } from "react";
import { Info, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

export function OrdersSummaryCard({ id, title, value, note, icon: Icon, loading, ring, info, alternateValue, children }: {
  id: string; title: string; value: string; note: string; icon: LucideIcon; loading: boolean;
  ring?: { value: number; label: string; color: "green" | "amber" };
  info?: string;
  alternateValue?: string;
  children?: ReactNode;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const details = Children.toArray(children);
  const circle = 2 * Math.PI * 23;
  return <section data-riquadro={id} aria-label={title} aria-busy={loading || undefined} className="min-w-0 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5">
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 items-center justify-center text-orange-100"><Icon className="h-3.5 w-3.5" /></span>
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-blue-100 sm:text-[11px]">{title}</h3>
    </div>
    <div className="mt-0.5 flex items-center justify-between gap-2">
      <div className="min-w-0">
        {loading ? <Skeleton className="h-7 w-24 bg-white/20" /> : info ? <Tooltip open={infoOpen} onOpenChange={setInfoOpen}>
          <TooltipTrigger asChild><button type="button" onClick={() => setInfoOpen(open => !open)} aria-label={`Note su ${title}`} className="inline-flex max-w-full items-center gap-1.5 rounded text-left text-base font-semibold tabular-nums tracking-tight text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
            <span className="break-words">{value}</span><Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-blue-200/80" />
          </button></TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-xs font-normal leading-5">{info}</TooltipContent>
        </Tooltip> : <p className="break-words text-base font-semibold tabular-nums tracking-tight text-white">{value}</p>}
        <div className="flex flex-wrap gap-x-2 text-[11px] leading-4"><p className="text-blue-100/80">{note}</p>
        {!loading && alternateValue && <p className="text-blue-100/90">IVA inclusa <span className="ml-1 font-medium tabular-nums text-white">{alternateValue}</span></p>}</div>
      </div>
      {!loading && ring && Number.isFinite(ring.value) && <div role="img" aria-label={`${ring.label}: ${ring.value.toLocaleString("it-IT", {maximumFractionDigits:1})}%`} className="relative h-10 w-10 shrink-0">
        <svg viewBox="0 0 56 56" aria-hidden="true" className="h-full w-full -rotate-90">
          <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
          <circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${circle * Math.min(100, Math.max(0, ring.value)) / 100} ${circle}`} className={ring.color === "green" ? "text-emerald-400" : "text-amber-300"} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-white">{ring.value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>
      </div>}
    </div>
    {details.length > 0 && <div className="mt-1 border-t border-white/15 pt-1">{details}</div>}
  </section>;
}
