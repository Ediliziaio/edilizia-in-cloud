import {describe,it,expect} from "vitest";
import {datiCasaTettoReale,documentoCasaTettoReale,pagineCasaRealeDisponibili} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {posaCasaTracciata} from "../../../dev/fotovoltaico-locale/campioneAreaTracciata";
import {OPTIONAL_CASA_DEMO,pagineConfrontoOptional,paginePagamentiProposta,importoOptional,htmlPagamentiProposta,datiPagamentiProposta} from "../../../dev/fotovoltaico-locale/propostaOptionalPagamenti";
const OPZIONI_CASA_DEMO={confronto:{attivo:true,optional:OPTIONAL_CASA_DEMO}};
describe("optional facoltativi e condizioni del campione locale",()=>{
 it("non impone la pagina optional a chi non ha alternative o la lascia disattivata",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata);
  for(const config of [undefined,{attivo:false,optional:OPTIONAL_CASA_DEMO},{attivo:true,optional:[]}]){
   expect(pagineConfrontoOptional(d,config)).toEqual([]);
   expect(pagineCasaRealeDisponibili({confronto:config})).not.toContain("confronto_optional");
   const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,{confronto:config});
   expect(doc.pagine).toBe(12);expect(doc.html).not.toContain('data-fv-section="confronto_optional"');
   expect(doc.html).not.toContain("Gli optional restano esclusi");
  }
 });
 it("calcola il supplemento con IVA senza alterare prezzo base, consumi e risparmi",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),prima=JSON.stringify(d),h=pagineConfrontoOptional(d,OPZIONI_CASA_DEMO.confronto).join("");
  expect(importoOptional(OPTIONAL_CASA_DEMO[0],22)).toBe(305);
  expect(h).toContain("4.282,00");expect(h).toContain("305,00");expect(h).toContain("4.587,00");expect(h).toContain("non selezionato");
  expect(JSON.stringify(d)).toBe(prima);expect(h).not.toContain("risparmio aggiuntivo garantito");
  const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,OPZIONI_CASA_DEMO);
  expect(doc.pagine).toBe(13);expect(doc.html).toContain("13 / 13");expect(doc.html).toContain('data-fv-section="pagamenti_scadenze"');
 });
 it("conserva le pagine con le immagini approvate quando si attiva il confronto",()=>{
  const base=documentoCasaTettoReale("foto",undefined,posaCasaTracciata),extra=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,OPZIONI_CASA_DEMO);
  const leggi=(h:string,id:string)=>h.split(/(?=<div class="page">)/).find(p=>p.includes(`data-fv-section="${id}"`))!.replace(/<span class="pnum">[^<]*<\/span>/,'<span class="pnum"></span>').replace(/<\/body>[\s\S]*$/,"");
  for(const id of ["tetto_reale","garanzie","flussi","giorno_sera","schede_prodotti","decisione"])expect(leggi(extra.html,id)).toBe(leggi(base.html,id));
 });
 it("non inventa il prezzo di un optional non quotato e porta le alternative lunghe su più pagine",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),optional=Array.from({length:7},(_,i)=>({...OPTIONAL_CASA_DEMO[0],id:String(i),titolo:`Optional ${i+1}`,prezzoUnitarioNetto:undefined as number|undefined,immagine:undefined as string|undefined}));
  const h=pagineConfrontoOptional(d,{attivo:true,optional});expect(h).toHaveLength(4);expect(h.join("")).toContain("Da quotare");expect(h.join("")).not.toContain("4.587");
  expect(()=>importoOptional({...OPTIONAL_CASA_DEMO[0],quantita:-1},22)).toThrow();
 });
 it("stampa solo scadenze fornite, mantiene le date vuote da concordare e controlla la quadratura",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata),p=datiPagamentiProposta(d);
  expect(p).toMatchObject({totale:4282,valido:true});expect(p!.tranche[0].scadenza).toBe("Da concordare");
  const h=htmlPagamentiProposta(d,[{evento:"Alla consegna concordata",data:"2026-12-15"}]);
  expect(h).toContain("15/12/2026");expect(h).toContain("Alla consegna concordata");expect(h).toContain("4.282,00");
  d.modalita_pagamento={tipo:"diretto",tranche:[{label:"Acconto",pct:30,importo_eur:1284.6},{label:"Saldo",pct:70,importo_eur:2997.4}],note:null};
  expect(datiPagamentiProposta(d)!.valido).toBe(true);
  d.modalita_pagamento.tranche[1].importo_eur=3000;expect(datiPagamentiProposta(d)!.valido).toBe(false);expect(htmlPagamentiProposta(d)).toContain("Piano da verificare");
 });
 it("gestisce il pagamento non definito e protegge i testi inseriti dall’utente",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata);
  expect(()=>htmlPagamentiProposta(d,[{data:"2026-02-30"}])).toThrow();
  expect(htmlPagamentiProposta(d,[{evento:'<script>alert(1)</script>'}])).not.toContain("<script>");
  const h=pagineConfrontoOptional(d,{attivo:true,optional:[{...OPTIONAL_CASA_DEMO[0],titolo:'<img src=x onerror=x>',descrizione:'<script>attacco</script>'}]}).join("");
  expect(h).not.toContain("<script>");expect(h).not.toContain("<img src=x");
  d.modalita_pagamento=null;expect(htmlPagamentiProposta(d)).toContain("modalità e scadenze da confermare");
 });
 it("conserva importi e scadenze quando il piano di pagamento continua su altre pagine",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata);d.costi.prezzo_vendita_iva_inclusa=700;
  d.modalita_pagamento={tipo:"diretto",tranche:Array.from({length:7},(_,i)=>({label:`Versamento ${i+1}`,pct:100/7,importo_eur:100})),note:null};
  const scadenze=Array.from({length:7},(_,i)=>({data:`2026-12-${String(i+1).padStart(2,"0")}`})),p=paginePagamentiProposta(d,scadenze),h=p.join("");
  expect(p).toHaveLength(3);expect(h.match(/Totale versamenti/g)).toHaveLength(1);expect(p.at(-1)).toContain("07/12/2026");expect(p.at(-1)).toContain("700,00");
  for(let i=1;i<=7;i++)expect(h.split(`>Versamento ${i}</strong>`)).toHaveLength(2);
 });
});
