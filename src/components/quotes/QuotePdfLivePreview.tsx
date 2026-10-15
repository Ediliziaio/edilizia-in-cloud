import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";
import { PdfBlobLivePreviewPanel } from '@/components/shared/PdfBlobLivePreviewPanel';
import { supabase } from '@/integrations/supabase/client';
import type { QuoteTemplate, QuoteTemplateKind } from '@/types/quoteTemplate';

/** Real server PDF, not an approximation: same endpoint and draft as the download. */
export function QuotePdfLivePreview({template,kind,companyId,companyName}: {
  template:Partial<QuoteTemplate>;kind:QuoteTemplateKind;companyId?:string;companyName?:string;
}) {
  const standalone=kind==='condizioni'||kind==='legali';
  const draft={...template,company_id:template.company_id??companyId,...(standalone?{
    kind:'offerta',linked_cover_id:null,linked_terms_id:null,linked_legal_id:null,
    contractual_terms_text:template.body_html??'',show_contractual_terms:true,show_legal_terms:false,
    show_cover_image:false,cover_title:null,cover_subtitle:null,
  }:{} )};
  const render=async()=>{
    const {data,error}=await supabase.functions.invoke('generate-quote-pdf',{body:{preview_mode:true,template_data:draft,company_name:companyName,preview_signature:true}});
    if(error)throw new Error('Impossibile aggiornare il PDF. Le modifiche restano nell’editor: riprova.');
    if(!data?.pdf_base64)throw new Error('Il generatore non ha restituito il documento.');
    const binary=atob(data.pdf_base64);const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return createPdfPreviewUrl(new Blob([bytes],{type:'application/pdf'}));
  };
  return <div className="h-[70vh] min-h-[420px] w-full" aria-label="PDF classico aggiornato automaticamente">
    <PdfBlobLivePreviewPanel renderBlobUrl={render} depsKey={JSON.stringify([draft,companyName])} enabled={!!companyId} debounceMs={900} downloadFileName="anteprima-preventivo.pdf" />
  </div>;
}
