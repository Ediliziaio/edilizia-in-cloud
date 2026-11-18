import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveCompanyId } from '@/hooks/useEffectiveCompanyId';
import { usePermissions } from '@/hooks/usePermissions';
import { FiscalReleaseDialog } from '@/components/fatturazione/FiscalReleaseDialog';
import { NuovaRitenutaDialog } from './NuovaRitenutaDialog';
import { RitenutaBadge } from './RitenutaBadge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/formatters';
interface RitenutaCliente {id:string;importo:number;stato:string;data_svincolo_prevista:string|null;data_svincolo_effettiva:string|null;percentuale_applicata:number|null;sal_record_id:string|null;controparte:string|null}
export function useRitenuteClienteCommessa(orderId: string) {
 const companyId=useEffectiveCompanyId();const permissions=usePermissions();
 const q=useQuery({queryKey:['ritenute-attive-commessa',companyId,orderId],enabled:!!companyId&&permissions.isAdmin,queryFn:async()=>{
  const r=await supabase.from('ritenute_garanzia').select('id,importo,stato,data_svincolo_prevista,data_svincolo_effettiva,percentuale_applicata,sal_record_id,controparte').eq('company_id',companyId!).eq('order_id',orderId).eq('direzione','attiva').order('created_at',{ascending:false});
  if(r.error)throw r.error;return r.data as unknown as RitenutaCliente[];
 }});
 const rows=q.data??[];const aperte=rows.filter(r=>!['svincolata','persa','annullata'].includes(r.stato));const oggi=new Date().toLocaleDateString('en-CA');
 const somma=(r:RitenutaCliente[])=>r.reduce((s,r)=>s+Math.round(Number(r.importo)*100),0)/100;
 return {
  companyId, permissions, q, rows, trattenute: somma(aperte),
  trattenuteSal: somma(aperte.filter(r => r.sal_record_id != null)),
  maturate: somma(aperte.filter(r=>r.data_svincolo_prevista&&r.data_svincolo_prevista<=oggi)),
  svincolate: somma(rows.filter(r=>r.stato==='svincolata')),
 };
}

export function RitenuteClienteCommessa({orderId, dati}:{orderId:string; dati:ReturnType<typeof useRitenuteClienteCommessa>}) {
 const {companyId, permissions, q, rows, maturate, svincolate}=dati;
 const qc=useQueryClient();
 const [nuova,setNuova]=useState(false);const [svincolo,setSvincolo]=useState<string|null>(null);
 return <section aria-label="Ritenute trattenute dal cliente" className="space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Trattenute dal cliente</h4>{permissions.isAdmin&&!permissions.solaLettura&&!q.isPending&&!q.isError&&<Button size="sm" variant="outline" onClick={()=>setNuova(true)}>Registra ritenuta</Button>}</div>
  {!permissions.isAdmin?<p className="text-xs text-muted-foreground">Il registro delle ritenute è consultabile dall’amministrazione.</p>:q.isPending?<p role="status" className="text-xs">Caricamento ritenute del cliente…</p>:q.isError?<p role="alert" className="text-xs">Ritenute del cliente non disponibili. <button className="underline" onClick={()=>void q.refetch()}>Riprova</button></p>:<>
   {(maturate>0||svincolate>0)&&<dl className="flex flex-wrap gap-x-5 gap-y-2 rounded-md bg-muted/30 px-3 py-2 text-sm tabular-nums">{maturate>0&&<div><dt className="text-xs text-muted-foreground">Data di svincolo raggiunta</dt><dd className="font-semibold text-amber-800 dark:text-amber-200">{formatCurrency(maturate)}</dd></div>}{svincolate>0&&<div><dt className="text-xs text-muted-foreground">Svincolo documentato</dt><dd className="font-semibold">{formatCurrency(svincolate)}</dd></div>}</dl>}
   {!rows.length?<p className="text-xs text-muted-foreground">Nessuna ritenuta del cliente registrata.</p>:<ul className="divide-y rounded-md border">{rows.map(r=><li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><div><strong className="tabular-nums">{formatCurrency(Number(r.importo))}</strong> · <RitenutaBadge stato={r.stato as 'trattenuta'|'svincolata'|'persa'}/><p className="text-xs text-muted-foreground">{r.controparte??'Cliente della commessa'}{r.percentuale_applicata!=null&&` · ${r.percentuale_applicata}%`}{r.data_svincolo_prevista&&` · svincolo previsto ${r.data_svincolo_prevista.split('-').reverse().join('/')}`}</p></div><div className="flex gap-2">{r.sal_record_id&&<Button size="sm" variant="ghost" asChild><Link to={`/azienda/ordini/${orderId}?tab=finanza&vista_economia=sal`}>Apri SAL</Link></Button>}{r.stato==='trattenuta'&&!permissions.solaLettura&&<Button size="sm" variant="outline" onClick={()=>setSvincolo(r.id)}>Documenta svincolo</Button>}</div></li>)}</ul>}
  </>}
  {permissions.isAdmin&&<div className="flex flex-wrap items-baseline justify-between gap-2">
   <details className="min-w-0 flex-1 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Come funziona lo svincolo</summary><p className="pt-2">Lo svincolo documenta il rilascio della garanzia. Se la garanzia è già fatturata, registra il versamento sulla stessa fattura. Verifica le trattenute già applicate nel certificato SAL prima di fatturare.</p></details>
   <Link to="/azienda/ritenute-garanzia" className="inline-block text-xs text-primary hover:underline">Apri registro ritenute</Link>
  </div>}
  {nuova&&<NuovaRitenutaDialog open companyId={companyId??undefined} initialOrderId={orderId} onOpenChange={setNuova} onCreated={()=>{void q.refetch();}}/>}
  {svincolo&&companyId&&<FiscalReleaseDialog companyId={companyId} id={svincolo} onClose={()=>setSvincolo(null)} onReleased={async()=>{setSvincolo(null);await qc.invalidateQueries({queryKey:['ritenute-attive-commessa']});}}/>}
 </section>;
}
