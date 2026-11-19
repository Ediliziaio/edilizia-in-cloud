import { describe, expect, it } from "vitest";
import { costruisciCatena, type FatturaPerCatena } from "../../../shared/acquisti/catena.ts";
import { corpoXmlFattura, leggiRiferimentiFattura, ordiniNeiTesti } from "../../../shared/acquisti/riferimentiFattura.ts";
import { decidiRiferimentiCommessa, commessaFinale } from "../../../supabase/functions/_shared/regolePrimaDellAi.ts";

const noti: Parameters<typeof costruisciCatena>[1] = {
  commesse: [
    { id: "a", companyId: "co", codice: "CANT-2026-001", indirizzoCantiere: "Via Roma 12 Milano", clienteNome: "Mario Rossi", clienteRagioneSociale: "Edil Alfa S.r.l." },
    { id: "b", companyId: "co", codice: "CANT-2026-002", indirizzoCantiere: "Via Verdi 8 Monza", clienteNome: "Lucia Bianchi", clienteRagioneSociale: "Beton Beta SPA" },
    { id: "x", companyId: "altra", codice: "CANT-2026-999", clienteNome: "Mario Rossi", clienteRagioneSociale: "Impresa esterna SRL" },
  ],
  ordini: [
    { id: "oda-a", companyId: "co", fornitoreId: "s", numero: "ODA-2026-0039", data: "2026-10-01", commessaId: "a", magazzinoId: null },
    { id: "oda-b", companyId: "co", fornitoreId: "s", numero: "ODA-2026-0040", data: "2026-10-01", commessaId: "b", magazzinoId: null },
  ],
  ddt: [{ id: "d-a", companyId: "co", fornitoreId: "s", numero: "1068", data: "2026-10-10", commessaId: "a", magazzinoId: null, ordiniIds: ["oda-a"] }],
  contratti: [],
};
const xml = (causale = "", righe = ["Materiali"], altri = "", riferimenti = "") => `<FatturaElettronica><FatturaElettronicaHeader><CedentePrestatore><Denominazione>Mario Rossi</Denominazione></CedentePrestatore></FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><Causale>${causale}</Causale></DatiGeneraliDocumento>${riferimenti}</DatiGenerali><DatiBeniServizi>${righe.map((descrizione,i)=>`<DettaglioLinee><NumeroLinea>${i+1}</NumeroLinea><Descrizione>${descrizione}</Descrizione><PrezzoTotale>100.00</PrezzoTotale>${i===righe.length-1?altri:""}</DettaglioLinee>`).join("")}</DatiBeniServizi></FatturaElettronicaBody></FatturaElettronica>`;
const fattura = (x:string): FatturaPerCatena => ({ id: "f", companyId: "co", fornitoreId: "s", data: "2026-10-31", riferimenti: leggiRiferimentiFattura(x) });
const catena = (x:string) => costruisciCatena(fattura(x), noti);

describe("riferimenti testuali di fatture ricevute",()=>{
  it.each(["Rif. ordine d'acquisto ODA-2026-0039", "Come da Vs ordine n. 39/2026", "Ordine di acquisto: ODA-2026-0039", "Fornitura ODA-2026-0039"])("riconosce l’ordine nella causale: %s", testo=>{
    const c=catena(xml(testo));expect(c.esito).toBe("automatico");expect(c.allocazioni[0].destinazione).toEqual({tipo:"commessa",id:"a"});
    expect(c.ordini.some(o=>o.decisione.sceltoId==="oda-a")).toBe(true);
  });
  it("un numero nudo, un importo o la parola acquisto non identificano un ordine",()=>{
    const r=leggiRiferimentiFattura(xml("Fornitura 39/2026, importo 100, acquisto materiali"));expect(ordiniNeiTesti(r)).toEqual([]);expect(catena(xml("39/2026")).esito).toBe("nessuno");
  });
  it("il DDT nella causale risale all’ordine e alla commessa",()=>{
    const c=catena(xml("Rif. DDT n. 1068 del 10/10/2026"));expect(c.esito).toBe("automatico");expect(c.allocazioni[0].destinazione.id).toBe("a");
  });
  it("due ordini nelle rispettive righe ripartiscono la fattura senza applicarli alla testata",()=>{
    const c=catena(xml("",["Materiali ordine ODA-2026-0039", "Materiali ordine ODA-2026-0040"]));
    expect(c.esito).toBe("automatico");expect(c.allocazioni.map(a=>[a.destinazione.id,a.importo,a.righe])).toEqual([["a",100,[1]],["b",100,[2]]]);
    const scelta=decidiRiferimentiCommessa({order_id:"a",motivo:"codice"},{catena:c,commessa:null,conflitto:null,saltata:null});
    expect(scelta.regola).toBeNull();expect(scelta.conflitto?.richiedeScelta).toBe(true);
  });
  it("due codici commessa nelle rispettive descrizioni conservano la ripartizione",()=>{
    const c=catena(xml("",["Cantiere CANT-2026-001", "Cantiere CANT-2026-002"]));
    expect(c.esito).toBe("automatico");expect(c.allocazioni.map(a=>[a.destinazione.id,a.righe])).toEqual([["a",[1]],["b",[2]]]);
  });
  it.each(['Commessa ELISII-SCARFOGLIO','Rif. cantiere: ELISII-SCARFOGLIO'])("riconosce un codice composto solo da lettere quando è dichiarato: %s",testo=>{
    const c=costruisciCatena(fattura(xml(testo)),{...noti,commesse:[{...noti.commesse[0],codice:'ELISII-SCARFOGLIO'}]});
    expect(c.esito).toBe('automatico');expect(c.allocazioni[0].destinazione.id).toBe('a');
  });
  it("un codice alfabetico senza etichetta resta una proposta da confermare",()=>{
    const c=costruisciCatena(fattura(xml('Fornitura ELISII-SCARFOGLIO')),{...noti,commesse:[{...noti.commesse[0],codice:'ELISII-SCARFOGLIO'}]});
    expect(c.esito).toBe('proposta');expect(c.allocazioni[0].destinazione.id).toBe('a');
  });
  it("un codice negli altri dati gestionali si applica soltanto alla sua riga",()=>{
    const c=catena(xml("",["Materiali generici","Manutenzione"],"<AltriDatiGestionali><TipoDato>Commessa</TipoDato><RiferimentoTesto>CANT-2026-002</RiferimentoTesto></AltriDatiGestionali>"));
    expect(c.allocazioni.map(a=>[a.destinazione.tipo,a.destinazione.id,a.righe])).toEqual([["da_attribuire",null,[1]],["commessa","b",[2]]]);
    expect(decidiRiferimentiCommessa({order_id:"b",motivo:"codice"},{catena:c,commessa:null,conflitto:null,saltata:null}).conflitto?.richiedeScelta).toBe(true);
  });
  it.each(["Fornitura per Mario Rossi", "Cliente EDIL ALFA SRL"])("il nome del cliente propone senza collegare automaticamente: %s",testo=>{
    const c=catena(xml(testo));expect(c.esito).toBe("proposta");expect(c.allocazioni[0].destinazione.id).toBe("a");expect(c.allocazioni[0].percorsi[0].fonte).toBe("cliente");
  });
  it("stesso cliente con due cantieri: richiede la scelta",()=>{
    const c=costruisciCatena(fattura(xml("Cliente Mario Rossi")),{...noti,commesse:[...noti.commesse,{...noti.commesse[0],id:"a2",codice:"CANT-2026-003"}]});expect(c.esito).toBe("scelta");
  });
  it("solo il cognome non basta e il nome nell’intestazione del fornitore non è un riferimento di cantiere",()=>{
    expect(catena(xml("Per Rossi")).esito).toBe("nessuno");expect(catena(xml()).esito).toBe("nessuno");expect(catena(xml("Impresa esterna SRL")).esito).toBe("nessuno");
  });
  it("nome e indirizzo restano nella riga in cui sono scritti",()=>{
    const c=catena(xml("",["Cliente Mario Rossi","Consegna Via Verdi 8 Monza"]));expect(c.esito).toBe("proposta");expect(c.allocazioni.map(a=>[a.destinazione.id,a.righe])).toEqual([["a",[1]],["b",[2]]]);
  });
  it("ordine e cliente discordanti bloccano anche una proposta AI o un codice trovato separatamente",()=>{
    const c=catena(xml("Ordine ODA-2026-0039; cliente Lucia Bianchi"));expect(c.esito).toBe("conflitto");
    const scelta=decidiRiferimentiCommessa({order_id:"a",motivo:"codice commessa"},{catena:c,commessa:null,conflitto:c.motivo,saltata:null});
    expect(commessaFinale(scelta.regola,{orderId:"a",confidenza:1},scelta.conflitto,scelta.proposta).orderId).toBeNull();
  });
  it("una proposta testuale resta da confermare e non viene sostituita dall’AI",()=>{
    expect(commessaFinale(null,{orderId:"b",confidenza:1},null,{order_id:"a",motivo:"Da confermare: cliente Mario Rossi"})).toEqual({orderId:"a",confidenza:0.6,motivo:"Da confermare: cliente Mario Rossi"});
  });
  it("un codice trovato separatamente non supera una catena documentale discordante",()=>{
    const c=catena(xml("Ordine ODA-2026-0040"));
    const r=decidiRiferimentiCommessa({order_id:'a',motivo:'CUP del contratto'},{catena:c,commessa:{order_id:'b',motivo:'ordine ODA-2026-0040'},conflitto:null,saltata:null});
    expect(r.regola).toBeNull();expect(r.conflitto?.conflitto).toContain('commesse diverse');
  });
  it("l’ordine di un altro fornitore blocca il collegamento anche se un codice indica una commessa",()=>{
    const c=costruisciCatena(fattura(xml('Ordine ODA-2026-0039')),{...noti,ordini:noti.ordini.map(o=>({...o,fornitoreId:'altro-fornitore'}))});
    expect(c.ordini[0].decisione.esito).toBe('conflitto');
    const r=decidiRiferimentiCommessa({order_id:'a',motivo:'codice commessa'},{catena:c,commessa:null,conflitto:null,saltata:null});
    expect(r.regola).toBeNull();expect(r.conflitto?.conflitto).toContain('altro fornitore');
  });
  it("la sola proposta da nome o indirizzo non viene promossa a regola certa",()=>{
    const c=catena(xml('Cliente Mario Rossi'));
    const r=decidiRiferimentiCommessa(null,{catena:c,commessa:null,proposta:{order_id:'a',motivo:'Da confermare: cliente Mario Rossi'},conflitto:null,saltata:null});
    expect(r.regola).toBeNull();expect(r.proposta?.order_id).toBe('a');expect(r.conflitto).toBeNull();
  });
  it("una lettura al limite non viene aggirata con un codice o una scelta AI",()=>{
    const c=catena(xml('CANT-2026-001'));
    const r=decidiRiferimentiCommessa({order_id:'a',motivo:'codice commessa'},{catena:c,commessa:null,conflitto:null,saltata:'troppi documenti: conferma la commessa'});
    expect(r.regola).toBeNull();expect(commessaFinale(r.regola,{orderId:'a',confidenza:1},r.conflitto).orderId).toBeNull();
  });
  it("un riferimento nella ventesima riga non viene ignorato",()=>{
    const c=catena(xml("",[...Array.from({length:19},()=>"Materiali"),"Ordine ODA-2026-0040"]));
    expect(c.righe[19].decisione.sceltoId).toBe("commessa:b");expect(c.righe[0].decisione.sceltoId).toBeNull();
  });
  it("cerca anche l’ultima di 500 commesse e l’ultima di 500 righe",()=>{
    const commesse=Array.from({length:500},(_,i): (typeof noti.commesse)[number]=>({...noti.commesse[0],id:`commessa-${i}`,codice:`COMM-${String(i).padStart(4,'0')}`,clienteNome:`Cliente numero ${i}`,clienteRagioneSociale:null}));
    const f=fattura(xml('',[...Array.from({length:499},()=>"Materiali generici"),'Cantiere COMM-0499']));
    const inizio=performance.now();const c=costruisciCatena(f,{...noti,commesse});
    expect(c.righe[499].decisione.sceltoId).toBe('commessa:commessa-499');expect(c.righe[0].decisione.sceltoId).toBeNull();
    console.info(`Ricerca 500 commesse x 500 righe: ${Math.round(performance.now()-inizio)} ms`);
  });
  it("i corpi di un lotto non si mescolano, neppure nella richiesta alle regole SQL",()=>{
    const a=corpoXmlFattura(xml("Ordine ODA-2026-0039")),b=corpoXmlFattura(xml("Cliente Lucia Bianchi"));
    const lotto=`<FatturaElettronica><FatturaElettronicaBody>${a}</FatturaElettronicaBody><FatturaElettronicaBody>${b}</FatturaElettronicaBody></FatturaElettronica>`;
    const r=leggiRiferimentiFattura(lotto,1);expect(ordiniNeiTesti(r)).toEqual([]);expect(r.causale).toBe("Cliente Lucia Bianchi");expect(corpoXmlFattura(lotto,1)).not.toContain("0039");
  });
});
