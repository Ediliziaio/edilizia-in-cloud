import type {orderEconomics} from "@/lib/orders/annualScope";
type Economics = ReturnType<typeof orderEconomics>;
interface Props {
  year: number; annual: Economics; previous: Economics; showAmounts: boolean;
  reasons: {work: number; support: number; payment: number};
}
const money = (amount: number) => amount.toLocaleString("it-IT", {style:"currency",currency:"EUR",maximumFractionDigits:0});
export function OrdersAnnualScope({year,annual,previous,reasons,showAmounts}: Props) {
  return <section aria-label="Anno corrente e precedenti da gestire" className="rounded-xl border border-slate-200 bg-white p-3 text-sm space-y-3">
    <div className="flex flex-wrap gap-x-5 gap-y-2 font-medium">
      <span>{year}: <strong>{annual.count}</strong></span>
      <span>Anni precedenti da gestire: <strong>{previous.count}</strong></span>
      <span>Totale nella vista: <strong>{annual.count + previous.count}</strong></span>
    </div>
    <p className="text-xs text-muted-foreground">Tutte le commesse del {year}, anche completate. Il pregresso resta solo per lavori aperti ({reasons.work}), assistenza aperta ({reasons.support}) o saldo da incassare ({reasons.payment}). Una commessa può avere più motivi, ma viene contata una volta sola.</p>
    {showAmounts && <div className="grid gap-3 sm:grid-cols-2 text-xs">
      {[{label:`Commesse ${year}`,value:annual},{label:"Pregresso da gestire",value:previous}].map(({label,value}) => <div key={label} className="rounded-lg bg-slate-50 p-3 space-y-1">
        <p className="font-semibold">{label} · IVA inclusa</p>
        <p>Venduto <strong>{money(value.sold)}</strong> · Incassato <strong>{money(value.collected)}</strong> · Da incassare <strong>{money(value.pending)}</strong></p>
      </div>)}
      <p className="sm:col-span-2 text-muted-foreground">Importi riferiti alle commesse di ciascun gruppo, indipendenti dai filtri sotto. “Incassato” indica quanto riscosso su quelle commesse, non i movimenti di cassa avvenuti nell’anno.</p>
    </div>}
  </section>;
}
