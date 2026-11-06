import { describe, expect, it, vi } from "vitest";
import { salvaPrezzoRdo } from "@/lib/orders/salvaPrezzoRdo";
describe("Salvataggio del prezzo prima della risposta RDO",()=>{
 it.each(["-1","Infinity","abc"])("rifiuta il valore %s senza registrare una risposta",async raw=>{
  const salva=vi.fn(),registraRisposta=vi.fn();
  await expect(salvaPrezzoRdo({raw,precedente:null,salva,registraRisposta})).rejects.toThrow();
  expect(salva).not.toHaveBeenCalled();expect(registraRisposta).not.toHaveBeenCalled();
 });
 it("un errore di salvataggio non marca l'offerta come ricevuta",async()=>{
  const registraRisposta=vi.fn();
  await expect(salvaPrezzoRdo({raw:"12",precedente:null,salva:vi.fn().mockRejectedValue(new Error("Rete assente")),registraRisposta})).rejects.toThrow("Rete assente");
  expect(registraRisposta).not.toHaveBeenCalled();
 });
 it("aspetta la persistenza prima di registrare la risposta, anche per prezzo zero",async()=>{
  const eventi:string[]=[];let completa!:()=>void;
  const job=salvaPrezzoRdo({raw:"0",precedente:null,salva:()=>new Promise<void>(r=>{completa=r;eventi.push("salva");}),registraRisposta:async()=>{eventi.push("risposta");}});
  expect(eventi).toEqual(["salva"]);completa();await job;expect(eventi).toEqual(["salva","risposta"]);
 });
 it("svuotare un prezzo non crea una nuova risposta e valori invariati non riscrivono",async()=>{
  const salva=vi.fn().mockResolvedValue(undefined),registraRisposta=vi.fn();
  await salvaPrezzoRdo({raw:"",precedente:12,salva,registraRisposta});expect(salva).toHaveBeenCalledWith(null);expect(registraRisposta).not.toHaveBeenCalled();
  salva.mockClear();await salvaPrezzoRdo({raw:"",precedente:null,salva,registraRisposta});expect(salva).not.toHaveBeenCalled();
 });
});
