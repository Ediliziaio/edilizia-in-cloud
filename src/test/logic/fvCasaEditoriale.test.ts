import {describe,it,expect} from "vitest";
import {datiBollettaCasa,htmlBollettaCasa,htmlGiornoSeraCasa,datiPercorsoCasa,htmlPercorsoCasa,svgPercorsoCasa} from "../../../supabase/functions/_shared/fvCasaEditoriale";
import {datiCasaCompleta,documentoCasaCompleta} from "../../../dev/fotovoltaico-locale/casaCompleta";
import {renderFvPdfHtml,getFvPdfRenderedPagesCount} from "../../../supabase/functions/_shared/fvHtmlTemplate";
describe("Bolletta privata con dati dichiarati",()=>{
 it("conserva le quote fisse e distingue minor costo in bolletta dai ricavi della cessione",()=>{
  const d=datiCasaCompleta();d.scenario.ricavi_rid_anno1_eur=500;
  const b=datiBollettaCasa(d);expect(b.totalePrima).toBe(1812);expect(b.totaleDopo).toBe(468);expect(b.evitata).toBe(1344);expect(b.rid).toBe(500);
  expect(b.totalePrima-b.totaleDopo).toBe(b.evitata);
  const h=htmlBollettaCasa(d);expect(h).toContain("separati dalla bolletta");expect(h).toContain("180");
 });
 it("senza quote fisse non dichiara un totale della futura bolletta",()=>{
  const d=datiCasaCompleta();delete d.progetto.costi_fissi_annui_eur;
  const h=htmlBollettaCasa(d);expect(h).toContain("non il totale futuro della bolletta");expect(h).toContain("Non separate");
  expect(datiBollettaCasa(d).totaleDopo).toBe(288);
 });
 it("con autoconsumo totale conserva una bolletta residua per i costi fissi",()=>{
  const d=datiCasaCompleta();d.flows={...d.flows,produzione_kwh:5100,autoconsumo_kwh:5100,ceduto_rete_kwh:0,prelievo_rete_kwh:0};
  expect(datiBollettaCasa(d).totaleDopo).toBe(180);
 });
 it.each([Number.NaN,Number.POSITIVE_INFINITY,-1])("rifiuta una tariffa non valida %s",prezzo=>{
  const d=datiCasaCompleta();d.progetto.costo_kwh_attuale=prezzo;expect(()=>datiBollettaCasa(d)).toThrow(/Tariffa/);
 });
});
describe("Giorno e sera senza simulazioni orarie inventate",()=>{
 it("mostra i percorsi dell'accumulo solo con batteria prevista",()=>{
  const con=htmlGiornoSeraCasa(true),senza=htmlGiornoSeraCasa(false);
  expect(con).toContain("capacità disponibile");expect(con).toContain("non garantisce alimentazione durante un blackout");
  expect(con).toContain('translate(486 472)');expect(senza).not.toContain('translate(486 472)');
  expect(senza).toContain("l’energia necessaria viene acquistata dalla rete");
  expect(con).not.toContain("kWh");expect(con).toContain("non quantità o prestazioni orarie");
 });
});
describe("Percorso dell'investimento sul cashflow effettivo",()=>{
 it("usa i punti forniti, conserva le perdite e non promette un pareggio non raggiunto",()=>{
  const d=datiCasaCompleta();d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-10000},{anno:5,cumulato:-8000},{anno:10,cumulato:-5000}];d.scenario.payback_anni=15;
  const r=datiPercorsoCasa(d)!;expect(r.fine.anno).toBe(10);expect(r.fine.cumulato).toBe(-5000);expect(r.pareggio).toBeNull();
  const h=htmlPercorsoCasa(d);expect(h).toContain("ancora negativo");expect(h).toContain("Non indicato");expect(h).not.toContain("+-");expect(h).not.toContain("Anno 25");
  expect(svgPercorsoCasa(d)).not.toMatch(/NaN|Infinity/);
 });
 it("non conferma un pareggio seguito da nuovi saldi negativi",()=>{
  const d=datiCasaCompleta();d.scenario.payback_anni=2;d.scenario.cassa_anno_per_anno=[{anno:0,cumulato:-1000},{anno:2,cumulato:0},{anno:3,cumulato:-500},{anno:10,cumulato:100}];expect(datiPercorsoCasa(d)!.pareggio).toBeNull();
 });
 it("non inventa una curva con dati assenti, duplicati o non finiti",()=>{
  const d=datiCasaCompleta();for(const dati of [[],[{anno:0,cumulato:-1}],[{anno:0,cumulato:-1},{anno:0,cumulato:1}],[{anno:0,cumulato:-1},{anno:1,cumulato:NaN}]]){d.scenario.cassa_anno_per_anno=dati;expect(datiPercorsoCasa(d)).toBeNull();expect(htmlPercorsoCasa(d)).toContain("non è disponibile o non è coerente");}
 });
});
describe("Schede, ordine e anteprima native",()=>{
 it("esporta sette pagine senza cambiare o aggiungere la copertina",()=>{
  const d=documentoCasaCompleta();expect(d.pagine).toBe(7);expect(d.html.match(/<div class="page">/g)).toHaveLength(7);
  for(const id of ["piano_tetto","decisione","flussi","giorno_sera","schede_prodotti","risparmio","cassa_25"])expect(d.html).toContain(`data-fv-section="${id}"`);
  expect(d.html).not.toContain('data-fv-section="cover"');expect(d.html).not.toContain('data-fv-section="firma"');
  expect(d.html).toContain("Immagine illustrativa della categoria");expect(d.html).toContain("/modulo-fotovoltaico-full-black.webp");
 });
 it("paginate più prodotti senza perderli e aggiorna il numero totale delle pagine",()=>{
  const d=datiCasaCompleta();d.componenti=Array.from({length:11},(_,i)=>({...d.componenti[0],modello:`Prodotto ${i}`,descrizione:`Articolo distinto ${i}`}));
  const h=renderFvPdfHtml(d);expect(h.match(/class="fc-product"/g)).toHaveLength(11);expect(h.match(/data-fv-section="schede_prodotti"/g)).toHaveLength(4);
  expect(h.match(/<div class="page">/g)).toHaveLength(getFvPdfRenderedPagesCount(d));
 });
 it("rispetta visibilità, immagini mancanti e stringhe non attendibili nelle schede",()=>{
  const d=datiCasaCompleta();d.componenti=[{categoria:"inverter",descrizione:'<script>alert("x")</script>',modello:"Test",quantita:1,image_url:"javascript:alert(1)",scheda_tecnica_url:"javascript:alert(2)"}];
  const h=renderFvPdfHtml(d);expect(h).toContain("&lt;script&gt;");expect(h).not.toContain("javascript:");expect(h).toContain("Schema illustrativo della categoria");
  expect(h).not.toContain("5,8kW");
  d.template!.pdf_pages_order=d.template!.pdf_pages_order!.map(p=>p.id==="schede_prodotti"?{...p,visible:false}:p);
  expect(renderFvPdfHtml(d)).not.toContain('data-fv-section="schede_prodotti"');
 });
 it("confronta due configurazioni con flussi, componenti e prezzi coerenti",()=>{
  const con=datiCasaCompleta(true),senza=datiCasaCompleta(false);
  expect(senza.componenti.some(c=>c.categoria==="accumulo")).toBe(false);expect(senza.costi.prezzo_vendita_iva_inclusa).toBe(11000);
  expect(con.scenario.cassa_anno_per_anno[0].cumulato).toBe(-18000);expect(senza.scenario.cassa_anno_per_anno[0].cumulato).toBe(-11000);
  expect(con.scenario.risparmio_anno1_eur).toBe(con.flows.autoconsumo_kwh*.32);expect(senza.scenario.risparmio_anno1_eur).toBe(senza.flows.autoconsumo_kwh*.32);
 });
});
