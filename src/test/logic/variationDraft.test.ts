/// <reference types="node" />
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {emptyVariationDraft,prepareVariation,variationDecimal,variationImpact,variationDatePreview} from "@/lib/orders/variationDraft";
import {pendingVariation,escapeVariationHtml,variationEmailAmount} from "../../../supabase/functions/invia-odv/guards";
const draft = () => ({...emptyVariationDraft(),title:"Pavimenti",description:"Sostituzione concordata",amount:"120,50"});
describe("Varianti: contenuto e importi",()=>{
  it.each(["","1.000,20","1,2,3","12abc","NaN","Infinity","1e3","0x10","1.234","100000000"])("non tronca né interpreta %s",raw=>expect(variationDecimal(raw)).toBeNull());
  it.each([["12,50",12.5],["-10.25",-10.25],["0",0]])("legge %s",(raw,value)=>expect(variationDecimal(String(raw))).toBe(value));
  it("sottrae una riduzione, non duplica il valore sostituito",()=>{
    expect(prepareVariation({...draft(),kind:"riduzione"}).impatto_economico).toBe(-120.5);
    expect(prepareVariation({...draft(),kind:"modifica",amount:"-40"}).impatto_economico).toBe(-40);
  });
  it("voci sommate per riga con due decimali e contenute nel testo firmabile",()=>{
    const result=prepareVariation({...draft(),pricing:"voci",phase:"Opere murarie",internalNotes:"SEGRETO",days:"3",dayUnit:"lavorativi",lines:[{id:"a",description:"Materiale",quantity:"2,5",price:"12,25"},{id:"b",description:"Posa",quantity:"1",price:"100"}]});
    expect(result.impatto_economico).toBe(130.63);expect(result.descrizione).toContain("Opere murarie");expect(result.descrizione).toContain("3 giorni lavorativi");expect(result.descrizione).toContain("Materiale");expect(result.descrizione).not.toContain("SEGRETO");expect(result.note_interne).toBeNull();
  });
  it.each([{amount:"-1"},{days:"-1"},{days:"1.5"},{days:""},{days:"3651"},{description:""},{title:""},{pricing:"voci" as const,lines:[]},{pricing:"voci" as const,lines:[{id:"a",description:"x",quantity:"0",price:"5"}]}])("blocca bozza incompleta %j",override=>expect(()=>prepareVariation({...draft(),...override})).toThrow());
  it("stima IVA e nuovo netto senza alterare alcuna riga del contratto",()=>{
    expect(variationImpact(1000,-120.5,10)).toEqual({delta:-120.5,vat:-12.05,grossDelta:-132.55,revisedNet:879.5,rate:10});
    expect(variationImpact(undefined,10,undefined)).toMatchObject({vat:null,grossDelta:null,revisedNet:null});
  });
  it("costo previsto resta esclusivamente interno e non altera l'importo venduto",()=>{
    const result=prepareVariation({...draft(),estimatedCost:"-50",internalNotes:"Nota"});expect(result.note_interne).toBeNull();expect(JSON.stringify(result)).not.toContain("Nota");expect(result.descrizione).not.toContain("-50,00");expect(result.impatto_economico).toBe(120.5);
  });
  it("proiezioni date non scrivono e distinguono calendario da settimana lavorativa",()=>{
    expect(variationDatePreview("2026-10-16","2","calendario")).toBe("2026-10-18");expect(variationDatePreview("2026-10-16","2","lavorativi")).toBe("2026-10-20");expect(variationDatePreview("2026-02-31","2","calendario")).toBeNull();
  });
});
describe("Invio variante: nessun falso successo o riapertura",()=>{
  it.each(["approvato","rifiutato","annullato",undefined])("non reinvia né riapre %s",status=>expect(pendingVariation({status,company_id:"c",order:{company_id:"c"}})).toBe(false));
  it("verifica corrispondenza azienda-commessa",()=>{
    expect(pendingVariation({status:"in_attesa",company_id:"c",order:{company_id:"c"}})).toBe(true);
    expect(pendingVariation({status:"in_attesa",company_id:"c",order:{company_id:"altro"}})).toBe(false);
  });
  it("rende innocuo HTML contenuto nei titoli e mantiene gli importi negativi e zero",()=>{
    expect(escapeVariationHtml('<img src="x">&')).toBe("&lt;img src=&quot;x&quot;&gt;&amp;");
    expect(variationEmailAmount(-100)).toContain("-100");expect(variationEmailAmount(0)).toContain("0,00");expect(()=>variationEmailAmount(null)).toThrow();
  });
  it("il server verifica permesso, CAS token e risposta del provider senza ripristinare stati",()=>{
    const code=readFileSync("supabase/functions/invia-odv/index.ts","utf8");
    expect(code).toContain('requireCompanyAccess(');expect(code).toContain('_permission:"can_edit_orders"');expect(code).toContain('if (!delivery.ok)');
    expect(code).not.toMatch(/update\([^)]*status/);expect(code).toContain('.eq("status","in_attesa").is("firma_token",null)');
  });
});
