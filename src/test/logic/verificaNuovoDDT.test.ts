import {describe,it,expect} from "vitest";
import {erroreVerificaDDT} from "@/lib/ddt/verificaNuovoDDT";
const base={data:"2026-11-05",stato:"ricevuto",quantita:"",righe:[],haDocumento:false};
describe("Riepilogo nuovo DDT",()=>{
 it("blocca una ricezione senza documento, righe o quantità",()=>expect(erroreVerificaDDT(base)).toMatch(/Aggiungi il documento/));
 it("ammette una bolla attesa e una foto/PDF da completare",()=>{expect(erroreVerificaDDT({...base,stato:"atteso"})).toBeNull();expect(erroreVerificaDDT({...base,haDocumento:true})).toBeNull();});
 it("mantiene l'inserimento aggregato senza obbligare un file",()=>expect(erroreVerificaDDT({...base,quantita:"5"})).toBeNull());
 it.each(["-1","NaN","Infinity"])("blocca la quantità %s prima di creare dati",quantita=>expect(erroreVerificaDDT({...base,quantita})).toMatch(/quantità ricevuta/));
 it("controlla descrizione e quantità delle righe",()=>{expect(erroreVerificaDDT({...base,righe:[{descrizione:"",quantita:1}]})).toMatch(/descrizione/);expect(erroreVerificaDDT({...base,righe:[{descrizione:"Mattoni",quantita:null}]})).toMatch(/maggiore di zero/);expect(erroreVerificaDDT({...base,righe:[{descrizione:"Mattoni",quantita:10}]})).toBeNull();});
 it.each(["","2026-02-30","2026-13-01"])("non registra con data non valida %s",data=>expect(erroreVerificaDDT({...base,data,haDocumento:true})).toMatch(/data/));
});
