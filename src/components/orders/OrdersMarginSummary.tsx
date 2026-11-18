import { useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { directMarginSummary } from "@/lib/orders/summaryIndicators";
type Margin = ReturnType<typeof directMarginSummary>;
const pct = (value: number | null) => value == null ? "—" : `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const money = (value: number | null) => value == null ? "—" : value.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function MarginNote({ label, value, note }: { label: string; value: string; note: string }) {
  const [open, setOpen] = useState(false);
  return <Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger asChild><button type="button" onClick={() => setOpen(current => !current)} aria-label={`${label}: ${value}. Dettagli del calcolo`} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-white/[0.07] px-2 py-1 text-left text-[11px] text-blue-100 transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
      <span>{label}</span><strong className="font-semibold tabular-nums text-white">{value}</strong><Info aria-hidden="true" className="h-3 w-3 shrink-0 text-blue-200/75" />
    </button></TooltipTrigger>
    <TooltipContent side="top" className="max-w-80 text-xs leading-5">{note}</TooltipContent>
  </Tooltip>;
}
export function OrdersMarginSummary({ average, completed, loading, error }: { average: Margin; completed: Margin; loading: boolean; error: boolean }) {
  const description = (value: Margin, actual: boolean) => error ? "Margini non disponibili." : loading ? "Calcolo in corso." : `${value.count} commesse ${actual ? "completate" : "con costi registrati; dato provvisorio"}. Ricavi meno costi diretti, IVA esclusa. Percentuale ponderata sui ricavi.${value.missing ? ` ${value.missing} commesse con dati economici incompleti escluse.` : ""}`;
  const effective = completed.margin == null ? "—" : `${money(completed.margin)} · ${pct(completed.percentage)}`;
  return <div role="group" aria-label="Margini diretti delle commesse" aria-busy={loading || undefined} className="mt-2 flex flex-wrap items-center gap-1.5">
    <MarginNote label="Margine medio" value={loading ? "…" : error ? "—" : pct(average.percentage)} note={description(average, false)} />
    <MarginNote label="Conseguito" value={loading ? "…" : error ? "—" : effective} note={description(completed, true)} />
  </div>;
}
