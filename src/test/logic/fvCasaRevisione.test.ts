import {describe,it,expect} from "vitest";
import {trattiPercorsoCasa,svgPercorsoCasa,htmlPercorsoCasa} from "../../../supabase/functions/_shared/fvCasaEditoriale";
import {htmlRiepilogoCasa,visualeRiepilogoCasa,pagamentoRiepilogoCasa} from "../../../supabase/functions/_shared/fvCasaSintesi";
import {datiCasaCompleta,documentoCasaCompleta} from "../../../dev/fotovoltaico-locale/casaCompleta";
import {renderFvPdfHtml,getFvPdfRenderedPagesCount} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import {leggiDisegnoCommerciale} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
describe("Grafico che distingue il recupero dal saldo positivo",()=>{
 it("cambia colore esattamente allo zero senza spostare i punti del calcolo",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-1000},{anno:2,cumulato:1000}];d.scenario.payback_anni=1;
  const originale=structuredClone(d.scenario.cassa_anno_per_anno),t=trattiPercorsoCasa(d);
  expect(t).toEqual([{negativo:true,punti:[{anno:0,cumulato:-1000},{anno:1,cumulato:0}]},{negativo:false,punti:[{anno:1,cumulato:0},{anno:2,cumulato:1000}]}]);
  expect(d.scenario.cassa_anno_per_anno).toEqual(originale);expect(svgPercorsoCasa(d)).toContain('data-saldo="negativo"');expect(svgPercorsoCasa(d)).toContain('data-saldo="positivo"');
 });
 it("mantiene le successive perdite invece di colorare tutto il periodo dopo il primo pareggio di verde",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-100},{anno:1,cumulato:100},{anno:2,cumulato:-100},{anno:3,cumulato:200}];d.scenario.payback_anni=1;
  expect(trattiPercorsoCasa(d).map(t=>t.negativo)).toEqual([true,false,true,false]);
  expect(svgPercorsoCasa(d)).not.toContain("Pareggio stimato");
 });
 it("con un periodo interamente negativo non promette il recupero",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-1000},{anno:20,cumulato:-300}];d.scenario.payback_anni=null;
  expect(trattiPercorsoCasa(d).every(t=>t.negativo)).toBe(true);expect(htmlPercorsoCasa(d)).not.toContain("Recuperi la spesa.");expect(htmlPercorsoCasa(d)).toContain("Nessun saldo positivo nel periodo");
 });
 it("distingue il pareggio finale da un guadagno positivo",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-1000},{anno:20,cumulato:0}];d.scenario.payback_anni=20;
  const h=htmlPercorsoCasa(d);expect(h).toContain("Saldo in pareggio");expect(h).not.toContain("Saldo cumulato positivo");expect(h).toContain("non emerge ancora un saldo positivo");
 });
 it("gestisce una serie piatta senza coordinate non finite o aree fittizie",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:0},{anno:25,cumulato:0}];d.scenario.payback_anni=null;
  expect(svgPercorsoCasa(d)).not.toMatch(/NaN|Infinity/);
 });
});
describe("Sintesi con la disposizione del preventivo",()=>{
 it("usa la geometria coerente e non attribuisce il campione al tetto del cliente",()=>{
  const d=datiCasaCompleta(),v=visualeRiepilogoCasa(d),p=leggiDisegnoCommerciale(d.progetto.layout_overlay)!;
  expect(p.pannelli).toHaveLength(d.progetto.numero_pannelli);expect(v.tipo).toBe("disegno");expect(v.html).toContain("Disposizione proposta");expect(v.nota).toContain("commerciale da confermare");
  expect(visualeRiepilogoCasa(datiCasaCompleta(true,false)).tipo).toBe("illustrazione");
 });
 it("non mostra un disegno con quantità incoerente o moduli sovrapposti, neppure se esiste un vecchio render",()=>{
  const d=datiCasaCompleta();d.render_impianto={img:"data:image/png;base64,AAAA",didascalia:"Vecchio render"};
  d.progetto.numero_pannelli++;expect(visualeRiepilogoCasa(d).tipo).toBe("illustrazione");d.progetto.numero_pannelli--;
  const p=leggiDisegnoCommerciale(d.progetto.layout_overlay)!;p.pannelli[1]={...p.pannelli[1],x:p.pannelli[0].x,y:p.pannelli[0].y};d.progetto.layout_overlay=p;
  expect(visualeRiepilogoCasa(d).tipo).toBe("illustrazione");
 });
 it("mostra prezzo IVA inclusa, energia, minor costo e copertura dai dati, senza inventare le modalità di pagamento",()=>{
  const d=datiCasaCompleta();d.modalita_pagamento=null;const h=htmlRiepilogoCasa(d);
  for(const valore of ["18.000","7.400","1.344","82%","12 pannelli"])expect(h).toContain(valore);
  expect(h).toContain("modalità e scadenze da confermare");expect(h).toContain("Anteprima dimostrativa");expect(h).not.toContain("Come si firma");
 });
 it("preserva rate al centesimo, anticipo e TAEG senza sottrarre il risparmio dal pagamento contrattuale",()=>{
  const d=datiCasaCompleta();d.finanziamento={finanziaria:"Finanziaria",durata_mesi:60,rata_mensile:205.76,tan_perc:0,taeg_perc:1.2,importo_finanziato:12345};
  d.modalita_pagamento={tipo:"finanziato",anticipo_pct:30,anticipo_eur:3000,finanziato_eur:12345,rata_mensile:205.76,durata_mesi:60,tasso_zero:false,note:null};
  const h=pagamentoRiepilogoCasa(d);expect(h).toContain("205,76");expect(h).toContain("3.000");expect(h).toContain("1,20%");expect(h).toContain("separatamente dalla rata");
 });
 it("non esegue nomi, didascalie o immagini non attendibili",()=>{
  const d=datiCasaCompleta(true,false);d.cliente.nome='<script>alert(1)</script>';d.render_impianto={img:"javascript:alert(2)",didascalia:"<img src=x onerror=alert(3)>"};
  const h=htmlRiepilogoCasa(d);expect(h).toContain("&lt;script&gt;");expect(h).not.toContain("javascript:");expect(h).not.toContain("<script>");
 });
});
describe("Integrazione del riepilogo e rispetto del flusso contrattuale",()=>{
 it("non allega firme al campione, conserva le firme per i preventivi reali e conta le pagine",()=>{
  const demo=datiCasaCompleta(),html=renderFvPdfHtml(demo);expect(html).not.toContain('data-fv-section="firma"');expect(html).toContain("Anteprima dimostrativa");
  demo.anteprima_dimostrativa=false;const reale=renderFvPdfHtml(demo);expect(reale).toContain('data-fv-section="firma"');expect(reale).toContain("Come si firma");
  expect(reale.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(demo));
 });
 it("mantiene i titoli e il testo personalizzato del prossimo passo",()=>{
  const d=datiCasaCompleta();d.template={...d.template,pdf_cta_finale_titolo:"Una proposta per te",pdf_cta_finale_testo:"<p>Contatta il referente per il sopralluogo concordato.</p>"};
  const h=renderFvPdfHtml(d);expect(h).toContain("fc-summary-offer");expect(h).toContain("Una proposta per te");expect(h).toContain("sopralluogo concordato");
 });
 it("il disegno opzionale non cambia prezzi, energia o cashflow e aggiorna la pagina di anteprima",()=>{
  const con=datiCasaCompleta(true,true),senza=datiCasaCompleta(true,false);expect(con.costi).toEqual(senza.costi);expect(con.flows).toEqual(senza.flows);expect(con.scenario).toEqual(senza.scenario);
  expect(documentoCasaCompleta(true,undefined,true).pagine).toBe(7);expect(documentoCasaCompleta(true,undefined,false).pagine).toBe(6);
  expect(documentoCasaCompleta(true,"decisione",false).html).toContain('data-visuale="illustrazione"');
 });
});
