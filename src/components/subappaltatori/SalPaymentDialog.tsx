import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import type { SALSubappaltatore } from '@/types/subappaltatori';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
interface Candidates {documenti: {id:string;numero:string}[];pagamenti:{id:string;data:string;disponibile:number;riferimento:string|null}[]}
export function SalPaymentDialog({sal, onClose, onSaved}: {sal:SALSubappaltatore;onClose:()=>void;onSaved:()=>void}) {
  const qc = useQueryClient();
  const [amount,setAmount] = useState<string|null>(null);
  const [date,setDate] = useState<string|null>(null);
  const [reference,setReference] = useState('');
  const [method,setMethod] = useState('bonifico');
  const [mode,setMode] = useState('auto');
  const [existing,setExisting] = useState('');
  const [cost,setCost] = useState('');
  const [request,setRequest] = useState(crypto.randomUUID());
  const changed = () => setRequest(crypto.randomUUID());
  const candidates = useQuery({queryKey:['pagamenti-sal-candidati',sal.id],queryFn:async():Promise<Candidates>=>{const {data,error}=await db.rpc('pagamenti_sal_candidati',{p_sal:sal.id});if(error)throw new Error(error.message);return data;}});
  const linkExisting = mode==='esistente' || (mode==='auto' && !!candidates.data?.pagamenti.length);
  const existingId = existing || candidates.data?.pagamenti[0]?.id;
  const costId = cost || (candidates.data?.documenti.length===1 ? candidates.data.documenti[0].id : null);
  const available = candidates.data?.pagamenti.find(p=>p.id===existingId)?.disponibile??0;
  const residual=Math.max(0,Number(sal.importo_netto)-Number(sal.pagato_registrato??0));
  const effectiveAmount=amount??String(linkExisting?Math.min(residual,available):residual);
  const effectiveDate=date??(linkExisting?candidates.data?.pagamenti.find(p=>p.id===existingId)?.data:null)??new Date().toLocaleDateString('en-CA');
  const mutation = useMutation({mutationFn:async()=>{
    const {error}=await db.rpc('registra_pagamento_sal_sub',{p_sal:sal.id,p_richiesta:request,p_importo:Number(effectiveAmount.replace(',','.')),p_data:effectiveDate,p_metodo:method,p_riferimento:reference||null,p_costo:costId,p_esistente:linkExisting?existingId:null});
    if(error) throw new Error(error.message);
  },onSuccess:()=>{refreshFinancialQueries(qc);onSaved();toast.success(linkExisting?'Pagamento collegato al SAL, nessuna nuova uscita':'Pagamento e SAL aggiornati');},onError:(e:Error)=>toast.error(e.message)});
  return <Dialog open onOpenChange={v=>{if(!v&&!mutation.isPending)onClose();}}><DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Pagamento SAL n. {sal.numero_sal}</DialogTitle><DialogDescription>Collega un pagamento esistente oppure registra un importo già versato. La garanzia rimane distinta.</DialogDescription></DialogHeader>
    {candidates.isPending ? <p>Verifica pagamenti già presenti…</p> : candidates.isError ? <p role="alert">{candidates.error.message}<Button variant="link" onClick={()=>void candidates.refetch()}>Riprova</Button></p> : <div className="space-y-4">
      <div className="rounded-lg bg-muted/40 p-3 text-sm">Netto SAL {formatCurrency(sal.importo_netto)} · Pagato {formatCurrency(Number(sal.pagato_registrato??0))} · Garanzia {formatCurrency(sal.ritenuta_importo)}</div>
      {!!candidates.data?.pagamenti.length && <div className="space-y-2"><Label>Operazione</Label><Select value={linkExisting?'esistente':'nuovo'} onValueChange={v=>{setMode(v);setAmount(null);setDate(null);changed();}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="esistente">Collega un pagamento già registrato</SelectItem><SelectItem value="nuovo">Registra un nuovo pagamento eseguito</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Un pagamento è già presente sul contratto. Collegandolo non si aggiunge una seconda uscita.</p></div>}
      {linkExisting ? <div className="space-y-2"><Label>Pagamento da attribuire</Label><Select value={existingId} onValueChange={v=>{setExisting(v);setAmount(null);setDate(null);changed();}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{candidates.data?.pagamenti.map(p=><SelectItem key={p.id} value={p.id}>{p.data.split('-').reverse().join('/')} · {formatCurrency(p.disponibile)} disponibili{p.riferimento?` · ${p.riferimento}`:''}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Disponibile per questo SAL: {formatCurrency(available)}</p></div> : candidates.data && candidates.data.documenti.length>1 && <div className="space-y-2"><Label>Fattura da pagare</Label><Select value={cost} onValueChange={v=>{setCost(v);changed();}}><SelectTrigger><SelectValue placeholder="Scegli la fattura"/></SelectTrigger><SelectContent>{candidates.data.documenti.map((f,i)=><SelectItem key={`${f.id}-${i}`} value={f.id}>Fattura {f.numero}</SelectItem>)}</SelectContent></Select></div>}
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="sal-payment-amount">Importo da attribuire al SAL</Label><Input id="sal-payment-amount" inputMode="decimal" value={effectiveAmount} onChange={e=>{setAmount(e.target.value);changed();}}/></div><div className="space-y-2"><Label htmlFor="sal-payment-date">Data</Label><Input id="sal-payment-date" type="date" max={new Date().toLocaleDateString('en-CA')} value={effectiveDate} onChange={e=>{setDate(e.target.value);changed();}}/></div></div>
      {!linkExisting && <><div className="space-y-2"><Label>Metodo</Label><Select value={method} onValueChange={v=>{setMethod(v);changed();}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['bonifico','contanti','assegno','altro'].map(m=><SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="sal-payment-reference">Riferimento</Label><Input id="sal-payment-reference" maxLength={500} value={reference} onChange={e=>{setReference(e.target.value);changed();}} placeholder="CRO o nota"/></div></>}
    </div>}
    <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Annulla</Button><Button disabled={mutation.isPending||!candidates.data||!effectiveDate||!Number.isFinite(Number(effectiveAmount.replace(',','.')))||Number(effectiveAmount.replace(',','.'))<=0||(linkExisting&&Number(effectiveAmount.replace(',','.'))>available)||(!linkExisting&&candidates.data.documenti.length>1&&!costId)} onClick={()=>mutation.mutate()}>{mutation.isPending?'Registrazione…':linkExisting?'Collega pagamento':'Conferma pagamento'}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
