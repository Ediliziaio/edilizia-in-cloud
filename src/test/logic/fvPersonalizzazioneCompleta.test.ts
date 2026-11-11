import {describe,it,expect} from "vitest";
import {catalogoPersonalizzazioneFv,personalizzaDocumentoFv,contestoPersonalizzazioneFv,validaTestoModelloFv,BLOCCO_TESTI_FV,PREFISSO_MEDIA_FV,senzaPersonalizzazioniFv} from "../../../supabase/functions/_shared/fvPersonalizzazioneCompleta";
import {datiCasaTettoReale,documentoCasaTettoReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {posaCasaTracciata} from "../../../dev/fotovoltaico-locale/campioneAreaTracciata";
import {renderFvPdfHtml,fotoDeiBlocchiFv} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import {immaginiDelModello,CAMPI_IMMAGINE_FOTOVOLTAICO,sostituisciImmagini} from "../../../supabase/functions/_shared/immaginiModelloPdf";
const ctx={variabili:{azienda:"Impresa A"},immaginiDati:[] as string[]};
const esempio=(n=60)=>`<html><body><div class="page"><div data-fv-section="piano_pagamento"></div><h1>La rata e il risparmio.</h1><p>Per ${n} mesi con Impresa A.</p><strong>85,00 €</strong><img src="/foto.png" alt="Foto standard"/><svg viewBox="0 0 20 20" aria-label="Sigillo"><path d="M0 0h20"/></svg><script>window.test=1;</script></div></body></html>`;
describe("tutti i testi e le immagini del modello FV",()=>{
 it("senza personalizzazioni conserva esattamente il documento approvato",()=>{
  expect(personalizzaDocumentoFv(esempio(),{},ctx)).toBe(esempio());
  const d=datiCasaTettoReale(posaCasaTracciata),h=renderFvPdfHtml(d);expect(personalizzaDocumentoFv(h,{},contestoPersonalizzazioneFv(d))).toBe(h);
 });
 it("modifica titoli, paragrafi e grafici senza interpretare HTML o JavaScript",()=>{
  const p=catalogoPersonalizzazioneFv(esempio(),ctx)[0],titolo=p.testi.find(t=>t.tipo==="h1")!,b={[BLOCCO_TESTI_FV]:{testi:{[titolo.id]:'Il tuo impianto <script>alert(1)</script> $&'}}};
  const h=personalizzaDocumentoFv(esempio(),b,ctx);expect(h).toContain('Il tuo impianto &lt;script&gt;alert(1)&lt;/script&gt; $&');expect(h).not.toContain('<script>alert(1)');expect(h).toContain('window.test=1;');expect(h).toContain('85,00 €');
 });
 it("mantiene i valori collegati anche con durata e azienda differenti",()=>{
  const t=catalogoPersonalizzazioneFv(esempio(),ctx)[0].testi.find(t=>t.tipo==="p")!,testo="Durata concordata: {valore_1} mesi · {azienda}.";
  expect(validaTestoModelloFv(testo,t)).toBeNull();expect(validaTestoModelloFv("Durata 60 mesi",t)).not.toBeNull();expect(validaTestoModelloFv(testo+" {valore_1}",t)).not.toBeNull();
  const b={[BLOCCO_TESTI_FV]:{testi:{[t.id]:testo}}};expect(personalizzaDocumentoFv(esempio(72).replace('Impresa A','Impresa B'),b,{...ctx,variabili:{azienda:"Impresa B"}})).toContain('Durata concordata: 72 mesi · Impresa B.');
 });
 it("sostituisce o nasconde una foto e rifiuta protocolli eseguibili senza cambiare il layout della figura",()=>{
  const m=catalogoPersonalizzazioneFv(esempio(),ctx)[0].immagini.find(m=>m.tipo==="foto")!,k=PREFISSO_MEDIA_FV+m.id;
  expect(personalizzaDocumentoFv(esempio(),{[k]:{foto:['https://example.com/foto$&.png']}},ctx)).toContain('src="https://example.com/foto$&amp;.png"');
  expect(personalizzaDocumentoFv(esempio(),{[k]:{foto:['javascript:alert(1)']}},ctx)).toBe(esempio());
  expect(personalizzaDocumentoFv(esempio(),{[k]:{nascosta:true}},ctx)).not.toContain('alt="Foto standard"');
 });
 it("permette di sostituire un’icona preservando viewBox e dimensioni e protegge le foto dei prodotti",()=>{
  const p=catalogoPersonalizzazioneFv(esempio(),ctx)[0],m=p.immagini.find(m=>m.tipo==="illustrazione")!,k=PREFISSO_MEDIA_FV+m.id;
  const h=personalizzaDocumentoFv(esempio(),{[k]:{foto:['/nuova.png']}},ctx);expect(h).toContain('viewBox="0 0 20 20"');expect(h).toContain('<image href="/nuova.png" x="0" y="0" width="20" height="20"');
  expect(catalogoPersonalizzazioneFv(esempio(),{...ctx,immaginiDati:['/foto.png']})[0].immagini.some(m=>m.tipo==="foto")).toBe(false);
 });
 it("rende personalizzabile l’illustrazione della casa conservando frecce e valori energetici",()=>{
  const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata),p=catalogoPersonalizzazioneFv(doc.html,doc.contesto).find(p=>p.sezione==="flussi")!,m=p.immagini.find(m=>m.descrizione.includes("casa giorno"))!;
  expect(m).toBeDefined();const h=personalizzaDocumentoFv(doc.html,{[PREFISSO_MEDIA_FV+m.id]:{foto:['/casa-personalizzata.png']}},doc.contesto);
  expect(h).toContain('href="/casa-personalizzata.png"');for(const n of ['1.315','723','592','2.777'])expect(h).toContain(n);expect(h).toContain('fe-arrow-out');
 });
 it("raccoglie anche le immagini personalizzate nei percorsi privati già firmati per azienda",()=>{
  const t=datiCasaTettoReale(posaCasaTracciata).template!,k=PREFISSO_MEDIA_FV+'garanzie:foto_test_1',path='fv-progetti/azienda-a/template-blocchi/foto.png';t.pdf_blocchi={[k]:{foto:[path]}};
  expect(immaginiDelModello(t,CAMPI_IMMAGINE_FOTOVOLTAICO)).toContain(path);expect(fotoDeiBlocchiFv(t)[k]).toEqual([path]);
  const firmato=sostituisciImmagini(t,CAMPI_IMMAGINE_FOTOVOLTAICO,v=>v===path?'https://signed.example/foto.png':v);expect(fotoDeiBlocchiFv(firmato)[k]).toEqual(['https://signed.example/foto.png']);
  expect(senzaPersonalizzazioniFv({...t.pdf_blocchi,monitoraggio:{attivo:true},[BLOCCO_TESTI_FV]:{testi:{x:"a"}}})).toEqual({monitoraggio:{attivo:true}});
 });
 it("il documento completo della casa usa le stesse personalizzazioni in tutte le pagine",()=>{
  const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata),p=catalogoPersonalizzazioneFv(doc.html,doc.contesto).find(p=>p.sezione==="fornitura_casa")!,campo=p.testi.find(t=>t.originale.includes("Fornitura, voce per voce"))!;
  const custom=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,{modello:{pdf_blocchi:{[BLOCCO_TESTI_FV]:{testi:{[campo.id]:"La fornitura concordata."}}}}});
  expect(custom.html).toContain("La fornitura concordata.");expect(custom.pagine).toBe(doc.pagine);expect(custom.html).toContain("4.282");
 });
});
