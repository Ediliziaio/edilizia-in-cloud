import type {orderEconomics, OrderScopeGroup} from "@/lib/orders/annualScope";
type Economics = ReturnType<typeof orderEconomics>;
interface GroupProps {
  year: number; annualCount: number; previousCount: number; selected: OrderScopeGroup;
  onChange: (group: OrderScopeGroup) => void; loading?: boolean; failed?: boolean;
}
/** Navigation counts describe the base scope; other filters remain explicit. */
export function OrdersAnnualScope({year,annualCount,previousCount,selected,onChange,loading,failed}: GroupProps) {
  return <section aria-label="Filtra anno corrente e pregresso" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
    {([{value:"annual",label:String(year),count:annualCount},{value:"previous",label:"Pregresso",count:previousCount},{value:"all",label:"Totale",count:annualCount+previousCount}] as const).map(group =>
      <button key={group.value} type="button" aria-pressed={selected===group.value} disabled={loading || failed}
        className="orders-stat-chip" onClick={()=>onChange(group.value)}>
        {group.label} <strong className="tabular-nums">{failed?"—":loading?"…":group.count}</strong>
      </button>)}
    <span className="text-xs text-muted-foreground">Conteggi prima degli altri filtri, che restano attivi.</span>
  </section>;
}
const money = (amount: number) => amount.toLocaleString("it-IT", {style:"currency",currency:"EUR",maximumFractionDigits:0});
export function OrdersCarryoverSummary({previous,reasons,showAmounts}: {previous:Economics;reasons:{work:number;support:number;payment:number};showAmounts:boolean}) {
  return <details className="mt-3 rounded-xl border border-white/15 bg-white/5 text-blue-50">
    <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 rounded-xl p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300">
      <span className="font-semibold">Pregresso da gestire · {previous.count} commesse</span>
      <span className="text-xs text-blue-100">{reasons.work} lavori aperti · {reasons.support} assistenze · {reasons.payment} con saldo</span>
      {showAmounts && <span className="font-semibold sm:ml-auto">Da incassare {money(previous.pending)}</span>}
      <span className="text-xs underline underline-offset-2">Dettagli</span>
    </summary>
    <div className="space-y-2 px-3 pb-3 text-xs text-blue-100">
      {showAmounts && <p>Venduto {money(previous.sold)} · Incassato {money(previous.collected)} · IVA inclusa</p>}
      <p>Commesse degli anni precedenti con lavori, assistenza o incassi ancora da gestire. Una commessa può avere più motivi, ma viene contata una volta sola.</p>
    </div>
  </details>;
}
