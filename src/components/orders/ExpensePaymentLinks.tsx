import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ViaggioSelect } from '@/components/mezzi/ViaggioSelect';
import { formatCurrency } from '@/lib/formatters';
import { registerExpensePayment } from '@/lib/orders/expensePayments';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db=supabase as any;

export function ExpenseBankLink({costId,paymentId,date}:{costId:string;paymentId:string;date:string}) {
  const qc=useQueryClient();
  const [open,setOpen]=useState(false);
  const [bank,setBank]=useState('');
  const [request]=useState(crypto.randomUUID());
  const list=useQuery({queryKey:['pagamento-costo-banca',costId,paymentId],enabled:open,queryFn:async():Promise<{id:string;data:string;descrizione:string;importo:number}[]>=>{const {data,error}=await db.rpc('pagamento_costo_banca_candidati',{p_costo:costId,p_pagamento:paymentId});if(error)throw new Error(error.message);return data;}});
  const mutation=useMutation({mutationFn:()=>registerExpensePayment({costId,requestId:request,date,existingId:paymentId,bankId:bank}),onSuccess:()=>{refreshFinancialQueries(qc);setOpen(false);toast.success('Banca collegata. Nessun nuovo pagamento.');},onError:(e:Error)=>toast.error(e.message)});
  return <div className="mt-1"><Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={()=>setOpen(v=>!v)}>Collega banca</Button>{open&&<div className="mt-2 space-y-2 rounded-lg border bg-background p-3 text-left">
    <p className="text-xs">Abbina il movimento al pagamento già registrato.</p>
    {list.isPending?<p className="text-xs">Ricerca movimenti…</p>:list.isError?<p role="alert" className="text-xs">{list.error.message}<Button size="sm" variant="link" onClick={()=>void list.refetch()}>Riprova</Button></p>:<>
      <ViaggioSelect label="Movimento bancario" value={bank} onValueChange={setBank} emptyMessage="Nessun addebito libero dello stesso importo. Nessun pagamento aggiunto." options={[{value:'',label:'Cerca data o causale…'},...(list.data??[]).map(t=>({value:t.id,label:`${t.data} · ${formatCurrency(t.importo)} · ${t.descrizione||'Addebito'}`}))]}/>
      <Button size="sm" disabled={!bank||mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?'Collegamento…':'Conferma abbinamento'}</Button>
    </>}
  </div>}</div>;
}

export function ExpenseSalLinks({costId}:{costId:string}) {
  const permissions=usePermissions();const qc=useQueryClient();
  const enabled=permissions.canViewSubappaltatoriAmministrazione&&!permissions.solaLettura;
  const list=useQuery({queryKey:['pagamento-costo-sal',costId],enabled,queryFn:async():Promise<{id:string;data:string;importo:number;numero_sal:number}[]>=>{const {data,error}=await db.rpc('pagamento_costo_sal_da_collegare',{p_costo:costId});if(error)throw new Error(error.message);return data;}});
  const mutation=useMutation({mutationFn:async(id:string)=>{const {error}=await db.rpc('collega_pagamento_sal_fattura',{p_pagamento:id,p_costo:costId});if(error)throw new Error(error.message);},onSuccess:()=>{refreshFinancialQueries(qc);toast.success('Pagamento SAL collegato alla fattura, senza nuova uscita');},onError:(e:Error)=>toast.error(e.message)});
  if(!enabled)return null;
  if(list.isError)return <p role="alert" className="text-xs">Pagamenti SAL non disponibili. <Button variant="link" onClick={()=>void list.refetch()}>Riprova</Button></p>;
  if(!list.data?.length)return null;
  return <section className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3"><h3 className="text-sm font-medium">Pagamenti SAL già registrati</h3><p className="text-xs text-muted-foreground">Questa fattura può utilizzare le uscite già registrate sul contratto.</p>{list.data.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>SAL {p.numero_sal} · {p.data} · {formatCurrency(p.importo)}</span><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={()=>mutation.mutate(p.id)}>Collega alla fattura</Button></div>)}</section>;
}
