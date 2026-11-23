import { ExpenseBankLink, ExpenseSalLinks } from "./ExpensePaymentLinks";
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useExpensePaymentDetail, usePagamentiBancaProposti } from '@/hooks/useExpensePaymentDetail';
import { supabase } from '@/integrations/supabase/client';
import { ExpensePaymentSummary } from './ExpensePaymentSummary';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Button } from '@/components/ui/button';
import { OfficeSelect } from './OfficeSelect';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/formatters';
import { importoPagamento, registerExpensePayment } from '@/lib/orders/expensePayments';
import { useContiPrimaNota } from '@/hooks/useContiPrimaNota';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { AnticipoFornitoreForm } from "./AnticipoFornitoreForm";

export type { ExpensePaymentDetail } from '@/hooks/useExpensePaymentDetail';
/**
 * `apriInRegistrazione` (23/11/2026): dallo scadenzario e dall'elenco delle fatture ricevute il
 * pannello si apre già sul modulo, con l'importo (`importoProposto`, o il residuo), la data di oggi e
 * il conto già scelto se ce n'è uno solo: si conferma con un clic. Prima «Segna pagata» dallo
 * scadenzario portava alla pagina Costi, e da lì riepilogo, popup, modulo.
 */
export function ExpensePaymentDialog({ costId, onClose, importoProposto, apriInRegistrazione = false }: {costId: string; onClose: () => void; importoProposto?: number; apriInRegistrazione?: boolean}) {
  const qc = useQueryClient();
  const permissions = usePermissions();
  // null = nessuno l'ha ancora scritto: vale la proposta (se il pannello si apre sul modulo).
  const [amountScritto, setAmount] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [method, setMethod] = useState('bonifico');
  const [reference, setReference] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [editingScelto, setEditing] = useState(false);
  // Chiuso dall'utente (Annulla, o pagamento appena registrato): non si riapre da solo.
  const [formChiuso, setFormChiuso] = useState(false);
  const [compensazione, setCompensazione] = useState(false);
  const [contoScelto, setConto] = useState('');
  const detail = useExpensePaymentDetail(costId);
  const dati = detail.data;
  const puoRegistrare = !!dati && !dati.da_verificare && dati.residuo > 0 && permissions.canViewCosts && !permissions.solaLettura;
  const editing = editingScelto || (apriInRegistrazione && !formChiuso && puoRegistrare && !compensazione);
  const proposta = dati ? Math.round(Math.min(importoProposto != null && importoProposto > 0 ? importoProposto : dati.residuo, dati.residuo) * 100) / 100 : 0;
  const amount = amountScritto ?? (apriInRegistrazione && dati ? String(proposta) : '');
  const conti = useContiPrimaNota(dati?.company_id, editing);
  const disponibili = (conti.data ?? []).filter(c => {
    const cassa = c.cassa ?? (!c.bank_account_id && /cassa/i.test(c.account_label));
    return method === 'contanti' ? cassa : !cassa;
  });
  // Un solo conto possibile: è quello, senza doverlo scegliere.
  const conto = contoScelto || (disponibili.length === 1 ? disponibili[0].valore : '');
  const scelto = disponibili.find(c => c.valore === conto);
  const importo = importoPagamento(amount);
  const oggi = new Date().toLocaleDateString('en-CA');
  const pay = useMutation({
    mutationFn: () => {
      if (importo == null || importo <= 0) throw new Error('Indica un importo con al massimo due decimali.');
      return registerExpensePayment({costId, requestId, amount: importo, date, method, reference, account: {bankAccountId: scelto?.bank_account_id ?? null, liquidityAccountId: scelto?.conto_liquidita_id ?? null}});
    },
    onSuccess: () => { refreshFinancialQueries(qc); setEditing(false); setFormChiuso(true); setAmount(null); setReference(''); setConto(''); setRequestId(crypto.randomUUID()); toast.success('Pagamento e contabilità aggiornati'); },
    onError: (e: Error) => { void detail.refetch(); toast.error(e.message); },
  });
  const d = detail.data;
  const resetRequest = () => setRequestId(crypto.randomUUID());
  // In banca c'è già? Va collegato, non riscritto: altrimenti il pagamento risulta due volte.
  const proposti = usePagamentiBancaProposti(costId, permissions.canViewTesoreria || permissions.canManagePayments || permissions.isAdmin);
  const collega = useMutation({
    mutationFn: async (m: { transaction_id: string; righe: { tipo: string; id: string; importo: number }[] }) => {
      const { error } = await supabase.rpc('bank_conferma_ripartizione' as never, {
        p_company: d!.company_id, p_tx: m.transaction_id,
        p_rows: m.righe.map(r => ({ tipo: r.tipo, id: r.id, importo: r.importo })),
        p_note: 'Collegato dal pagamento della fattura',
      } as never);
      if (error) throw new Error((error as { message: string }).message);
    },
    onSuccess: () => { refreshFinancialQueries(qc); setEditing(false); setFormChiuso(true); toast.success('Pagamento collegato al movimento di banca'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const movimentiProposti = proposti.data?.candidati ?? [];
  return <Dialog open onOpenChange={open => {if (!open && !pay.isPending) onClose();}}>
    <DialogContent struttura="scorrevole" ampiezza="modulo" className="max-w-2xl max-h-[90dvh] overflow-y-auto" onPointerDownOutside={e => {if (pay.isPending) e.preventDefault();}}>
      <DialogHeader><DialogTitle>{d?.nome ?? 'Pagamento fornitore'}</DialogTitle><DialogDescription>Più pagamenti sulla stessa fattura, anche con metodi, date e conti diversi.</DialogDescription></DialogHeader>
      {detail.isPending ? <p role="status">Caricamento pagamento…</p> : detail.isError ? <p role="alert">{detail.error.message} <Button variant="link" onClick={() => void detail.refetch()}>Riprova</Button></p> : d && <>
        <ExpensePaymentSummary totale={Number(d.totale)} pagato={Number(d.pagato)} residuo={Number(d.residuo)} />
        {Number(d.compensato) > 0 && <p className="text-sm text-muted-foreground">Del saldo già coperto, {formatCurrency(Number(d.compensato))} provengono da anticipi compensati.</p>}
        {d.da_verificare && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">I pagamenti registrati non tornano col dovuto: vanno controllati prima di aggiungerne altri. Non aggiungere un pagamento per correggere uno stato.</p>}
        {/* 23/11/2026: pagata per il gestionale (o segnata a mano), ma senza un movimento collegato. */}
        {Number(d.senza_prova ?? 0) > 0 && <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{formatCurrency(Number(d.senza_prova))} risultano pagati senza un movimento di banca collegato: segnati a mano o nel gestionale di prima.</p>}
        {movimentiProposti.length > 0 && <section aria-label="Movimenti di banca proposti" className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-sm font-medium">In banca c'è già{movimentiProposti.length > 1 ? ' (scegli quello giusto)' : ''}</p>
          <p className="text-xs text-muted-foreground">Se il pagamento è questo, collegalo invece di registrarne uno nuovo: altrimenti risulterebbe due volte.</p>
          <ul className="divide-y rounded-md border bg-background">
            {movimentiProposti.map(m => <li key={`${m.transaction_id}:${m.chiave}`} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">{m.data.split('-').reverse().join('/')} · {formatCurrency(m.importo)} · {m.conto}</p>
                {m.causale && <p className="truncate text-xs text-muted-foreground" title={m.causale}>{m.causale}</p>}
              </div>
              {proposti.data?.puo_collegare && !permissions.solaLettura
                ? <Button size="sm" variant="outline" disabled={collega.isPending || pay.isPending} onClick={() => collega.mutate(m)}>{collega.isPending && collega.variables?.transaction_id === m.transaction_id ? 'Collego…' : m.prova ? 'Conferma con questo' : 'Collega'}</Button>
                : <span className="text-xs text-muted-foreground">Da collegare in Tesoreria</span>}
            </li>)}
          </ul>
        </section>}
        <ExpenseSalLinks costId={costId}/>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><caption className="sr-only">Pagamenti già registrati</caption><thead className="bg-muted/40"><tr><th className="p-3 text-left">Data</th><th className="p-3 text-left">Operazione</th><th className="p-3 text-right">Importo</th><th className="p-3 text-left">Conto e banca</th></tr></thead><tbody>
          {d.movimenti.map(m => <tr key={m.id} className="border-t"><td className="p-3 whitespace-nowrap">{m.data.split('-').reverse().join('/')}</td><td className="p-3">{m.fonte === 'prova' ? 'Pagamento confermato dalla banca' : m.fonte === 'banca' ? 'Pagamento in banca' : m.storno_di ? 'Storno del pagamento' : d.movimenti.some(r => r.storno_di === m.id) ? 'Pagamento annullato' : m.direzione === 'entrata' ? 'Rimborso' : 'Pagamento'}{m.metodo && <p className="text-xs text-muted-foreground">{m.metodo}</p>}{m.riferimento && <p className="text-xs text-muted-foreground">{m.riferimento}</p>}</td><td className="p-3 text-right tabular-nums">{m.direzione === 'entrata' ? '− ' : ''}{formatCurrency(m.importo)}</td><td className="p-3 text-xs"><span className="font-medium">{m.conto && !['banca','cassa'].includes(m.conto) ? m.conto : m.conto === 'cassa' ? 'Cassa' : 'Conto non indicato'}</span><p className="text-muted-foreground">{m.banca ? 'Riconciliato con la banca' : m.storno_di ? '—' : 'Non riconciliato'}</p>{!m.banca && !m.storno_di && m.direzione==='uscita' && !['contanti','cash','mp01'].includes((m.metodo??'').toLowerCase()) && !(!m.bank_account_id && /^cassa/i.test(m.conto??'')) && !d.movimenti.some(r=>r.storno_di===m.id) && !permissions.solaLettura && (permissions.canViewTesoreria || permissions.canManagePayments || permissions.isAdmin) && <ExpenseBankLink costId={costId} paymentId={m.id} date={m.data}/>}</td></tr>)}
          {!d.movimenti.length && <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Nessun pagamento registrato.</td></tr>}
        </tbody></table></div>
        {compensazione && <AnticipoFornitoreForm costId={costId} residuo={Number(d.residuo)} onClose={() => setCompensazione(false)} />}
        {editing && <div className="commessa-payment-form space-y-3 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">Registra un pagamento già eseguito</p><p className="text-xs text-muted-foreground">Indica solo questa quota. Puoi aggiungerne altre, anche in contanti o da un’altra banca.</p>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-amount">Importo</Label><Input id="expense-amount" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);resetRequest();}}/></div><div><Label htmlFor="expense-date">Data</Label><Input id="expense-date" type="date" max={new Date().toLocaleDateString('en-CA')} value={date} onChange={e=>{setDate(e.target.value);resetRequest();}}/></div></div>
          <div className="flex flex-wrap gap-3 text-xs"><Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" disabled={!d || Math.round(d.residuo*100)<2} onClick={() => {setAmount(String(Math.floor(Math.round(d!.residuo*100)/2)/100));resetRequest();}}>Metà del residuo</Button><Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" onClick={() => {setAmount(String(d!.residuo));resetRequest();}}>Intero residuo</Button></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-method">Metodo</Label><OfficeSelect id="expense-method" label="Metodo" value={method} onValueChange={v=>{setMethod(v);setConto('');resetRequest();}}
            options={[{value:'bonifico',label:'Bonifico'},{value:'rid',label:'RID / SDD'},{value:'ri.ba',label:'Ri.Ba.'},{value:'carta',label:'Carta'},{value:'contanti',label:'Contanti'},{value:'assegno',label:'Assegno'},{value:'altro',label:'Altro'}]} /></div><div><Label htmlFor="expense-reference">Riferimento</Label><Input id="expense-reference" maxLength={500} value={reference} onChange={e=>{setReference(e.target.value);resetRequest();}} placeholder="CRO o nota"/></div></div>
          {conti.isError ? <p role="alert" className="text-sm text-destructive">Non riesco a leggere i conti. <Button variant="link" onClick={() => void conti.refetch()}>Riprova</Button></p> : disponibili.length > 0 ? <div><Label htmlFor="expense-account">Conto del pagamento</Label><OfficeSelect id="expense-account" label="Conto del pagamento" value={conto} onValueChange={v => {setConto(v);resetRequest();}} options={[{value:'',label:'Scegli il conto effettivo…'},...disponibili.map(c => ({value:c.valore,label:c.etichetta}))]} /></div> : conti.isFetching ? <p role="status" className="text-xs">Caricamento conti…</p> : <p className="text-xs text-muted-foreground">{method === 'contanti' ? 'Il movimento sarà registrato in cassa.' : 'Nessun conto specifico disponibile per il tuo accesso: il movimento userà il conto Banca.'}</p>}
        </div>}
      </>}
      <DialogFooter><Button variant="outline" disabled={pay.isPending} onClick={() => { if (editing) { setEditing(false); setFormChiuso(true); } else onClose(); }}>{editing ? 'Annulla' : 'Chiudi'}</Button>
        {d?.puo_compensare && !d.da_verificare && d.residuo > 0 && !editing && !compensazione && (
          <Button variant="outline" onClick={() => setCompensazione(true)}>Compensa con un anticipo</Button>
        )}
        {d && !compensazione && !d.da_verificare && d.residuo>0 && permissions.canViewCosts && !permissions.solaLettura && <Button disabled={pay.isPending || detail.isFetching || (editing && (importo == null || importo<=0 || Math.round(importo*100)>Math.round(d.residuo*100) || !date || date>oggi || conti.isFetching || conti.isError || (disponibili.length>0 && !scelto)))} onClick={() => {if(editing) pay.mutate(); else {setAmount(String(d.residuo));resetRequest();setEditing(true);}}}>{pay.isPending ? 'Registrazione…' : editing ? 'Conferma pagamento' : 'Registra pagamento'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
