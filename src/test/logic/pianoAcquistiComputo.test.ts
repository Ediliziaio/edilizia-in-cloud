import { describe, expect, it } from "vitest";
import { anticipoMateriale, pianoAcquisti, type ContestoAcquisti } from "@/lib/distinta/pianoAcquisti";
import { collegaMateriali, convertiInConfezioni, rigaDaSalvare, type MaterialeCollegato } from "@/lib/distinta/collegaArticoli";
import { generaDistinta } from "@/lib/distinta/generaDistinta";

const materiale = (key: string, quantita = 100, fase = "f1"): MaterialeCollegato => ({
  ...collegaMateriali(generaDistinta({ voci: [{ id: key, descrizione_breve: "Fornitura di cemento", unita_misura: "kg", quantita }], scomposizioni: [] }).righe,
    { articoli: [], listini: [], giaUsati: [] })[0], chiave: key, descrizione: "Cemento", specifiche: null, phase_id: fase,
});
const contesto = (extra: Partial<ContestoAcquisti> = {}): ContestoAcquisti => ({
  magazzino: [], esistenti: [], coperture: [], fasi: [{ id: "f1", start_date: "2027-03-01" }], fornitori: [], ...extra,
});
const stock = (extra = {}) => ({ id: "w1", name: "Cemento", unita_misura: "kg", quantity_available: 30, ...extra });
const ordine = (status = "confermato", quantity = 20) => ({ id: "po-riga", order_item_id: "oi1", quantity, quantity_received: 0, unit_of_measure: "kg",
  purchase_orders: { id: "po", oda_number: "ODA-1", status } });

describe("piano acquisti: residuo, giacenze e tempi", () => {
  it("100 kg necessari meno 20 ordinati e 30 disponibili = 50 kg, poi arrotonda a sacchi", () => {
    const m = materiale("m1");
    const [r] = pianoAcquisti([m], contesto({ magazzino: [stock()], esistenti: [{ id: "oi1", chiave_materiale: "m1", stock_item_id: null }], coperture: [ordine()] }));
    expect(r).toMatchObject({ necessario: 100, ordinato: 20, daMagazzino: 30, daComprare: 50, nuovoOrdine: 50, acquisto: { quantita: 2, unita: "sacco" } });
    expect(m.quantita_calcolata).toBe(100);
    expect(r.giacenze).toEqual([{ id: "w1", quantita: 30 }]);
  });
  it("la stessa scorta copre una sola volta due fasi e dà precedenza a quella più vicina", () => {
    const righe = pianoAcquisti([materiale("dopo", 50, "f2"), materiale("prima", 50)], contesto({ magazzino: [stock({ quantity_available: 60 })], fasi: [{ id: "f1", start_date: "2027-03-01" }, { id: "f2", start_date: "2027-04-01" }] }));
    expect(righe.map(r => [r.daMagazzino, r.daComprare])).toEqual([[10, 40], [50, 0]]);
  });
  it("ordini annullati non coprono; bozze restano da acquistare, ma non generano una seconda bozza", () => {
    const [r] = pianoAcquisti([materiale("m1")], contesto({ esistenti: [{ id: "oi1", chiave_materiale: "m1", stock_item_id: null }], coperture: [ordine("annullato", 80), { ...ordine("bozza", 30), id: "bozza" }] }));
    expect(r).toMatchObject({ ordinato: 0, inBozza: 30, daComprare: 100, nuovoOrdine: 70 });
  });
  it("unità diverse o magazzino non leggibile non diventano zero disponibilità", () => {
    expect(pianoAcquisti([materiale("m1")], contesto({ magazzino: null }))[0].daComprare).toBeNull();
    const [r] = pianoAcquisti([materiale("m1")], contesto({ magazzino: [stock({ unita_misura: "mq" })] }));
    expect(r.daComprare).toBeNull();
    expect(r.daMagazzino).toBe(0);
  });
  it("un articolo simile o con specifiche diverse non riduce il fabbisogno", () => {
    const [r] = pianoAcquisti([{ ...materiale("m1"), specifiche: "CEM II 32,5 R" }], contesto({ magazzino: [stock()] }));
    expect(r.daComprare).toBe(100);
  });
  it("il codice articolo esatto permette di usare più lotti e convertire sacchi da 25 kg", () => {
    const m = { ...materiale("m1"), collegamento: { tipo: "articolo" as const, id: "a1", nome: "Cemento sacco 25 kg", fonte: "scelto" as const, prezzo: 5, unita: "sacco", supplier_id: null } };
    const [r] = pianoAcquisti([m], contesto({ codiciArticoli: { a1: "CEM25" }, magazzino: [stock({ internal_code: "CEM25", name: "Cemento sacco 25 kg", unita_misura: "sacco", quantity_available: 2 }), stock({ id: "w2", internal_code: "CEM25", name: "Cemento sacco 25 kg", unita_misura: "sacco", quantity_available: 1 })] }));
    expect(r.daMagazzino).toBe(75); expect(r.daComprare).toBe(25); expect(r.acquisto?.quantita).toBe(1);
  });
  it("la data del materiale supera quella della fase; il fornitore supera l'anticipo stimato", () => {
    const m = { ...materiale("m1"), descrizione: "Serramento su misura", supplier_id: "s1" };
    const [r] = pianoAcquisti([m], contesto({ fornitori: [{ id: "s1", lead_time_days: 20 }], esistenti: [{ id: "oi1", chiave_materiale: "m1", stock_item_id: null, data_fabbisogno: "2027-04-01" }] }));
    expect(r).toMatchObject({ dataServe: "2027-04-01", ordinaEntro: "2027-03-12", anticipo: 20, fonteAnticipo: "fornitore" });
  });
  it("senza date non inventa scadenze e non usa la data del documento come avvio", () => {
    const [r] = pianoAcquisti([materiale("m1")], contesto({ fasi: [] }));
    expect(r.ordinaEntro).toBeNull(); expect(r.dataServe).toBeNull();
  });
  it("non scambia gli accessori per la macchina cui servono", () => {
    expect(anticipoMateriale("Serramento su misura")).toBe(70);
    expect(anticipoMateriale("Porta 002 · porta battente-ribalta con soglia")).toBe(70);
    expect(anticipoMateriale("Pompa di calore")).toBe(50);
    expect(anticipoMateriale("Modulo fotovoltaico monocristallino")).toBe(45);
    expect(anticipoMateriale("Cavo di collegamento fancoil")).toBe(7);
  });
});

describe('coperture già presenti nella commessa',()=>{
 it('una riserva nota riduce solo il nuovo acquisto e non viene conteggiata anche come giacenza libera',()=>{
  const [r]=pianoAcquisti([materiale('m1')],contesto({magazzino:[stock({quantity_available:0})],esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:'w1',quantity:100,quantity_reserved:30}],coperture:[ordine('confermato',20)]}));
  expect(r).toMatchObject({necessario:100,ordinato:20,daMagazzino:30,daComprare:50});expect(r.giacenze).toEqual([]);
 });
 it('usa anche il residuo libero del lotto: la disponibilità letta è già al netto delle riserve',()=>{
  const [r]=pianoAcquisti([materiale('m1')],contesto({magazzino:[stock({quantity_available:10})],esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:'w1',quantity:100,quantity_reserved:30}],coperture:[ordine('confermato',20)]}));expect(r).toMatchObject({daMagazzino:40,daComprare:40});expect(r.giacenze).toEqual([{id:'w1',quantita:10}]);
 });
 it('il prelievo automatico già fatto copre la quantità assegnata senza ricomprare la merce',()=>{
  const [r]=pianoAcquisti([materiale('m1')],contesto({esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:'w1',auto_deducted:true,quantity:100,quantity_reserved:0}]}));
  expect(r).toMatchObject({necessario:100,daMagazzino:100,daComprare:0});
 });
 it('una riserva sconosciuta, un ordine non collegato o una quantità modificata richiedono riconciliazione',()=>{
  for(const extra of [{esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:'w1'}]},{coperturaIncompleta:true},{esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:null,quantity:80}]},{esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:null,quantity:100,unita_misura:'mq'}]}])expect(pianoAcquisti([materiale('m1')],contesto(extra))[0].daComprare).toBeNull();
 });
 it('consegna dopo l’avvio è un avviso anche quando l’ordine copre il fabbisogno',()=>{
  const riga={...ordine('confermato',100),purchase_orders:{...ordine().purchase_orders,expected_delivery_date:'2027-03-12'}};
  const [r]=pianoAcquisti([materiale('m1')],contesto({esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:null}],coperture:[riga]}));expect(r.daComprare).toBe(0);expect(r.avvisi.join(' ')).toMatch(/dopo l'inizio/);
 });
});

it('riconosce le confezioni salvate e converte riserve e ordini nella stessa unità del fabbisogno',()=>{
 const m={...materiale('m1',61),collegamento:{tipo:'articolo' as const,id:'a1',nome:'Cemento sacco 25 kg',fonte:'scelto' as const,prezzo:5,unita:'sacco',supplier_id:null},conversione:{quantita:3,unita:'sacco',contenuto:25,testo:'61 kg = 3 sacchi'}};
 const [r]=pianoAcquisti([m],contesto({esistenti:[{id:'oi1',chiave_materiale:'m1',stock_item_id:'w1',quantity:3,unita_misura:'sacco',quantity_reserved:1}],coperture:[{...ordine('confermato',1),unit_of_measure:'sacco'}]}));
 expect(r).toMatchObject({necessario:61,ordinato:25,daMagazzino:25,daComprare:11,acquisto:{quantita:1,unita:'sacco'}});expect(r.avvisi).toEqual([]);
});

it('una resa proposta dall’AI non diventa un nuovo acquisto prima della validazione',()=>{
 const [r]=pianoAcquisti([{...materiale('coppi',4532),proposta_ai:true,fonte:'proposta_ai'}],contesto());
 expect(r.daComprare).toBeNull();expect(r.nuovoOrdine).toBeNull();expect(r.acquisto).toBeNull();expect(r.ordinaEntro).toBeNull();expect(r.avvisi.join(' ')).toMatch(/Proposta AI non validata/);
});

it('la verifica tecnica persistita blocca il netto e non consuma la scorta di un’altra fase',()=>{
 const daVerificare={...materiale('prima'),verifica_acquisto:{stato:'da_verificare' as const,motivi:['Resa e prodotto mancanti'],campi_mancanti:['resa','specifiche']}};
 const righe=pianoAcquisti([daVerificare,materiale('seconda')],contesto({magazzino:[stock()]}));
 expect(righe[0]).toMatchObject({daComprare:null,nuovoOrdine:null,acquisto:null,ordinaEntro:null,daMagazzino:0});
 expect(righe[1]).toMatchObject({daMagazzino:30,daComprare:70});
});

it('trenta metri di tubo in barre da quattro richiedono otto barre, anche dopo la copertura delle scorte',()=>{
 const descrizione='Tubo PP-R Ø50 x 5,6 mm in barre da 4,00 m';
 expect(convertiInConfezioni(30,'m',null,descrizione)).toMatchObject({quantita:8,unita:'barra',contenuto:4});
 const m={...materiale('tubo',30),descrizione,unita_misura:'m'};
 const [p]=pianoAcquisti([m],contesto({magazzino:[{id:'barre',name:descrizione,unita_misura:'m',quantity_available:4}]}));
 expect(p).toMatchObject({daComprare:26,acquisto:{quantita:7,unita:'barra'}});
 expect(convertiInConfezioni(30,'m',{tipo:'articolo',id:'tubo-a-metro',nome:descrizione,fonte:'scelto',unita:'m',prezzo:4,supplier_id:null},descrizione)).toBeNull();
});

it('il salvataggio trasferisce motivi e stato tecnico alle origini lette alla riapertura',()=>{
 const m={...materiale('m1'),verifica_acquisto:{stato:'da_verificare' as const,motivi:['Resa da confermare'],campi_mancanti:['resa']}};
 const salvata=rigaDaSalvare(m);
 expect(salvata.origini.every(o=>o.tipo==='computo'&&o.verifica_acquisto?.stato==='da_verificare')).toBe(true);
});
