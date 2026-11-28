import { ExpenseBankLink, ExpenseSalLinks } from "./ExpensePaymentLinks";
import { TogliPagamentoCosto } from "./TogliPagamentoCosto";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { metodiConEffetto, residuoLibero, tipoEffettoDaMetodo, useEffettiFonte, useRateCosto, useRegistraEffetto } from "@/hooks/useEffetti";

export type { ExpensePaymentDetail } from '@/hooks/useExpensePaymentDetail';
/**
 * `apriInRegistrazione` (23/11/2026): dallo scadenzario e dall'elenco delle fatture ricevute il
 * pannello si apre già sul modulo, con l'importo (`importoProposto`, o il residuo), la data di oggi e
 * il conto già scelto se ce n'è uno solo: si conferma con un clic. Prima «Segna pagata» dallo
 * scadenzario portava alla pagina Costi, e da lì riepilogo, popup, modulo.
 */
export function ExpensePaymentDialog({ costId, onClose, importoProposto, apriInRegistrazione = false, inline = false, rataFornitoreId = null }: {costId: string; /** Preselezione della rata su un costo a rate (oggi nessun chiamante la passa: la rata si sceglie nella tendina). */ rataFornitoreId?: string | null; onClose: () => void; importoProposto?: number; apriInRegistrazione?: boolean; /** Dentro una scheda che mostra già il riepilogo del pagato: senza Dialog e senza secondo riepilogo. */ inline?: boolean}) {
  const t = useT();
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
  const [numeroEffetto, setNumeroEffetto] = useState('');
  const [bancaEffetto, setBancaEffetto] = useState('');
  const [rataScelta, setRataScelta] = useState('');
  const detail = useExpensePaymentDetail(costId);
  const dati = detail.data;
  // Il server conosce anche la delega effettiva e la compatibilità con la Prima Nota.
  const puoTogliere = dati?.puo_togliere_pagamento === true && !permissions.solaLettura;
  const puoRegistrare = !!dati && !dati.da_verificare && dati.residuo > 0 && dati.puo_registrare_pagamento === true && !permissions.solaLettura;
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
  const conEffetto = metodiConEffetto(method);
  const dataFutura = conEffetto && date > oggi;
  const effettiFonte = useEffettiFonte(dati?.company_id, { costId }, editing && !!dati);
  const rateCosto = useRateCosto(costId, editing && dataFutura);
  const rate = rateCosto.data ?? [];
  const rateAperte = rate.filter(r => r.stato !== 'pagata');
  const richiedeRata = dataFutura && rate.length > 0;
  const rataId = rataScelta || rataFornitoreId || (rateAperte.length === 1 ? rateAperte[0].id : '');
  const rataCorrente = rateAperte.find(r => r.id === rataId);
  const coperto = richiedeRata ? effettiFonte.effetti.filter(e => e.rata_fornitore_id === rataId).reduce((a, e) => a + Number(e.importo || 0), 0) : effettiFonte.coperto;
  // Con una rata scelta il tetto è il libero di quella rata; altrimenti quello del costo.
  const libero = dati ? residuoLibero(richiedeRata && rataCorrente ? Math.min(Number(rataCorrente.importo ?? dati.residuo), Number(dati.residuo)) : Number(dati.residuo), coperto) : 0;
  const rataMancante = richiedeRata && !rataCorrente;
  // Caso raro: il costo ha ancora residuo ma tutte le rate risultano pagate. Senza una riga di
  // spiegazione il pulsante resterebbe chiuso senza dire perche'.
  const rateTutteSaldate = richiedeRata && rateAperte.length === 0;
  const registraEffetto = useRegistraEffetto();
  const pay = useMutation({
    mutationFn: () => {
      if (importo == null || importo <= 0) throw new Error(t("Indica un importo con al massimo due decimali."));
      return registerExpensePayment({costId, requestId, amount: importo, date, method, reference, account: {bankAccountId: scelto?.bank_account_id ?? null, liquidityAccountId: scelto?.conto_liquidita_id ?? null}});
    },
    onSuccess: () => { refreshFinancialQueries(qc); setEditing(false); setFormChiuso(true); setAmount(null); setReference(''); setConto(''); setRequestId(crypto.randomUUID()); toast.success(t("Pagamento e contabilità aggiornati")); },
    onError: (e: Error) => { void detail.refetch(); toast.error(e.message); },
  });
  const d = detail.data;
  const registraAssegno = () => {
    if (importo == null || importo <= 0 || !d) return;
    registraEffetto.mutate({
      fonteTipo: 'costo', fonteId: costId, rataFornitoreId: richiedeRata ? rataId : null, tipo: tipoEffettoDaMetodo(method), direzione: 'emesso',
      numero: numeroEffetto, banca: bancaEffetto, importo, dataEmissione: oggi, dataScadenza: date, note: reference || null,
    }, {
      onSuccess: () => { setEditing(false); setFormChiuso(true); setAmount(null); setReference(''); setNumeroEffetto(''); setBancaEffetto(''); setRataScelta(''); setDate(oggi); toast.success(t("Assegno registrato: il costo resta aperto fino al pagamento")); },
      onError: (e: Error) => toast.error(e.message),
    });
  };
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
    onSuccess: () => { refreshFinancialQueries(qc); setEditing(false); setFormChiuso(true); toast.success(t("Pagamento collegato al movimento di banca")); },
    onError: (e: Error) => toast.error(e.message),
  });
  const movimentiProposti = proposti.data?.candidati ?? [];
  const corpo = <>
      {detail.isPending ? <p role="status">{t("Caricamento pagamento…")}</p> : detail.isError ? <p role="alert">{detail.error.message} <Button variant="link" onClick={() => void detail.refetch()}>{t("Riprova")}</Button></p> : d && <>
        {!inline && <ExpensePaymentSummary totale={Number(d.totale)} pagato={Number(d.pagato)} residuo={Number(d.residuo)} />}
        {Number(d.compensato) > 0 && <p className="text-sm text-muted-foreground">{t("Del saldo già coperto, {importo} provengono da anticipi compensati.", { importo: formatCurrency(Number(d.compensato)) })}</p>}
        {d.da_verificare && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{t("I pagamenti registrati non tornano col dovuto: vanno controllati prima di aggiungerne altri. Non aggiungere un pagamento per correggere uno stato.")}</p>}
        {/* 23/11/2026: pagata per il gestionale (o segnata a mano), ma senza un movimento collegato. */}
        {/* 28/11/2026: segnata pagata ma senza nessun pagamento scritto. Il residuo la conta già da
            pagare, come l'elenco: qui si dice perché, e che la banca la può ancora riconciliare. */}
        {Number(d.segnata_non_registrata ?? 0) > 0 && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">{t("{importo} risultano segnati pagati, ma nessun pagamento è registrato: restano da pagare. Collega il movimento di banca o registra il pagamento.", { importo: formatCurrency(Number(d.segnata_non_registrata)) })}</p>}
        {Number(d.senza_prova ?? 0) > 0 && <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t("{importo} risultano pagati senza un movimento di banca collegato: segnati a mano o nel gestionale di prima.", { importo: formatCurrency(Number(d.senza_prova)) })}</p>}
        {movimentiProposti.length > 0 && <section aria-label={t("Movimenti di banca proposti")} className="space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/30">
          <p className="text-sm font-medium">{t("In banca c'è già")}{movimentiProposti.length > 1 ? ` ${t("(scegli quello giusto)")}` : ''}</p>
          <p className="text-xs text-muted-foreground">{t("Se il pagamento è questo, collegalo invece di registrarne uno nuovo: altrimenti risulterebbe due volte.")}</p>
          <ul className="divide-y rounded-md border bg-background">
            {movimentiProposti.map(m => <li key={`${m.transaction_id}:${m.chiave}`} className="flex flex-wrap items-center gap-2 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">{m.data.split('-').reverse().join('/')} · {formatCurrency(m.importo)} · {m.conto}</p>
                {m.causale && <p className="truncate text-xs text-muted-foreground" title={m.causale}>{m.causale}</p>}
              </div>
              {proposti.data?.puo_collegare && !permissions.solaLettura
                ? <Button size="sm" variant="outline" disabled={collega.isPending || pay.isPending} onClick={() => collega.mutate(m)}>{collega.isPending && collega.variables?.transaction_id === m.transaction_id ? t("Collego…") : m.prova ? t("Conferma con questo") : t("Collega")}</Button>
                : <span className="text-xs text-muted-foreground">{t("Da collegare in Tesoreria")}</span>}
            </li>)}
          </ul>
        </section>}
        <ExpenseSalLinks costId={costId}/>
        <div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><caption className="sr-only">{t("Pagamenti già registrati")}</caption><thead className="bg-muted/40"><tr><th className="p-3 text-left">{t("Data")}</th><th className="p-3 text-left">{t("Operazione")}</th><th className="p-3 text-right">{t("Importo")}</th><th className="p-3 text-left">{t("Conto e banca")}</th><th className="p-3 text-right"><span className="sr-only">{t("Togli il pagamento")}</span></th></tr></thead><tbody>
          {d.movimenti.map(m => <tr key={m.id} className="border-t"><td className="p-3 whitespace-nowrap">{m.data.split('-').reverse().join('/')}</td><td className="p-3">{m.fonte === 'prova' ? t("Pagamento confermato dalla banca") : m.fonte === 'banca' ? t("Pagamento in banca") : m.storno_di ? t("Storno del pagamento") : d.movimenti.some(r => r.storno_di === m.id) ? t("Pagamento annullato") : m.direzione === 'entrata' ? t("Rimborso") : t("Pagamento")}{m.metodo && <p className="text-xs text-muted-foreground">{m.metodo}</p>}{m.riferimento && <p className="text-xs text-muted-foreground">{m.riferimento}</p>}</td><td className="p-3 text-right tabular-nums">{m.direzione === 'entrata' ? '− ' : ''}{formatCurrency(m.importo)}</td><td className="p-3 text-xs"><span className="font-medium">{m.conto && !['banca','cassa'].includes(m.conto) ? m.conto : m.conto === 'cassa' ? t("Cassa") : t("Conto non indicato")}</span><p className="text-muted-foreground">{m.banca ? t("Riconciliato con la banca") : m.storno_di ? '—' : t("Non riconciliato")}</p>{!m.banca && !m.storno_di && m.direzione==='uscita' && !['contanti','cash','mp01'].includes((m.metodo??'').toLowerCase()) && !(!m.bank_account_id && /^cassa/i.test(m.conto??'')) && !d.movimenti.some(r=>r.storno_di===m.id) && !permissions.solaLettura && (permissions.canViewTesoreria || permissions.canManagePayments || permissions.isAdmin) && <ExpenseBankLink costId={costId} paymentId={m.id} date={m.data}/>}</td>
            {/* 26/11/2026: il comando che mancava. La strada (storno del saldo rapido o
                eliminazione del pagamento) la sceglie il database; qui si mostra solo quando c'è,
                e il motivo quando non c'è. */}
            <td className="p-3 text-right align-top">{puoTogliere && !m.non_annullabile && m.versione
              ? <TogliPagamentoCosto pagamentoId={m.id} versione={m.versione} importo={Number(m.importo)} data={m.data}/>
              : <span className="text-xs text-muted-foreground" title={m.non_annullabile ?? undefined}>—</span>}</td></tr>)}
          {!d.movimenti.length && <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">{t("Nessun pagamento registrato.")}</td></tr>}
        </tbody></table></div>
        {compensazione && <AnticipoFornitoreForm costId={costId} residuo={Number(d.residuo)} onClose={() => setCompensazione(false)} />}
        {editing && <div className="commessa-payment-form space-y-3 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">{t("Registra un pagamento già eseguito")}</p><p className="text-xs text-muted-foreground">{t("Indica solo questa quota. Puoi aggiungerne altre, anche in contanti o da un’altra banca.")}</p>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-amount">{t("Importo")}</Label><Input id="expense-amount" inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);resetRequest();}}/></div><div><Label htmlFor="expense-date">{conEffetto ? (method === 'assegno' ? t("Data dell'assegno") : t("Data effetto")) : t("Data")}</Label><Input id="expense-date" type="date" max={conEffetto ? undefined : oggi} value={date} onChange={e=>{setDate(e.target.value);resetRequest();}}/></div></div>
          <div className="flex flex-wrap gap-3 text-xs"><Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" disabled={!d || Math.round(libero*100)<2} onClick={() => {setAmount(String(Math.floor(Math.round(libero*100)/2)/100));resetRequest();}}>{t("Metà del residuo")}</Button><Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs" onClick={() => {setAmount(String(libero));resetRequest();}}>{t("Intero residuo")}</Button></div>
          <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-method">{t("Metodo")}</Label><OfficeSelect id="expense-method" label={t("Metodo")} value={method} onValueChange={v=>{setMethod(v);setConto('');resetRequest();}}
            options={[{value:'bonifico',label:t("Bonifico")},{value:'rid',label:'RID / SDD'},{value:'ri.ba',label:'Ri.Ba.'},{value:'carta',label:t("Carta")},{value:'contanti',label:t("Contanti")},{value:'assegno',label:t("Assegno")},{value:'altro',label:t("Altro")}]} /></div><div><Label htmlFor="expense-reference">{t("Riferimento")}</Label><Input id="expense-reference" maxLength={500} value={reference} onChange={e=>{setReference(e.target.value);resetRequest();}} placeholder={t("CRO o nota")}/></div></div>
          {conEffetto && <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="expense-effetto-numero">{method === 'assegno' ? t("Numero assegno") : t("Numero")}</Label><Input id="expense-effetto-numero" maxLength={60} value={numeroEffetto} onChange={e=>setNumeroEffetto(e.target.value)}/></div><div><Label htmlFor="expense-effetto-banca">{t("Banca")}</Label><Input id="expense-effetto-banca" maxLength={120} value={bancaEffetto} onChange={e=>setBancaEffetto(e.target.value)}/></div></div>}
          {rateTutteSaldate && <p className="text-xs text-amber-700">{t("Le rate di questo costo risultano tutte pagate: per registrare un assegno, riapri la rata dalla fattura fornitore.")}</p>}
          {richiedeRata && <div><Label htmlFor="expense-effetto-rata">{t("Rata")}</Label><OfficeSelect id="expense-effetto-rata" label={t("Rata")} value={rataId} onValueChange={v=>setRataScelta(v)} options={[{value:'',label:t("Scegli la rata…")},...rateAperte.map(r => ({value:r.id,label:`${t("Rata {n} di {tot}", {n:String(r.numero),tot:String(rate.length)})} · ${r.scadenza ? r.scadenza.split('-').reverse().join('/') : '—'} · ${formatCurrency(Number(r.importo ?? 0))}`}))]} />{rataMancante && <p className="text-xs text-muted-foreground">{t("Scegli la rata che l'assegno copre")}</p>}</div>}
          {effettiFonte.effetti.length > 0 && <p className="text-xs text-muted-foreground">{t("Già coperti {importo} da {n} assegni/effetti in attesa. Residuo libero: {libero}", { importo: formatCurrency(coperto), n: String(effettiFonte.effetti.length), libero: formatCurrency(libero) })}</p>}
          {dataFutura ? <p className="text-xs text-muted-foreground">{t("Data futura: sarà registrato un assegno in attesa, il costo non risulta pagato finché non viene incassato.")}</p> : conti.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere i conti.")} <Button variant="link" onClick={() => void conti.refetch()}>{t("Riprova")}</Button></p> : disponibili.length > 0 ? <div><Label htmlFor="expense-account">{t("Conto del pagamento")}</Label><OfficeSelect id="expense-account" label={t("Conto del pagamento")} value={conto} onValueChange={v => {setConto(v);resetRequest();}} options={[{value:'',label:t("Scegli il conto effettivo…")},...disponibili.map(c => ({value:c.valore,label:c.etichetta}))]} /></div> : conti.isFetching ? <p role="status" className="text-xs">{t("Caricamento conti…")}</p> : <p className="text-xs text-muted-foreground">{method === 'contanti' ? t("Il movimento sarà registrato in cassa.") : t("Nessun conto specifico disponibile per il tuo accesso: il movimento userà il conto Banca.")}</p>}
        </div>}
      </>}
  </>;
  const azioni = <>
      <Button variant="outline" disabled={pay.isPending} onClick={() => { if (editing) { setEditing(false); setFormChiuso(true); } else onClose(); }}>{editing ? t("Annulla") : t("Chiudi")}</Button>
        {d?.puo_compensare && !d.da_verificare && d.residuo > 0 && !editing && !compensazione && (
          <Button variant="outline" onClick={() => setCompensazione(true)}>{t("Compensa con un anticipo")}</Button>
        )}
        {d && !compensazione && puoRegistrare && <Button disabled={pay.isPending || registraEffetto.isPending || detail.isFetching || (editing && (importo == null || importo<=0 || Math.round(importo*100)>Math.round(libero*100) || !date || rataMancante || rateCosto.isFetching&&dataFutura || (!conEffetto && date>oggi) || (!dataFutura && (conti.isFetching || conti.isError || (disponibili.length>0 && !scelto)))))} onClick={() => {if(editing) {if(dataFutura) registraAssegno(); else pay.mutate();} else {setAmount(String(d.residuo));resetRequest();setEditing(true);}}}>{pay.isPending || registraEffetto.isPending ? t("Registrazione…") : editing ? (dataFutura ? t("Registra assegno") : t("Conferma pagamento")) : t("Registra pagamento")}</Button>}
  </>;
  // Dentro il riepilogo della fattura (23/11/2026): niente secondo popup, il pannello si apre lì.
  if (inline) return <div className="space-y-3" data-pagamento-in-linea="">
    {corpo}
    <div className="flex flex-wrap justify-end gap-2">{azioni}</div>
  </div>;
  return <Dialog open onOpenChange={open => {if (!open && !pay.isPending) onClose();}}>
    <DialogContent struttura="scorrevole" ampiezza="modulo" className="max-w-2xl max-h-[90dvh] overflow-y-auto" onPointerDownOutside={e => {if (pay.isPending) e.preventDefault();}}>
      <DialogHeader><DialogTitle>{d?.nome ?? t("Pagamento fornitore")}</DialogTitle><DialogDescription>{t("Più pagamenti sulla stessa fattura, anche con metodi, date e conti diversi.")}</DialogDescription></DialogHeader>
      {corpo}
      <DialogFooter>{azioni}</DialogFooter>
    </DialogContent>
  </Dialog>;
}
