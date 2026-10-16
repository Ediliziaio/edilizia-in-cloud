import { formatCurrency } from '@/lib/formatters';
import type { Tables } from '@/integrations/supabase/types';
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';

export type QuoteDetailItem=Pick<Tables<'quote_items'>,'id'|'name'|'description'|'item_category'|'quantity'|'unit_price'|'discount_percent'|'vat_rate'|'unit_of_measure'|'line_total'>;
function Description({item}:{item:QuoteDetailItem}) {
 return <div className="space-y-1 py-2"><p className="whitespace-pre-wrap break-words font-medium">{item.name}</p>{item.description&&<p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description}</p>}</div>;
}
/** Stesse righe salvate: una descrizione non mostra quantità o importi. */
export function QuoteDetailItems({items}:{items:readonly QuoteDetailItem[]}) {
 return <>
  <div className="hidden md:block"><Table><TableHeader><TableRow>
   <TableHead>Voce</TableHead><TableHead>Descrizione</TableHead><TableHead className="text-right">Qtà</TableHead><TableHead className="text-right">Prezzo</TableHead><TableHead className="text-right">Sconto</TableHead><TableHead className="text-right">IVA</TableHead><TableHead className="text-right">Totale</TableHead>
  </TableRow></TableHeader><TableBody>{items.map(item=>item.item_category==='nota'
   ? <TableRow key={item.id}><TableCell colSpan={7}><Description item={item}/></TableCell></TableRow>
   : <TableRow key={item.id}>
    <TableCell className="font-medium">{item.name}</TableCell>
    <TableCell className="max-w-[200px] whitespace-pre-wrap break-words text-muted-foreground">{item.description||'—'}</TableCell>
    <TableCell className="text-right">{item.quantity} {item.unit_of_measure}</TableCell>
    <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
    <TableCell className="text-right">{item.discount_percent>0?`${item.discount_percent}%`:'—'}</TableCell>
    <TableCell className="text-right">{item.vat_rate}%</TableCell>
    <TableCell className="text-right font-medium">{formatCurrency(item.line_total||0)}</TableCell>
   </TableRow>
  )}</TableBody></Table></div>
  <div className="md:hidden divide-y divide-border">{items.map(item=>item.item_category==='nota'
   ? <div key={item.id}><Description item={item}/></div>
   : <div key={item.id} className="py-2 first:pt-0 last:pb-0">
    <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium text-[13px] leading-snug">{item.name}</p><p className="shrink-0 font-semibold text-[13px] tabular-nums text-slate-900">{formatCurrency(item.line_total||0)}</p></div>
    {item.description&&item.description.trim()!==item.name.trim()&&<p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.description}</p>}
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground"><span className="tabular-nums">{item.quantity} {item.unit_of_measure} × {formatCurrency(item.unit_price)}</span>{item.discount_percent>0&&<span className="text-orange-600">−{item.discount_percent}%</span>}<span>IVA {item.vat_rate}%</span></div>
   </div>
  )}</div>
 </>;
}
