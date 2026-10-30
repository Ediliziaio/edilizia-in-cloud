import { supabase } from "@/integrations/supabase/client";
import { chiamaServerPos, pdfAnteprimaPos } from "@/hooks/usePos";
import type { OpzioniPdfPos } from "@/lib/sicurezza/posPdfBrowser";

/** Open synchronously with the click, then resolve the private document URL. */
export async function apriUrlDocumentoPos(risolvi:()=>Promise<string>) {
  const finestra=window.open("about:blank","_blank");
  if(finestra) finestra.opener=null;
  try {
    const url=await risolvi();
    if(finestra) finestra.location.replace(url);else window.location.assign(url);
    if(url.startsWith("blob:")&&finestra) {
      // Keep the PDF usable while the reader is open; a fixed timeout can break a later Save.
      const controllo=window.setInterval(()=>{
        if(finestra.closed){window.clearInterval(controllo);URL.revokeObjectURL(url);}
      },30000);
    }
  } catch(e){finestra?.close();throw e;}
}
export function apriAnteprimaPos(companyId:string,posId:string,opz:OpzioniPdfPos={}) {
  return apriUrlDocumentoPos(async()=>URL.createObjectURL(await pdfAnteprimaPos(companyId,posId,opz)));
}
/** A preserved emission wins. Absence gives a visibly watermarked preview, never a reconstructed original. */
export function apriPdfPos(companyId:string,posId:string,revisione:number) {
  return apriUrlDocumentoPos(async()=>{
    const {data,error}=await supabase.from("pos_emissioni" as never).select("id").eq("company_id",companyId).eq("pos_id",posId).eq("revisione",revisione).eq("stato","completa").maybeSingle();
    if(error)throw error;
    if(data){const r=await chiamaServerPos<{url:string}>({azione:"scarica_emissione",company_id:companyId,emissione_id:(data as {id:string}).id,tipo:"pdf"});return r.url;}
    return URL.createObjectURL(await pdfAnteprimaPos(companyId,posId));
  });
}
