import { ExpenseBankLink, ExpenseSalLinks } from "./ExpensePaymentLinks";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatters';
import { registerExpensePayment } from '@/lib/orders/expensePayments';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';

export interface ExpensePaymentDetail {
  id: string; company_id: string; nome: string; totale: number; pagato: number; residuo: number; da_verificare: boolean;
  movimenti: { id: string; data: string; importo: number; direzione: string; banca: string | null; riferimento: string | null; storno_di: string | null }[];
}
export function ExpensePaymentDialog({ costId, onClose }: {costId: string; onClose: () => void}) {
  const qc = useQueryClient();
  const permissions = usePermissions();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [method, setMethod] = useState('bonifico');
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [editing, setEditing] = useState(false);
  const detail = useQuery({
    queryKey: ['pagamento-costo', costId],
    queryFn: async (): Promise<ExpensePaymentDetail> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {data, error} = await (supabase as any).rpc('dettaglio_pagamento_costo', {p_costo: costId});
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 0,
  });
  const pay = useMutation({
    mutationFn: () => registerExpensePayment({costId, requestId, amount:Number(amount.replace(',','.')), date, method, reference}),
    onSuccess: () => { refreshFinancialQueries(qc); setEditing(false); setRequestId(crypto.randomUUID()); toast.success('Pagamento e contabilità aggiornati'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = detail.data;
  const resetRequest = () => setRequestId(crypto.randomUUID());
  return <Dialog open onOpenChange={open => {if (!open && !pay.isPending) onClose();}}>
    <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" onPointerDownOutside={e => {if (pay.isPending) e.preventDefault();}}>
      <DialogHeader><DialogTitle>{d?.nome ?? 'Pagamento fornitore'}</DialogTitle><DialogDescription>Documento, pagamenti e residuo della stessa spesa. Rimani nella commessa.</DialogDescription></DialogHeader>
      {detail.isPending ? <p role="status">Caricamento pagamento…</p> : detail.isError ? <p role="alert">{detail.error.message} <Button variant="link" onClick={() => void detail.refetch()}>Riprova</Button></p> : d && <>
        <div className="grid grid-cols-3 gap-2">{[['Dovuto', d.totale],['Pagato', d.pagato],['Residuo', d.residuo]].map(([label,value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{formatCurrency(Number(value))}</p></div>)}</div>
        {d.da_verificare && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">Ci sono registrazioni storiche da riconciliare. Non aggiungere un pagamento per correggere uno stato.</p>}
        <ExpenseSalLinks costId={costId}/>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><caption className="sr-only">Pagamenti già registrati</caption><thead className="bg-muted/40"><tr><th className="p-3 text-left">Data</th><th className="p-3 text-left">Operazione</th><th className="p-3 text-right">Importo</th><th className="p-3 text-left">Banca</th></tr></thead><tbody>
          {d.movimenti.map(m => <tr key={m.id} className="border-t"><td className="p-3 whitespace-nowrap">{m.data.split('-').reverse().join('/')}</td><td className="p-3">{m.storno_di ? 'Storno' : 'Pagamento'}{m.riferimento && <p className="text-xs text-muted-foreground">{m.riferimento}</p>}</td><td className="p-3 text-right tabular-nums">{m.direzione === 'entrata' ? '− ' : ''}{formatCurrency(m.importo)}</td><td className="p-3 text-xs">{m.banca ? 'Riconciliato' : m.storno_di ? '—' : 'Non riconciliato'}{!m.banca && !m.storno_di && m.direzione==='uscita' && !d.movimenti.some(r=>r.storno_di===m.id) && !permissions.solaLettura && (permissions.canViewTesoreria || permissions.canManagePayments || permissions.isAdmin) && <ExpenseBankLink costId={costId} paymentId={m.id} date={m.data}/>}</td></tr>)}
          {!d.movimenti.length && <tr><td colSpan={4} className="p-5 text-center text-muted-foreground">Nessun pagamento registrato.</td></tr>}
        </tbody></table></div>
        {editing && <div className="space-y-3 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">Registra un pagamento già eseguito</p><p className="text-xs text-muted-foreground">Aggiorna cassa, scadenze e residuo. Non dispone un bonifico.</p>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-amount">Importo</Label><Input id="expense-amount" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);resetRequest();}}/></div><div><Label htmlFor="expense-date">Data</Label><Input id="expense-date" type="date" max={new Date().toLocaleDateString('en-CA')} value={date} onChange={e=>{setDate(e.target.value);resetRequest();}}/></div></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-method">Metodo</Label><select id="expense-method" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={method} onChange={e=>{setMethod(e.target.value);resetRequest();}}><option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="assegno">Assegno</option><option value="altro">Altro</option></select></div><div><Label htmlFor="expense-reference">Riferimento</Label><Input id="expense-reference" maxLength={500} value={reference} onChange={e=>{setReference(e.target.value);resetRequest();}} placeholder="CRO o nota"/></div></div>
        </div>}
      </>}
      <DialogFooter><Button variant="outline" disabled={pay.isPending} onClick={() => editing ? setEditing(false) : onClose()}>{editing ? 'Annulla' : 'Chiudi'}</Button>
        {d && !d.da_verificare && d.residuo>0 && permissions.canViewCosts && !permissions.solaLettura && <Button disabled={pay.isPending || (editing && (!Number.isFinite(Number(amount.replace(',','.'))) || Number(amount.replace(',','.'))<=0 || Number(amount.replace(',','.'))>d.residuo || !date))} onClick={() => {if(editing) pay.mutate(); else {setAmount(String(d.residuo));resetRequest();setEditing(true);}}}>{pay.isPending ? 'Registrazione…' : editing ? 'Conferma pagamento' : 'Registra pagamento'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
