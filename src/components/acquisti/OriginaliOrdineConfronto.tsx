import { useOriginaliConfronto } from "@/hooks/useConfrontoFattura";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import type { DocumentoConfronto } from "@/hooks/useConfrontoFattura";
import {PdfRichiestaOrdine} from './PdfRichiestaOrdine';
import type {BaseConferma} from '../../../supabase/functions/_shared/revisioniConferma';

export function OriginaliOrdineConfronto({ companyId, ordineId, numero, attachmentUrl, tipo, adatta=false,baseCongelata }: {
  companyId:string; ordineId:string; numero:string; attachmentUrl?:string|null; tipo:"inviato"|"fornitore"; adatta?:boolean;baseCongelata?:BaseConferma;
}) {
  const q=useOriginaliConfronto(companyId,{id:ordineId,tipo:"oda",numero,data:null,fornitore:"",collegato:true,righe:[],bolle:[],avviso:null,dati:{attachment_url:attachmentUrl}} as DocumentoConfronto);
  if(q.isLoading) return <p role="status" className="p-3 text-xs">Caricamento documenti dell’ordine…</p>;
  if(q.isError) return <p role="alert" className="p-3 text-xs text-red-700">Documenti non disponibili. <button className="underline" onClick={()=>void q.refetch()}>Riprova</button></p>;
  const files=(q.data??[]).filter(f=>(f.tipo??"fornitore")===tipo&&(!baseCongelata||tipo!=='inviato'||baseCongelata.fonte==='invio'&&f.eventoId===baseCongelata.evento_id));
  if(!files.length&&tipo==='inviato')return <PdfRichiestaOrdine companyId={companyId} ordineId={ordineId} baseCongelata={baseCongelata}/>;
  if(!files.length) return <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
    {tipo==="inviato" ? "Nessun PDF inviato conservato. Se la richiesta è partita nel testo dell’email, trovi la versione nello storico dell’ordine." : "Nessuna conferma del fornitore caricata. Apri l’ordine per aggiungerla e controllarla."}
  </div>;
  return <OriginaliConfronto key={`${ordineId}:${tipo}`} companyId={companyId} files={files} adatta={adatta}/>;
}
