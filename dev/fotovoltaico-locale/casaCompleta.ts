import {creaDisegnoTetto,disponiModuliAutomaticamente} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import {buildFvPreviewBase} from "../../src/lib/moduli-vendita/fvPreviewData";
import {FV_PDF_PAGES_DEFAULT,renderFvPdfHtml,type FvPdfTemplateData,type FvPdfPageId} from "../../supabase/functions/_shared/fvHtmlTemplate";
export const PAGINE_CASA_VISUALI=["piano_tetto","flussi","giorno_sera","schede_prodotti","risparmio","cassa_25","decisione"] as const;
export type PaginaCasaVisuale=typeof PAGINE_CASA_VISUALI[number];
export const TITOLI_CASA_VISUALI:Record<PaginaCasaVisuale,string>={piano_tetto:"Tetto configurato",decisione:"Riepilogo finale",flussi:"Energia della casa",giorno_sera:"Giorno e sera",schede_prodotti:"Prodotti scelti",risparmio:"Bolletta oggi / dopo",cassa_25:"Percorso dell’investimento"};
/** Un campione esplicito per valutare l'impaginazione, senza condizioni fiscali o finanziarie attribuite al cliente. */
export function datiCasaCompleta(accumulo=true,disegno=true):FvPdfTemplateData{
 const d=buildFvPreviewBase(),prezzo=accumulo?18000:11000;
 d.azienda={name:"Demo Solar",tagline:"Simulazione locale"};
 d.anteprima_dimostrativa=true;
 d.cliente={...d.cliente,nome:"Cliente",cognome:"dimostrativo",indirizzo:"Copertura campione",comune:"Località dimostrativa",cap:"",provincia:""};
 d.progetto={...d.progetto,numero:"FV-CASA-DESIGN",creato_il:"2026-11-10T10:00:00Z",has_accumulo:accumulo,capacita_accumulo_kwh:accumulo?10:0,costi_fissi_annui_eur:180};
 if(!accumulo)d.flows=d.flows_senza_accumulo!;
 d.costi={prezzo_vendita_iva_inclusa:prezzo,iva_perc:10,detrazione_eur:0,detrazione_perc:0,costo_netto_dopo_detrazione:prezzo};
 d.progetto.layout_overlay=disegno?disponiModuliAutomaticamente(creaDisegnoTetto("due_falde",8,9,{corto:1.134,lungo:1.762,stimato:false}),12):undefined;
 if(disegno)d.progetto.superficie_tetto_disponibile_mq=72;
 d.finanziamento=null;
 d.modalita_pagamento={tipo:"diretto",tranche:[{label:"Avvio · ipotesi dimostrativa",pct:100,importo_eur:prezzo}],note:"Esempio di impaginazione"};
 const cassa=[{anno:0,cumulato:-prezzo}],risparmio=d.flows.autoconsumo_kwh*d.progetto.costo_kwh_attuale;
 let saldo=-prezzo,pareggio:number|null=null;
 for(let anno=1;anno<=25;anno++){
  const precedente=saldo;
  saldo+=risparmio*.995**(anno-1)-100;
  cassa.push({anno,cumulato:Math.round(saldo*100)/100});
  if(pareggio===null&&precedente<0&&saldo>=0)pareggio=anno-1+(-precedente)/(saldo-precedente);
 }
 d.scenario={...d.scenario,risparmio_anno1_eur:risparmio,risparmio_mensile_eur:risparmio/12,ricavi_rid_anno1_eur:0,payback_anni:pareggio,risparmio_25_anni_eur:saldo,npv_25_anni:0,cassa_anno_per_anno:cassa};
 d.componenti=d.componenti.filter(c=>accumulo||c.categoria!=="accumulo").map((c):FvPdfTemplateData["componenti"][number]=>({...c,marca:"",modello:c.categoria==="pannello"?"Modulo · esempio 500 Wp":c.categoria==="inverter"?"Inverter · esempio 6 kW":"Accumulo · esempio 10 kWh",garanzia_anni:null,image_illustrativa:true,image_url:`http://127.0.0.1:8087/templates/fotovoltaico/products/${c.categoria==="pannello"?"modulo-fotovoltaico-full-black.webp":c.categoria==="inverter"?"inverter-ibrido.webp":"batteria-accumulo-2-moduli.webp"}`}));
 d.template={pdf_pages_order:[...PAGINE_CASA_VISUALI.map(id=>({id,visible:true})),...FV_PDF_PAGES_DEFAULT.filter(p=>!PAGINE_CASA_VISUALI.includes(p.id as PaginaCasaVisuale)).map(p=>({...p,visible:false}))]};
 return d;
}
export function documentoCasaCompleta(accumulo=true,pagina?:PaginaCasaVisuale,disegno=true){
 const d=datiCasaCompleta(accumulo,disegno),completo=renderFvPdfHtml(d),tutte=completo.split(/(?=<div class="page">)/),ids:readonly FvPdfPageId[]=pagina?[pagina]:PAGINE_CASA_VISUALI;
 const pagine=tutte.filter(p=>ids.some(id=>p.includes(`data-fv-section="${id}"`)));
 if(!pagine.length)throw new Error("Anteprima casa non disponibile");
 const corpo=pagine.map((p,i)=>p.replace(/<span class="pnum">[^<]*<\/span>/,`<span class="pnum">${i+1} / ${pagine.length}</span>`)).join("");
 return {html:`${completo.slice(0,completo.indexOf("<body"))}<body>${corpo}</body></html>`,pagine:pagine.length};
}
