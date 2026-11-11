import {buildFvPreviewBase} from "../../src/lib/moduli-vendita/fvPreviewData";
import {FV_PDF_PAGES_DEFAULT,renderFvPdfHtml} from "../../supabase/functions/_shared/fvHtmlTemplate";
/** Dati dimostrativi del modello privati, non un'offerta o una nuova stima finanziaria. */
export function documentoBilancioCasa(accumulo=true){
 const d=buildFvPreviewBase();
 d.azienda={...d.azienda,name:"Demo Solar"};
 d.progetto={...d.progetto,numero:"FV-CASA-ANTEPRIMA",has_accumulo:accumulo,capacita_accumulo_kwh:accumulo?10:0};
 if(!accumulo)d.flows=d.flows_senza_accumulo!;
 d.template={pdf_pages_order:FV_PDF_PAGES_DEFAULT.map(p=>({...p,visible:p.id==="flussi"}))};
 const completo=renderFvPdfHtml(d),pagina=completo.split(/(?=<div class="page">)/).find(p=>p.includes('data-fv-section="flussi"'));
 if(!pagina)throw new Error("Pagina dei flussi non disponibile");
 // Estratto della pagina nativa, senza copertina, importi o documenti contrattuali del campione.
 const html=`${completo.slice(0,completo.indexOf("<body"))}<body>${pagina.replace(/<span class="pnum">[^<]*<\/span>/,'<span class="pnum">1 / 1</span>')}</body></html>`;
 return {html,flows:d.flows,consumo:d.progetto.consumo_annuo_kwh};
}
