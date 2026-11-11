import {describe,it,expect} from "vitest";
import {documentoCasaTettoReale,datiCasaTettoReale,visualeRiepilogoTetto,fornituraCasaReale,PAGINE_CASA_REALE} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {posaCasaTracciata} from "../../../dev/fotovoltaico-locale/campioneAreaTracciata";
import {htmlDecisioneVendita,htmlFornituraVendita,pagineFornituraVendita,riepilogoFornitura,svgFlussiTettoVendita,type VoceFornitura} from "../../../dev/fotovoltaico-locale/casaVendita";
import {renderFvPdfHtml} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import {svgScenaEnergia} from "../../../supabase/functions/_shared/fvBilancioEnergia";
const pagina=(html:string,id:string)=>html.split(/(?=<div class="page">)/).find(h=>h.includes(`data-fv-section="${id}"`))!.replace(/<span class="pnum">[^<]*<\/span>/,'<span class="pnum"></span>').replace(/<\/body>[\s\S]*$/,'');
describe("proposta casa orientata alla decisione",()=>{
 it("anticipa il beneficio, chiude sul prossimo passo e conserva il disegno giorno/notte",()=>{
  expect(PAGINE_CASA_REALE[2]).toBe("risparmio");expect(PAGINE_CASA_REALE.at(-1)).toBe("decisione");
  const d=datiCasaTettoReale(posaCasaTracciata),doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata);
  expect(doc.pagine).toBe(12);expect(doc.html.match(/<div class="page">/g)).toHaveLength(12);
  expect(pagina(doc.html,"giorno_sera")).toBe(pagina(renderFvPdfHtml(d),"giorno_sera"));
 });
 it("ripristina esattamente la casa illustrata approvata con i valori correnti",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),svg=svgFlussiTettoVendita(d);
  expect(svg).toBe(svgScenaEnergia(d.flows,d.progetto.consumo_annuo_kwh,{tipo:"casa",hasAccumulo:false}).replace('style="width:100%;display:block"','class="cv-energy" style="width:100%;display:block"'));
  for(const n of ["1.315","723","592","2.777"])expect(svg).toContain(n);
  expect(svg).not.toContain("GEOMETRIA DEL CAMPIONE");
 });
 it("ripristina chi siamo e domande e usa la foto del tetto nel riepilogo",()=>{
  const doc=documentoCasaTettoReale("foto-campione.jpg",undefined,posaCasaTracciata),chiSiamo=pagina(doc.html,"garanzie"),finale=pagina(doc.html,"decisione");
  expect(chiSiamo).toContain("Chi siamo.");expect(chiSiamo).toContain("Demo Solar");expect(chiSiamo).toContain("personalizzabile nel modello");
  expect(chiSiamo).not.toContain("25 anni di tranquillità");expect(doc.html).toContain('data-fv-section="faq"');
  expect(finale).toContain('data-visuale="foto-tetto"');expect(finale).toContain('href="foto-campione.jpg"');expect(finale).toContain("pannelli simulati");expect(finale).not.toContain("disposizione ricavata dal modello 3D");
 });
 it("riporta importi e segnala l’assenza del recupero senza promesse artificiali",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),h=htmlDecisioneVendita(d,visualeRiepilogoTetto("foto",posaCasaTracciata));
  expect(h).toContain("4.282");expect(h).toContain("19,28");expect(h).toContain("231");expect(h).toContain("non si recupera nei 25 anni simulati");expect(h).toContain("Concorda un sopralluogo");expect(h).not.toContain("Recupero stimato:");
 });
 it("separa le attività previste da quelle da concordare senza inventare garanzie",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),voci=fornituraCasaReale(d),h=htmlFornituraVendita(d,voci);
  expect(voci.find(v=>v.titolo==="Pratiche e ulteriori lavorazioni")!.stato).toBe("da_definire");expect(h).toContain("Durate e condizioni da confermare");expect(h).not.toContain("25 anni");expect(h).not.toContain("gratuito");
  d.componenti[0].garanzia_anni=12;expect(htmlFornituraVendita(d,voci)).toContain("12 anni indicati");
 });
 it("non interpreta nomi e dettagli della fornitura come HTML",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),h=htmlFornituraVendita(d,[{titolo:'<script>attacco</script>',dettaglio:'<img src=x onerror=attacco()>',stato:"da_definire"}]);
  expect(h).not.toContain("<script>");expect(h).toContain("&lt;script&gt;");expect(h).not.toContain("<img src=x");
 });
 it("fa quadrare righe, IVA e arrotondamento con la spesa mostrata nelle altre pagine",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),v=fornituraCasaReale(d),r=riepilogoFornitura(d,v),h=htmlFornituraVendita(d,v);
  expect(r).toMatchObject({netto:3510,iva:772.2,arrotondamento:-.2,totale:4282,quadrato:true});
  expect(h).toContain('aria-label="Dettaglio della fornitura"');expect(h).toContain("540,00");expect(h).toContain("4.282,00");expect(h).toContain("Arrotondamento");
  expect(h.indexOf("Totale IVA inclusa")).toBeGreaterThan(h.indexOf("Pratiche e ulteriori lavorazioni"));
 });
 it("accetta una caldaia con foto e prezzo senza trattarla come un inverter e senza includere le opere ancora da definire",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),v:VoceFornitura[]=[{titolo:"Caldaia a condensazione",dettaglio:"Modello scelto dal listino",quantita:1,unita:"pz",prezzoUnitarioNetto:2500,stato:"previsto",immagine:"https://example.com/caldaia.webp"},{titolo:"Opere murarie",dettaglio:"Da verificare",quantita:1,prezzoUnitarioNetto:500,stato:"da_definire"}];
  d.costi.prezzo_vendita_iva_inclusa=3050;
  expect(riepilogoFornitura(d,v)).toMatchObject({netto:2500,iva:550,totale:3050,quadrato:true});
  const h=htmlFornituraVendita(d,v);expect(h).toContain('src="https://example.com/caldaia.webp"');expect(h).toContain("Caldaia a condensazione");expect(h).toContain("esclusa dal totale");expect(h).not.toContain("inverter");
 });
 it("non conferma il totale se mancano prezzi o se le righe non corrispondono al preventivo",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),v=fornituraCasaReale(d);
  v[0].prezzoUnitarioNetto=undefined;
  expect(riepilogoFornitura(d,v).quadrato).toBe(false);expect(htmlFornituraVendita(d,v)).toContain("Importi da completare");
  v[0].prezzoUnitarioNetto=1000;expect(riepilogoFornitura(d,v).quadrato).toBe(false);
  v[0].prezzoUnitarioNetto=NaN;expect(()=>riepilogoFornitura(d,v)).toThrow();
 });
 it("porta una fornitura lunga su più pagine senza perdere righe e mostra il totale una volta sola",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),v:VoceFornitura[]=Array.from({length:14},(_,i)=>({titolo:`Articolo aggiuntivo ${i+1}`,dettaglio:"Accessorio della fornitura",quantita:1,unita:"pz",prezzoUnitarioNetto:10,stato:"previsto"}));
  d.costi.prezzo_vendita_iva_inclusa=170.8;
  const pagine=pagineFornituraVendita(d,v),h=pagine.join("");expect(pagine).toHaveLength(3);
  for(const voce of v)expect(h.split(`>${voce.titolo}</strong>`)).toHaveLength(2);
  expect(h.match(/Totale IVA inclusa/g)).toHaveLength(1);expect(pagine.at(-1)).toContain("170,80");
 });
 it("scarta indirizzi di immagini eseguibili e protegge gli attributi della tabella",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),v:VoceFornitura={titolo:'Prodotto " speciale',dettaglio:"Accessorio",stato:"da_definire",immagine:"javascript:alert(1)",unita:'pz"><script>'};
  const h=htmlFornituraVendita(d,[v]);expect(h).not.toContain("javascript:");expect(h).not.toContain("<script>");expect(h).toContain("&lt;script&gt;");
 });
});
