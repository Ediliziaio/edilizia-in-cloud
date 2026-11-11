import {lazy,Suspense} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from '@/contexts/AuthContext';
import {documentiDb as db} from '@/lib/ddt/documentiPersistenti';
import {loadCatalogPages} from '@/lib/listino/loadCatalogPages';
import {documentoDaOrdineAcquisto} from '@/lib/documentiOperativi/daOrdineAcquisto';
import type {PurchaseOrder,PurchaseOrderItem} from '@/hooks/usePurchaseOrders';
import type {DocumentoOperativo} from '@/lib/documentiOperativi/modello';
import {createPdfPreviewUrl} from '@/lib/pdfPreviewSource';
import type {BaseConferma} from '../../../supabase/functions/_shared/revisioniConferma';
const PdfPanel=lazy(()=>import('@/components/shared/PdfBlobLivePreviewPanel').then(m=>({default:m.PdfBlobLivePreviewPanel})));

/** Una riproduzione da dati congelati resta distinta dal PDF originale spedito. */
export function PdfRichiestaOrdine({companyId,ordineId,baseCongelata}:{companyId:string;ordineId:string;baseCongelata?:BaseConferma}) {
 const {effectiveCompany}=useAuth();
 const q=useQuery({queryKey:['pdf-richiesta-ordine',companyId,ordineId,baseCongelata?.impronta],staleTime:0,queryFn:async()=>{
  const [po,items,base]=await Promise.all([
   db.from('purchase_orders').select('*,suppliers(*),orders(order_code,work_address)').eq('company_id',companyId).eq('id',ordineId).single(),
   loadCatalogPages<PurchaseOrderItem>((a,b)=>db.from('purchase_order_items').select('*').eq('company_id',companyId).eq('purchase_order_id',ordineId).order('sort_order').order('id').range(a,b)),
   db.rpc('controllo_documento_base',{p_po:ordineId,p_rfq:null}),
  ]);
  if(po.error||!po.data) throw new Error('Ordine non disponibile.');
  if(base.error) throw new Error('Versione del documento non disponibile.');
  const snapshot=baseCongelata?.fonte==='invio'?baseCongelata.documento:baseCongelata?null:base.data?.documento;
  const daInvio=snapshot&&Array.isArray(snapshot.righe)&&snapshot.destinatario&&snapshot.numero;
  const storicoNonDisponibile=!!baseCongelata&&!daInvio&&baseCongelata.impronta!==base.data?.impronta;
  return {documento:storicoNonDisponibile?null:daInvio?snapshot as DocumentoOperativo:documentoDaOrdineAcquisto(po.data as PurchaseOrder,items),daInvio:!!daInvio,storicoNonDisponibile};
 }});
 if(q.isLoading)return <p role="status" className="text-xs">Preparazione del PDF dell’ordine…</p>;
 if(q.isError)return <p role="alert" className="text-xs text-red-700">PDF non disponibile. <button className="underline" onClick={()=>void q.refetch()}>Riprova</button></p>;
 if(q.data?.storicoNonDisponibile)return <p className="rounded-lg border border-dashed p-5 text-xs text-slate-600">Il PDF originale di questa revisione non è archiviato. Nella scheda Righe trovi la richiesta usata per questo controllo.</p>;
 if(!q.data?.documento||!effectiveCompany||effectiveCompany.id!==companyId)return <p className="text-xs">Seleziona l’azienda del documento.</p>;
 const {documento,daInvio}=q.data;
 return <div className="flex h-[58dvh] min-h-0 flex-col gap-2"><p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{daInvio?'Riproduzione della richiesta inviata: il PDF originale non è archiviato.':'Bozza generata dai dati correnti: questo PDF non risulta inviato al fornitore.'}</p>
  <div className="min-h-0 flex-1"><Suspense fallback={<p role="status">Apertura PDF…</p>}><PdfPanel depsKey={JSON.stringify([companyId,documento])} debounceMs={0} headerLabel={daInvio?'Richiesta inviata · riproduzione':'Bozza ordine · dati correnti'} downloadFileName={`${documento.numero}.pdf`} showDownloadOnMobile renderBlobUrl={async()=>{
   const {generaPdfOperativo}=await import('@/lib/documentiOperativi/pdf');return createPdfPreviewUrl(await generaPdfOperativo(documento,effectiveCompany));
  }}/></Suspense></div>
 </div>;
}
