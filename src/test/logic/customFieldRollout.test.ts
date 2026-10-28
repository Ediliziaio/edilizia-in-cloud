import { describe, expect, it } from "vitest";
import { customDestinationId, mappedCustomRows, normalizeMappedCustomValue, type CustomContactDefinition } from "../../../supabase/functions/_shared/formCustomFields";
import { quoteFieldContext, QUOTE_FIELD_MODULES } from "@/lib/custom-fields/quoteContext";
import { validateLeadFormDraft, ensureFormCustomFieldSupport } from "@/lib/formBuilder";
import { applyContactCustomFields, loadContactCustomFieldResolver } from "../../../supabase/functions/_shared/contactCustomFields";
import { loadAutomationCustomFields } from "../../../supabase/functions/_shared/automationContext";
import { filterValue } from "../../../supabase/functions/_shared/automationFilters";
const company = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const def = (patch: Partial<CustomContactDefinition> = {}): CustomContactDefinition => ({ id, company_id: company, object_type: "contact", name: "Campo", field_type: "number", ...patch });
const fields = [{ id: "q", type: "number", mapping: `cf:${id}` }];
describe("mapping form verso campo stabile", () => {
  it("blocca il rilascio finché l'endpoint remoto non dichiara la nuova capacità", async () => {
    await expect(ensureFormCustomFieldSupport({is_published:true,fields},async()=>false)).rejects.toThrow(/bozza/);
    await expect(ensureFormCustomFieldSupport({is_published:true,fields},async()=>true)).resolves.toBeUndefined();
    await expect(ensureFormCustomFieldSupport({is_published:false,fields},async()=>{throw new Error("non deve chiamare");})).resolves.toBeUndefined();
  });
  it.each([[0,"0"],["12,50","12.5"],[false,"false"]])("preserva %s", (v,expected) => {
    expect(normalizeMappedCustomValue(def({field_type: typeof v === "boolean" ? "checkbox" : "number"}),v)).toBe(expected);
  });
  it.each(["NaN", "1e20000", {}, [], "12 kg"])("rifiuta formato numerico non valido %j", v => expect(() => normalizeMappedCustomValue(def(),v)).toThrow());
  it("mappatura corretta, senza scrivere omissioni o chiavi sconosciute", () => {
    expect(mappedCustomRows(company,fields,{ q:0, mapping:"other" },[def()])).toEqual([{field_id:id,value:"0"}]);
    expect(mappedCustomRows(company,fields,{},[def()])).toEqual([]);
    expect(mappedCustomRows(company,fields,{q:""},[def()])).toEqual([]);
  });
  it.each([{company_id:"other"},{object_type:"quote"},{deleted_at:"2026-10-26"},{field_type:"file"}])("rifiuta definizione non compatibile %j", patch => expect(() => mappedCustomRows(company,fields,{q:2},[def(patch)])).toThrow());
  it("rifiuta destinazioni duplicate o sconosciute prima di scrivere", () => {
    expect(() => mappedCustomRows(company,[...fields,...fields],{q:2},[def()])).toThrow(/Due domande/);
    expect(() => mappedCustomRows(company,fields,{q:2},[])).toThrow(/non è più disponibile/);
    expect(customDestinationId("cf:bad-id")).toBeNull();
  });
  it("solo le opzioni del campo sono accettate", () => {
    expect(normalizeMappedCustomValue(def({field_type:"select",options:["A"]}),"A")).toBe("A");
    expect(() => normalizeMappedCustomValue(def({field_type:"select",options:["A"]}),"B")).toThrow();
  });
  it.each([["percent",101],["date","2026-02-30"],["email","invalid"]])("rifiuta %s fuori formato", (type,value) => expect(() => normalizeMappedCustomValue(def({field_type:type}),value)).toThrow());
  it("un'email custom non sostituisce il recapito obbligatorio del modulo", () => {
    const result = validateLeadFormDraft({name:"Demo",slug:"demo",fields:[{id:"e",name:"email_extra",label:"Email extra",type:"email",mapping:`cf:${id}`}]},{publishing:true});
    expect(result.ok).toBe(false); expect(result.errors.join(" ")).toContain("email o telefono");
  });
  it("il form non può pubblicare due destinazioni identiche", () => {
    expect(validateLeadFormDraft({name:"Demo",slug:"demo",fields:fields.concat([{...fields[0],id:"r"}]).map(f=>({...f,label:f.id,name:f.id}))}).ok).toBe(false);
  });
});
describe("ambiti dei preventivatori", () => {
  it.each(Object.entries(QUOTE_FIELD_MODULES))("%s conserva l'identità del modulo %s", (module,prefix) => {
    expect(quoteFieldContext(`/azienda/${module}/${id}/modifica`)).toEqual({entityType:`quote_${prefix}`,id});
  });
  it("usa il percorso reale del FV e quello classico", () => {
    expect(quoteFieldContext(`/azienda/marketing/fotovoltaico/${id}/modifica`)?.entityType).toBe("quote_fv");
    expect(quoteFieldContext(`/azienda/marketing/preventivi/${id}/modifica`)?.entityType).toBe("quote");
  });
  it.each(["/azienda/bagni/nuovo",`/azienda/bagni/${id}`,`/azienda/altro/${id}/modifica`,`/azienda/bagni/invalid/modifica`])("non inventa un record da %s", path => expect(quoteFieldContext(path)).toBeNull());
});
describe("alias storici nei testi contatto", () => {
  it("i filtri con vecchie etichette leggibili continuano a risolvere l'alias", async () => {
    const db = {from(table:string){const q:unknown = new Proxy({}, {get(_t,key){if(key==="then")return (ok:(x:unknown)=>unknown)=>Promise.resolve({data:table==="marketing_custom_fields"?[{id,name:"Nome nuovo",field_type:"text",key_aliases:["nome_vecchio"]}]:[{field_id:id,value:"0"}],error:null}).then(ok);return ()=>q;}});return q;}};
    const custom_field = await loadAutomationCustomFields(db,company,"contact","c");
    for (const key of [id,"Nome nuovo","nome_nuovo","Nome Vecchio"]) expect(filterValue({custom_field},`custom_field.${key}`)).toBe("0");
  });
  it("non legge proprietà ereditate e dà precedenza al nome esatto", () => {
    expect(filterValue({custom_field:{}},"custom_field.constructor")).toBeUndefined();
    expect(filterValue({custom_field:{"campo.nome":false,campo_nome:true}},"custom_field.campo.nome")).toBe(false);
  });
  it("la nuova etichetta, il vecchio alias e l'ID stabile leggono lo stesso valore", async () => {
    const db = {from(table:string){const q:unknown = new Proxy({}, {get(_t,key){if(key==="then")return (ok:(x:unknown)=>unknown)=>Promise.resolve({data:table==="marketing_custom_fields"?[{id,name:"Nome nuovo",deleted_at:null,key_aliases:["nome_vecchio"]}]:[{contact_id:"c",field_id:id,value:"0"}],error:null}).then(ok);return ()=>q;}});return q;}};
    const text = `{{contact.nome_vecchio}} / {{contact.nome_nuovo}} / {{contact.custom_${id.replaceAll("-","")}}}`;
    const r=await loadContactCustomFieldResolver(db,company,["c"],[text],{strict:true});
    expect(applyContactCustomFields(text,"c",r)).toBe("0 / 0 / 0");
  });
});
