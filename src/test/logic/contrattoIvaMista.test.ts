import {describe, expect, it} from "vitest";
import {calcolaIvaContratto, calcolaQuoteIva, cambiaModalitaQuote, leggiIvaMista, ripartisciLordoIva, serializzaIvaMista, type QuoteIvaMista} from "@/lib/orders/ivaMista";
import {orderSchema, orderDefaultValues} from "@/lib/orderSchema";
import {componiFattura} from "@/lib/fatturazione/clausoleFattura";
import type {RigaDocumento} from "@/types/fatturazione";
const net:QuoteIvaMista={mode:"net", amount10:"7.000", amount22:"3.000"};
const gross:QuoteIvaMista={mode:"gross",amount10:"7.700,00",amount22:"3.660,00"};
describe("contratto IVA mista",()=>{
  it.each([net,gross])("le quote nelle due modalità producono lo stesso contratto: %j", draft=>{
    const result=calcolaIvaContratto("10.000", "mixed", draft);
    expect(result).toMatchObject({net:10000,vat:1360,gross:11360,rounding:0,error:null});
    expect(result.split.rows.map(r=>r.rate)).toEqual([10,22]);
  });
  it("converte le modalità senza applicare un’aliquota media ai campi",()=>{
    expect(cambiaModalitaQuote(net,"gross")).toEqual(gross);
    expect(cambiaModalitaQuote(gross,"net")).toEqual({...net,amount10:"7.000,00",amount22:"3.000,00"});
  });
  it("mantiene esattamente un lordo non raggiungibile e lo porta nell’arrotondamento documento",()=>{
    const draft:QuoteIvaMista={mode:"gross",amount10:"0,05",amount22:"0,03"};
    const calc=calcolaQuoteIva(draft);
    expect(calc.gross).toBe(0.08);expect(calc.net+calc.vat+calc.rounding).toBeCloseTo(0.08,6);
    const lines=calc.rows.map((r,index)=>({id:String(index),numero_linea:index+1,descrizione:"Quota",quantita:1,prezzo_unitario:r.net,aliquota_iva:String(r.rate),imponibile:0,imposta:0,totale_riga:0}) as RigaDocumento);
    expect(componiFattura(lines,[],{arrotondamento:calc.rounding}).totali.totale_documento).toBe(0.08);
  });
  it.each(["", "-1", "abc", "1,2,3", "10.12.30", "0,001", "100000000", "Infinity"])("rifiuta importi assenti o malformati: %s",amount=>{
    expect(calcolaQuoteIva({...net,amount10:amount}).error).toBeTruthy();
  });
  it("accetta una quota a zero ma non entrambe",()=>{
    expect(calcolaQuoteIva({...net,amount10:"0"}).error).toBeNull();
    expect(calcolaQuoteIva({...net,amount10:"0",amount22:"0"}).error).toBeTruthy();
  });
  it("blocca la somma fuori limite e quote diverse dall’imponibile",()=>{
    expect(calcolaQuoteIva({...net,amount10:"90000000",amount22:"90000000"}).error).toBeTruthy();
    expect(calcolaIvaContratto(10001,"mixed",net).error).toContain("restano da assegnare");
    expect(calcolaIvaContratto(9999,"mixed",net).error).toContain("in più");
  });
  it.each([net,gross])("salva e recupera quote e modalità senza perderle",draft=>{
    const saved=serializzaIvaMista(draft);const restored=leggiIvaMista(saved);
    expect(restored.mode).toBe(draft.mode);expect(calcolaQuoteIva(restored)).toEqual(calcolaQuoteIva(draft));
  });
  it.each([{version:1,input_mode:"gross",quota_10:0.001,quota_22:3},{version:1,input_mode:null,quota_10:1,quota_22:2},{version:2,input_mode:"net",quota_10:1,quota_22:2}])("non ripristina dati invalidi arrotondandoli in silenzio",data=>{
    expect(leggiIvaMista(data)).toBeNull();
  });
  it("per una rata propone due quote reali e conserva il totale richiesto",()=>{
    const split=ripartisciLordoIva(net,5680);
    expect(split.rows.map(r=>r.gross)).toEqual([3850,1830]);expect(split.net).toBe(5000);
    expect(ripartisciLordoIva(net,11360)).toEqual(calcolaQuoteIva(net));
  });
  it("il modulo rifiuta una ripartizione non completa",()=>{
    const base={...orderDefaultValues,customer_id:"cliente",description:"Contratto",total_amount:"10000",vat_rate:"mixed"};
    expect(orderSchema.safeParse({...base,vat_split:net}).success).toBe(true);
    expect(orderSchema.safeParse({...base,vat_split:{...net,amount22:"2000"}}).success).toBe(false);
    expect(orderSchema.safeParse(base).success).toBe(false);
  });
  it("mantiene le aliquote singole e lo zero",()=>{
    expect(calcolaIvaContratto(1000,22)).toMatchObject({vat:220,gross:1220,error:null});
    expect(calcolaIvaContratto(1000,0)).toMatchObject({vat:0,gross:1000,error:null});
  });
});
