import { expect, it } from "vitest";
import { nuovaRigaPreparazione, calcolaPreparazione, cambiaBaseIva, articoloDaPreparazione, ripartisciPreparazione, errorePrecisioneOda, numeroCampo, fontePrezzoArticolo, type RigaPreparazione } from "@/lib/orders/preparazioneForniture";
const riga = (q=3, rate=22): RigaPreparazione => nuovaRigaPreparazione({name:"Prodotto",quantity:q,status:"da_ordinare",position:0,vat_rate:rate,purchase_price:0},"riga");
const prezzo = (r: RigaPreparazione, valore:string, modo:"unitario"|"totale"="unitario",ivato=false):RigaPreparazione => ({...r,prezzo:{versione:1,modo,ivato,valore}});
it("mostra la fonte DDT o fattura anche per gli articoli preparati prima della consegna",()=>{
 expect(fontePrezzoArticolo({prezzo_fonte:'fattura'})).toBe('Fattura ricevuta');
 expect(fontePrezzoArticolo({prezzo_fonte:'ddt',stock_item_id:'origine-magazzino'})).toBe('DDT confermato');
});
it("unitario e totale riga hanno comportamenti distinti al cambio quantità",()=>{
 const u=prezzo(riga(),"10"), t=prezzo(riga(),"30","totale");
 expect(calcolaPreparazione({...u,quantita:"5"}).netto).toBe(50);
 expect(calcolaPreparazione({...t,quantita:"5"}).netto).toBe(30);
});
it("prezzo ivato convertito in netto, IVA zero preservata",()=>{
 expect(calcolaPreparazione(prezzo(riga(2),"122","unitario",true))).toMatchObject({prezzoNetto:100,netto:200,iva:44,lordo:244});
 expect(calcolaPreparazione(prezzo(riga(2,0),"122","unitario",true))).toMatchObject({prezzoNetto:122,netto:244,iva:0,lordo:244});
});
it("500 euro su tre pezzi restano 500, con unitario derivato preciso",()=>{
 const r=prezzo(riga(),"500","totale");
 expect(calcolaPreparazione(r)).toMatchObject({netto:500,lordo:610,errore:null});
 expect(articoloDaPreparazione(r).purchase_price).toBeCloseTo(166.666666666667,10);
 expect(errorePrecisioneOda(articoloDaPreparazione(r).purchase_price!,3,22)).toBeNull();
});
it("un totale ivato resta identico dopo scorporo e cambio base",()=>{
 const r=prezzo(riga(),"500","totale",true), c=calcolaPreparazione(r);
 expect(c.lordo).toBe(500); expect(c.errore).toBeNull();
 const converted=cambiaBaseIva(r,false);
 expect(calcolaPreparazione(converted).netto).toBe(c.netto);
});
it("valore vuoto, zero esplicito e testo invalido sono tre casi diversi",()=>{
 expect(calcolaPreparazione(riga()).daDefinire).toBe(true);
 expect(calcolaPreparazione(prezzo(riga(),"0")).daDefinire).toBe(false);
 expect(calcolaPreparazione(prezzo(riga(),"100abc")).errore).toBeTruthy();
 expect(calcolaPreparazione(prezzo(riga(),"1.500,50","totale")).netto).toBe(1500.5);
});
it.each(["-2","0","1,12345","abc"])("rifiuta quantità %s",q=>expect(calcolaPreparazione({...riga(),quantita:q}).errore).toBeTruthy());
it("la ripartizione assegna i centesimi senza alterare quantità e misure",()=>{
 const rows=[prezzo(riga(2),"20"),prezzo({...riga(7,10),chiave:"due"},"60")];
 const dopo=ripartisciPreparazione(rows,"500",false,"valore","gruppo");
 expect(dopo.map(r=>r.quantita)).toEqual(["2","7"]);
 expect(dopo.reduce((n,r)=>n+calcolaPreparazione(r).netto,0)).toBe(500);
 expect(dopo.every(r=>r.prezzo.ripartizione?.id==="gruppo")).toBe(true);
});
it("totale ivato ripartito con aliquote diverse",()=>{
 const rows=[prezzo(riga(2,22),"100"),prezzo({...riga(1,10),chiave:"b"},"50")];
 const dopo=ripartisciPreparazione(rows,"1000",true,"valore","ivato");
 expect(dopo.reduce((n,r)=>n+Math.round(calcolaPreparazione(r).lordo*100),0)).toBe(100000);
});
it("quote uguali esplicite quando i prezzi sono sconosciuti",()=>{
 const rows=[riga(),{...riga(),chiave:"b"},{...riga(),chiave:"c"}];
 expect(()=>ripartisciPreparazione(rows,"100",false,"valore","x")).toThrow(/prezzi conosciuti/);
 const esito=ripartisciPreparazione(rows,"100",false,"uguale","x");
 expect(esito.map(r=>calcolaPreparazione(r).netto)).toEqual([33.34,33.33,33.33]);
});
it("riconversioni di valuta non modificano i valori nei casi ordinari",()=>{
 for(const rate of [0,4,10,22]) for(const q of [1,3,12.5,250]) {
   const r=prezzo(riga(q,rate),"80,25");
   const prima=calcolaPreparazione(r), dopo=calcolaPreparazione(cambiaBaseIva(r,true));
   expect(dopo.netto).toBe(prima.netto); expect(dopo.lordo).toBe(prima.lordo);
 }
});
it("mantiene precisione minima e avverte se l'ODA a quattro decimali perderebbe centesimi",()=>{
 expect(numeroCampo(0.000000000001)).toBe("0,000000000001");
 expect(errorePrecisioneOda(0.10001,1000,22)).toMatch(/quattro decimali/);
 expect(errorePrecisioneOda(2,1.1234,22)).toMatch(/tre decimali/);
});
it("la base di calcolo si conserva come metadato, il prezzo canonico è netto",()=>{
 const r=prezzo(riga(2,22),"244","totale",true), a=articoloDaPreparazione(r);
 expect(a).toMatchObject({purchase_price:100,costo_stimato_iniziale:100,origine_materiale:"manuale",preparazione_prezzo:{modo:"totale",ivato:true,valore:"244"}});
});
