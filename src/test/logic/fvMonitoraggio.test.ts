import {describe,it,expect} from "vitest";
import {htmlMonitoraggioFv,leggiMonitoraggioFv,MONITORAGGIO_DEMO_INCLUSO,IMMAGINE_MONITORAGGIO_FV} from "../../../supabase/functions/_shared/fvMonitoraggio";
import {datiCasaTettoReale,documentoCasaTettoReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {posaCasaTracciata} from "../../../dev/fotovoltaico-locale/campioneAreaTracciata";
import {renderFvPdfHtml,getFvPdfRenderedPagesCount,fotoDeiBlocchiFv} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import {createFullFvTemplate} from "../../../src/lib/moduli-vendita/fullFvModules";
import {saveLocalFvTemplate,loadLocalFvTemplate} from "../../../src/lib/moduli-vendita/localFvTemplates";
describe("monitoraggio configurabile per azienda",()=>{
 it("resta spento se non configurato e non inserisce immagini o promesse nei vecchi modelli",()=>{
  expect(leggiMonitoraggioFv().attivo).toBe(false);expect(htmlMonitoraggioFv(leggiMonitoraggioFv())).toBe("");
  const d=datiCasaTettoReale(posaCasaTracciata);expect(renderFvPdfHtml(d)).not.toContain('data-fv-section="monitoraggio"');
 });
 it.each(["inclusa","gratuita"] as const)("app %s: nessun costo e nessun prezzo di servizio ereditato",modalita=>{
  const c=leggiMonitoraggioFv({monitoraggio:{...MONITORAGGIO_DEMO_INCLUSO,app:{modalita,nome:"App",prezzoNetto:250,periodicita:"mensile"}}});
  expect(c.app.prezzoNetto).toBeNull();const h=htmlMonitoraggioFv(c);expect(h).toContain("Nessun costo aggiuntivo per l’app");expect(h).not.toContain("250");expect(h).not.toContain("+ IVA");expect(h).toContain(IMMAGINE_MONITORAGGIO_FV);
 });
 it("separa app gratuita da un’assistenza facoltativa annuale, senza aggiungerla alla rata o al prezzo base",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),c=leggiMonitoraggioFv({monitoraggio:{...MONITORAGGIO_DEMO_INCLUSO,servizio:{attivo:true,titolo:"Assistenza premium",descrizione:"Condizioni di esempio",prezzoNetto:120,periodicita:"annuale"}}}),prima=JSON.stringify(d),h=htmlMonitoraggioFv(c);
  expect(h).toContain("Nessun costo aggiuntivo per l’app");expect(h).toContain("120,00");expect(h).toContain("/ anno");expect(h).toContain("non selezionato");expect(JSON.stringify(d)).toBe(prima);
  c.servizio.attivo=false;expect(htmlMonitoraggioFv(c)).not.toContain("120,00");
 });
 it("non presenta l’app a pagamento come inclusa e non inventa importi mancanti",()=>{
  const c=leggiMonitoraggioFv({monitoraggio:{...MONITORAGGIO_DEMO_INCLUSO,app:{modalita:"opzionale_pagamento",nome:"App Pro",prezzoNetto:null,periodicita:"mensile"}}});
  expect(htmlMonitoraggioFv(c)).toContain("Costo da quotare");expect(htmlMonitoraggioFv(c)).not.toContain("Nessun costo aggiuntivo");
  c.app.prezzoNetto=9.9;expect(htmlMonitoraggioFv(c)).toContain("9,90");expect(htmlMonitoraggioFv(c)).toContain("/ mese");
 });
 it("può nascondere solo l’immagine oppure tutta la pagina, con conteggio corretto e asset incorporabile",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata);d.template!.pdf_blocchi!.monitoraggio=MONITORAGGIO_DEMO_INCLUSO;
  const h=renderFvPdfHtml(d);expect(h).toContain('data-fv-section="monitoraggio"');expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));expect(fotoDeiBlocchiFv(d.template).monitoraggio).toEqual([IMMAGINE_MONITORAGGIO_FV]);
  const c={...MONITORAGGIO_DEMO_INCLUSO,mostraImmagine:false};expect(htmlMonitoraggioFv(c)).not.toContain("<img");
  const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,{monitoraggio:c});expect(doc.pagine).toBe(13);
  c.attivo=false;expect(documentoCasaTettoReale("foto",undefined,posaCasaTracciata,{monitoraggio:c}).pagine).toBe(12);
 });
 it("salva le condizioni solo nel modello dell’azienda corretta",()=>{
  const records=new Map<string,string>(),storage={getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)}};
  const a=createFullFvTemplate({},"a","aziendale"),b=createFullFvTemplate({},"b","aziendale");a.pdf_blocchi!.monitoraggio=MONITORAGGIO_DEMO_INCLUSO;
  saveLocalFvTemplate("a","aziendale",a,null,storage);saveLocalFvTemplate("b","aziendale",b,null,storage);
  expect(leggiMonitoraggioFv(loadLocalFvTemplate("a","aziendale",storage)!.template.pdf_blocchi).attivo).toBe(true);
  expect(leggiMonitoraggioFv(loadLocalFvTemplate("b","aziendale",storage)!.template.pdf_blocchi).attivo).toBe(false);
 });
 it("protegge testi e immagine da contenuti eseguibili",()=>{
  const c=structuredClone(MONITORAGGIO_DEMO_INCLUSO);c.app.nome='<script>attacco</script>';c.note='<img src=x onerror=x>';
  const h=htmlMonitoraggioFv(c,"javascript:alert(1)");expect(h).not.toContain("<script>");expect(h).not.toContain("<img src=x");expect(h).not.toContain("javascript:");expect(h).toContain("&lt;script&gt;");
 });
});
