import {expect,it} from 'vitest';
import {avvisiLettura,condizioniDocumento,righeDellaBase,validaLetturaConferma,type BaseConferma} from '../../../supabase/functions/_shared/revisioniConferma';
import {confrontaDocumento,confrontaRiga,type RigaChiesta,type RigaLetta} from '../../../supabase/functions/_shared/confrontoDocumentoFornitore';
const richiesta:RigaChiesta={chiave:'P3',riferimento:'P3',descrizione:'Finestra PVC',quantita:2,unita:'pz',misure:{larghezza:1200,altezza:1400},apertura:'destra',dettagli:'Vetro: 4/16/4; profilo: Serie 70'};
const letta:RigaLetta={riferimento:'P3',descrizione:'Finestra PVC',quantita:2,unita:'pz',larghezza_mm:1200,altezza_mm:1400,apertura:'destra',confidenza:99,specifiche:{vetro:'4/16/4',profilo:'Serie 70'},pagina:3,testo_originale:'P3 finestra PVC 1200x1400'};
const base:BaseConferma={impronta:'rev',fonte:'invio',evento_id:'e1',testata:{numero:'ODA1'},righe:[],documento:{righe:[{origineId:'P3',descrizione:'VERSIONE SPEDITA',quantita:2,unita:'pz',prezzo:null,specifiche:{riferimento:'P3',misure:{larghezza:1200,altezza:1400}}}]}};
it('la base inviata mantiene le misure originali anche se i dati correnti cambiano',()=>{
 const r=righeDellaBase({...base,righe:[{id:'P3',quantity:8,misure:{altezza:1500}}]})[0];
 expect(r.quantita).toBe(2);expect(r.misure?.altezza).toBe(1400);expect(r.descrizione).toBe('VERSIONE SPEDITA');
});
it('dimensioni, apertura, vetro e profilo sono confrontati separatamente',()=>{
 const r=confrontaRiga(richiesta,{...letta,altezza_mm:1450,apertura:'sinistra',specifiche:{vetro:'3/12/3',profilo:'Serie 60'}});
 expect(r.esito).toBe('rosso');expect(r.campi.filter(c=>c.esito==='rosso').map(c=>c.campo)).toEqual(expect.arrayContaining(['Altezza','Apertura','vetro','profilo']));expect(r.pagina_fornitore).toBe(3);
});
it('due posizioni compatibili non vengono confermate automaticamente per ordine di apparizione',()=>{
 const r=confrontaDocumento([{...richiesta,riferimento:null,dettagli:null},{...richiesta,chiave:'P4',riferimento:null,dettagli:null}],[{...letta,riferimento:null},{...letta,riferimento:null}]);
 expect(r.righe.every(x=>x.esito!=='verde')).toBe(true);
});
it('scatole e pezzi richiedono una conversione documentata',()=>{
 const r=confrontaRiga(richiesta,{...letta,unita:'scatole'});expect(r.campi.find(c=>c.campo==='Unità di misura')?.esito).toBe('da_controllare');
});
it('le conversioni metriche note non alterano la quantità',()=>{
 const r=confrontaRiga({chiave:'s',descrizione:'Sabbia',quantita:2,unita:'kg'},{descrizione:'Sabbia',quantita:2000,unita:'g',confidenza:99});expect(r.campi.find(c=>c.campo==='Quantità')?.esito).toBe('verde');
});
it('pagina non letta e documento di un altro ordine restano da verificare',()=>{
 expect(avvisiLettura({pagine_totali:10,pagine_lette:9,riferimenti_ordini:['ALTRO']},'ODA1')).toHaveLength(2);
});
it('pagamento assente o diverso e costi aggiuntivi emergono nel confronto',()=>{
 expect(condizioniDocumento({...base,documento:{pagamento:'Bonifico a 30 giorni'}},{righe:[],altri_costi:[{descrizione:'Trasporto',importo:80}]}).map(r=>r.chiave)).toEqual(['condizioni:pagamento','costo:0']);
});
it('rifiuta letture troncate o quantità non valide',()=>{
 expect(()=>validaLetturaConferma({})).toThrow();expect(()=>validaLetturaConferma({righe:[{quantita:'1,5'}]})).toThrow();
});
