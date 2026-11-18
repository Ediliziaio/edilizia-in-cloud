import type {orderEconomics, OrderScopeGroup} from "@/lib/orders/annualScope";
type Economics = ReturnType<typeof orderEconomics>;
interface GroupProps {
  year: number; annualCount: number; previousCount: number; selected: OrderScopeGroup;
  onChange: (group: OrderScopeGroup) => void; loading?: boolean; failed?: boolean;
}
/** Navigation counts describe the base scope; other filters remain explicit. */
export function OrdersAnnualScope({year,annualCount,previousCount,selected,onChange,loading,failed}: GroupProps) {
  return <section aria-label="Filtra anno corrente e pregresso" className="flex min-w-0 flex-1 basis-full flex-wrap sm:basis-auto items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm">
    {([{value:"annual",label:String(year),count:annualCount},{value:"previous",label:"Pregresso",count:previousCount},{value:"all",label:"Totale",count:annualCount+previousCount}] as const).map(group =>
      <button key={group.value} type="button" aria-pressed={selected===group.value} disabled={loading || failed}
        className="orders-stat-chip" onClick={()=>onChange(group.value)}>
        {group.label} <strong className="tabular-nums">{failed?"—":loading?"…":group.count}</strong>
      </button>)}
    <span className="text-xs text-muted-foreground max-md:hidden">Conteggi prima degli altri filtri, che restano attivi.</span>
  </section>;
}
const money = (amount: number) => amount.toLocaleString("it-IT", {style:"currency",currency:"EUR",maximumFractionDigits:0});
export function OrdersCarryoverSummary({previous,reasons,showAmounts}: {previous:Economics;reasons:{work:number;support:number;payment:number};showAmounts:boolean}) {
  return <div className="mt-2 rounded-lg border-t border-white/15 bg-white/5 px-2 py-1.5 text-blue-50">
    <details className="min-w-0 flex-1">
    <summary className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
      <span><span className="font-semibold">Pregresso da gestire · {previous.count} commesse</span><span className="ml-2 text-[11px] text-blue-100 underline underline-offset-2">Dettagli</span></span>
      {showAmounts && <span className="text-right text-[11px] text-blue-100">Da incassare <strong className="text-white">{money(previous.pending)}</strong> · IVA inclusa</span>}
    </summary>
    <div className="mt-2 space-y-2 text-xs text-blue-100">
      <p>{reasons.work} lavori aperti · {reasons.support} assistenze · {reasons.payment} con saldo</p>
      {showAmounts && <p>Venduto {money(previous.sold)} · Incassato {money(previous.collected)} · IVA inclusa</p>}
      <p>Commesse degli anni precedenti con lavori, assistenza o incassi ancora da gestire. Una commessa può avere più motivi, ma viene contata una volta sola.</p>
    </div>
  </details>

  </div>;
}
