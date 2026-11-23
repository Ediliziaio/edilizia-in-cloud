import { Label } from "@/components/ui/label";
import { useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFattureByOrdine } from '@/hooks/billing/useFatturaOrdineLink';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { OfficeSelect } from './OfficeSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { anteprimaQuote } from '@/lib/orders/quoteFatturaRate';
import { refreshFinancialQueries } from '@/lib/orders/financialRefresh';
import { formatCurrency } from '@/lib/formatters';
import type { Installment } from '@/lib/orderUtils';
import { toast } from 'sonner';
import { useT } from '@/lib/campo/lingua/LinguaCampo';
export default function FatturaRateDialog({orderId,invoiceId,onClose}:{orderId:string;invoiceId?:string;onClose:()=>void}) {
 const t=useT();
 const campoId=useId();
 const company=useEffectiveCompanyId();const permissions=usePermissions();const qc=useQueryClient();
 const invoices=useFattureByOrdine(orderId);
 const [documento,setDocumento]=useState(invoiceId??'');const [ids,setIds]=useState<string[]|null>(null);
 const [error,setError]=useState('');const [pending,setPending]=useState(false);const saving=useRef(false);
 const rate=useQuery({queryKey:['rate-fatture-disponibili',company,orderId,'ripartizione'],enabled:!!company,queryFn:async()=>{
  const r=await supabase.from('order_installments').select('*').eq('order_id',orderId).order('position');if(r.error)throw r.error;return r.data as unknown as Installment[];
 }});
 const fatture=(invoices.data??[]).filter(f=>f.origine!=='importata'&&!['annullata','stornata'].includes(f.stato)&&['fattura','fattura_pa','parcella','fattura_accompagnatoria','acconto_fattura','acconto_parcella','fattura_differita_b','fattura_riepilogativa'].includes(f.tipo));
 const doc=fatture.find(f=>f.id===documento);
 const selected=ids??(rate.data??[]).filter(r=>r.documento_fiscale_id===documento).map(r=>r.id!);
 const selectedRate=(rate.data??[]).filter(r=>r.id&&selected.includes(r.id));
 const quote=doc?anteprimaQuote(selectedRate,doc):[];
 const totale=selectedRate.reduce((s,r)=>s+Math.round(r.amount*100),0)/100;
 const blocco=(r:Installment)=>r.type==='financing'?t("Rata della finanziaria"):r.documento_fiscale_id&&r.documento_fiscale_id!==documento?t("Collegata a un’altra fattura"):r.is_paid&&!r.documento_fiscale_id?t("Incasso già registrato separatamente"):null;
 const completo=!!doc&&selected.length>0&&Math.round(totale*100)===Math.round(Number(doc.totale_documento)*100);
 const canWrite=permissions.canViewBilling&&!permissions.solaLettura;
 const blocked=rate.isPending||rate.isError||invoices.isPending||invoices.isError;
 async function salva(){
  if(saving.current||!canWrite||!completo||blocked)return;saving.current=true;setPending(true);setError('');
  try {
   const r=await supabase.rpc('collega_fattura_rate' as never,{p_order_id:orderId,p_documento_id:documento,p_rate:selected} as never);
   if(r.error)throw r.error;refreshFinancialQueries(qc);toast.success(t("Fattura ripartita sulle rate. Nessun nuovo incasso registrato."));onClose();
  }catch(e){setError((e as {message?:string}).message??t("Ripartizione non riuscita. Riprova."));}
  finally{saving.current=false;setPending(false);}
 }
 return <Dialog open onOpenChange={o=>{if(!o&&!saving.current)onClose();}}><DialogContent ampiezza="conferma" className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
  <DialogHeader className="shrink-0 border-b p-4 pr-10"><DialogTitle>{t("Una fattura, più rate")}</DialogTitle><DialogDescription>{t("Collega una fattura esistente alle rate del piano.")}</DialogDescription></DialogHeader>
  <div className="min-h-0 space-y-3 overflow-y-auto p-4">
   {blocked?<p role="status">{rate.isError||invoices.isError?t("Non riesco a leggere rate e fatture. Chiudi e riprova."):t("Caricamento rate e fatture…")}</p>:<>
    <div className="space-y-1.5"><Label htmlFor={campoId}>{t("Fattura da ripartire")}</Label><OfficeSelect id={campoId} placeholder={t("Seleziona una fattura della commessa")} label={t("Fattura da ripartire")} value={documento} onValueChange={v=>{setDocumento(v);setIds(null);setError('');}} options={fatture.map(f=>({value:f.id,label:`${f.numero} · ${formatCurrency(Number(f.totale_documento))}`}))}/></div>
    {doc&&<>
     <p className="rounded-lg bg-muted/40 p-3 text-sm">{t("Gli incassi coprono le quote nell’ordine del piano qui sotto. Eventuali ritenute e altre somme non esigibili restano distinte dal denaro incassato.")}</p>
     <div className="divide-y rounded-lg border" role="group" aria-label={t("Rate da collegare alla fattura")}>{(rate.data??[]).map(r=>{
      const reason=blocco(r);const q=quote.find(q=>q.rata_id===r.id);return <label key={r.id} className="flex items-start gap-3 p-3 text-sm"><input className="mt-1 h-4 w-4" type="checkbox" checked={selected.includes(r.id!)} disabled={!!reason||pending} onChange={e=>setIds(e.target.checked?[...selected,r.id!]:selected.filter(id=>id!==r.id))}/><span className="flex-1"><strong>{r.label}</strong>{reason&&<span className="block text-xs text-muted-foreground">{reason}</span>}{q&&<span className="block text-xs text-muted-foreground">{t("Esigibile {esigibile} · incassato {incassato} · residuo {residuo}",{esigibile:formatCurrency(q.quota_esigibile),incassato:formatCurrency(q.incassato),residuo:formatCurrency(q.residuo)})}{q.non_esigibile>0&&t(" · non esigibile ora {importo}",{importo:formatCurrency(q.non_esigibile)})}</span>}</span><strong>{formatCurrency(r.amount)}</strong></label>;
     })}</div>
     <div className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm" aria-live="polite"><span>{t("Rate selezionate:")} <strong>{formatCurrency(totale)}</strong></span><span>{t("Fattura:")} <strong>{formatCurrency(Number(doc.totale_documento))}</strong></span>{!completo&&<p className="w-full text-amber-800">{t("Le rate selezionate devono coprire esattamente il totale. Per cambiare gli importi usa il piano pagamenti.")}</p>}</div>
    </>}
    {!fatture.length&&<p>{t("Nessuna fattura nativa disponibile su questa commessa.")}</p>}
   </>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </div><DialogFooter className="shrink-0 border-t px-4 py-3"><Button variant="outline" disabled={pending} onClick={onClose}>{t("Annulla")}</Button><Button disabled={!canWrite||pending||blocked||!completo} onClick={()=>void salva()}>{pending?t("Collegamento…"):t("Conferma ripartizione")}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
