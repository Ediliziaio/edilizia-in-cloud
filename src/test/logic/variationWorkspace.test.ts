import { describe,it,expect } from "vitest";
import { emptyVariationDraft } from "@/lib/orders/variationDraft";
import { validateVariationWorkspace,variationDraftPublicTerms,checkVariationDocument } from "@/lib/orders/variationWorkspace";
const id="00000000-0000-4000-a000-000000000001";
describe("Bozze e documenti privati delle varianti",()=>{
  it("conserva gli appunti ma non si fida di stato, firma o importi di contesto",()=>{const {content,context}=validateVariationWorkspace({...emptyVariationDraft(),internalNotes:"privato",status:"approvato",firma_token:"segreto"},{currentNet:999999,vatRate:1,companyName:"Demo"});expect(content.internalNotes).toBe("privato");expect(content).not.toHaveProperty("status");expect(content).not.toHaveProperty("firma_token");expect(context).not.toHaveProperty("currentNet");expect(context).not.toHaveProperty("vatRate");});
  it("una bozza incompleta non produce ricavi né note pubbliche",()=>{expect(variationDraftPublicTerms({...emptyVariationDraft(),internalNotes:"non mostrare"})).toMatchObject({impatto_economico:0,note_interne:null});});
  it.each([{kind:"errore"},{phaseId:"altra"},{attachmentIds:[id]},{attachmentIds:[id,id],templateId:id},{days:"x".repeat(11)}])("rifiuta riferimenti e campi invalidi %j",value=>expect(()=>validateVariationWorkspace({...emptyVariationDraft(),...value},{})).toThrow());
  it("impedisce documenti in un altro ordine o allegati con percorso arbitrario",()=>{const document={id,variation_id:id,company_id:id,order_id:id,pdf_path:`${id}/${id}/${id}/${id}/proposal.pdf`,document_hash:"a".repeat(64),pdf_size:100,attachments:[]} as Parameters<typeof checkVariationDocument>[0];expect(checkVariationDocument(document,id,id,id)).toBe(document);expect(()=>checkVariationDocument({...document,pdf_path:"altro.pdf"},id,id,id)).toThrow();expect(()=>checkVariationDocument({...document,attachments:[{id,name:"test",path:"altro.pdf",size:10,hash:"a".repeat(64)}]},id,id,id)).toThrow();});
});
