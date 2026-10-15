import {Button} from "@/components/ui/button";
import {ORDER_FOCUS_LABELS, type OrderFocus, type MarginKind} from "@/lib/orders/listScope";

interface Props {
  counts: {toComplete:number; completed:number; support:number};
  loading:boolean; failed:boolean;
  status:string; onStatus:(value:string)=>void;
  showMargins:boolean; margins:Record<MarginKind,string[]>;
  marginLoading:boolean; marginFailed:boolean;
  focus:OrderFocus; onFocus:(value:OrderFocus)=>void; onRetry:()=>void;
}
export function OrdersPeriodSummary(props:Props) {
  return <section aria-label="Riepilogo del periodo" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
    <span className="mr-1 text-xs text-muted-foreground">Nella vista:</span>
    {[
      {value:"__da_completare__",label:"Da completare",count:props.counts.toComplete},
      {value:"__completati__",label:"Completati",count:props.counts.completed},
      {value:"__assistenza__",label:"Assistenza aperta",count:props.counts.support},
    ].map(item=><button key={item.value} type="button" className="orders-stat-chip" aria-pressed={props.status===item.value}
      disabled={props.loading || props.failed} onClick={()=>props.onStatus(props.status===item.value?"all":item.value)}>
      {item.label} <strong className="tabular-nums">{props.failed?"—":props.loading?"…":item.count}</strong>
    </button>)}
    <span className="text-xs text-muted-foreground">Gli stati dei lavori e le assistenze possono sovrapporsi.</span>
    {props.showMargins && ((props.marginFailed || props.failed)?<div role="alert" className="flex items-center gap-2 text-amber-800">
      Margini non disponibili <Button variant="outline" size="sm" onClick={props.onRetry}>Riprova margini</Button>
    </div>:(["negative_margin","low_margin","missing_costs"] as const).map(kind=><button key={kind} type="button" className="orders-stat-chip"
      aria-pressed={props.focus===kind} disabled={props.marginLoading} onClick={()=>props.onFocus(props.focus===kind?"all":kind)}>
      {ORDER_FOCUS_LABELS[kind]} <strong className="tabular-nums">{props.marginLoading?"…":props.margins[kind].length}</strong>
    </button>))}
  </section>;
}
