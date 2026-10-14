/// <reference types="node" />
import {describe,it,expect} from "vitest";
import {writeFileSync} from "node:fs";
import {variationPreviewPdf,variationProposalPdf,variationPdfFilename} from "@/lib/orders/variationPreviewPdf";
import {prepareVariation,emptyVariationDraft} from "@/lib/orders/variationDraft";
describe("Documento di anteprima variante",()=>{
  it("gestisce più pagine e non include note riservate o una firma inesistente",async()=>{
    const prepared=prepareVariation({...emptyVariationDraft(),kind:"riduzione",title:"DEMO - Riduzione e sostituzione pavimento",phase:"Pavimenti e rivestimenti",description:"Il cliente richiede una superficie ridotta rispetto al contratto originario.\n\n"+Array.from({length:18},(_,i)=>`${i+1}. Area ${i+1}: rimozione della voce prevista, mantenendo la preparazione del sottofondo. La posa e le superfici effettive saranno concordate prima dell'avvio.`).join("\n\n"),amount:"1250,50",days:"2",dayUnit:"lavorativi",requester:"Cliente DEMO",internalNotes:"SEGRETO_NON_ESPORTARE"});
    const pdf=await variationPreviewPdf(prepared,{orderCode:"DEMO-ORD-001",customerName:"Cliente DEMO",currentNet:22000,vatRate:10});
    const source=pdf.output();expect(pdf.getNumberOfPages()).toBeGreaterThan(1);expect(source).not.toContain("SEGRETO_NON_ESPORTARE");expect(source).toContain("Non salvata, non inviata, non firmata");
    if(process.env.VARIATION_PDF_PROOF)writeFileSync(process.env.VARIATION_PDF_PROOF,Buffer.from(pdf.output("arraybuffer")));
  });
  it("crea una proposta offline completa con firma a mano, senza token o finta approvazione",async()=>{
    const prepared=prepareVariation({...emptyVariationDraft(),title:"Opere aggiuntive cucina",description:"Fornitura e posa di nuove piastrelle nella zona cucina. Sono inclusi materiali, posa e pulizia finale.",amount:"1250,50",contractReference:"Preventivo PRE-DEMO-015 del 10/10/2026",paymentTerms:"30% dopo accettazione; saldo alla consegna.",days:"2",requester:"Cliente DEMO",internalNotes:"SEGRETO_NON_ESPORTARE"});
    const pdf=await variationProposalPdf(prepared,{companyName:"Impresa Edile DEMO S.r.l.",companyDetails:"Via Esempio 10, 20100 Milano\nP.IVA: DATO DIMOSTRATIVO - non valido",customerName:"Cliente DEMO",customerAddress:"Via Prova 20, 40100 Bologna",siteAddress:"Via Cantiere 12, Bologna",orderCode:"ORD-DEMO-001",currentNet:22000,vatRate:10});
    const s=pdf.output();expect(s).toContain("DA APPROVARE");expect(s).not.toContain("ANTEPRIMA BOZZA");expect(s).toContain("Firma cliente per approvazione");expect(s).toContain("Preventivo PRE-DEMO-015");expect(s).not.toContain("SEGRETO_NON_ESPORTARE");expect(s).not.toContain("firma-odv");
    if(process.env.VARIATION_OFFLINE_PDF_PROOF)writeFileSync(process.env.VARIATION_OFFLINE_PDF_PROOF,Buffer.from(pdf.output("arraybuffer")));
  });
  it("richiede le parti per il documento da inviare, ma mantiene l'anteprima disponibile",async()=>{
    const p=prepareVariation({...emptyVariationDraft(),title:"Prova",description:"Lavori",amount:"10"});
    expect(()=>variationProposalPdf(p,{})).toThrow("Completa impresa e cliente");
    expect(variationPdfFilename("ORD/2026/1","Extra <script>/../../")).toBe("variante-ORD-2026-1-Extra-script.pdf");
  });
  it("ristampa identifica OdV e registrazione, recupera i giorni delle vecchie varianti senza inventarne l'unità",async()=>{
    const pdf=await variationProposalPdf({titolo:"Extra registrato",descrizione:"Opere extra concordate in proposta",motivazione:null,richiesto_da:null,impatto_economico:500,impatto_giorni:3},
      {companyName:"Impresa DEMO",customerName:"Cliente DEMO",orderCode:"ORD-DEMO-001",proposalNumber:4,proposalRegisteredAt:"2026-10-09T08:30:00Z",currentNet:22000,vatRate:10});
    const s=pdf.output();expect(s).toContain("OdV #4");expect(s).toContain("9/10/2026");expect(s).toContain("3 giorni");expect(s).toContain("non specifica");expect(s).toContain("originale inviato");expect(s).not.toContain("Documento firmato");
    if(process.env.VARIATION_REPRINT_PDF_PROOF)writeFileSync(process.env.VARIATION_REPRINT_PDF_PROOF,Buffer.from(pdf.output("arraybuffer")));
  });
  it("i giorni malformati sono respinti anche quando la descrizione contiene già i tempi",async()=>{
    await expect(variationProposalPdf({titolo:"Extra",descrizione:"Nessuna estensione dei tempi richiesta.",motivazione:null,richiesto_da:null,impatto_economico:50,impatto_giorni:-1},{companyName:"Impresa",customerName:"Cliente"})).rejects.toThrow("Giorni aggiuntivi");
  });
  it.each(["Nessuna estensione dei tempi richiesta.","Tempo aggiuntivo richiesto: 5 giorni calendario."])("non nasconde una discrepanza nei tempi: %s",async descrizione=>{
    await expect(variationProposalPdf({titolo:"Extra",descrizione,motivazione:null,richiesto_da:null,impatto_economico:50,impatto_giorni:2},{companyName:"Impresa",customerName:"Cliente"})).rejects.toThrow("Tempi incoerenti");
  });
  it("non produce un contratto negativo da una vecchia proposta di riduzione",async()=>{
    await expect(variationProposalPdf({titolo:"Riduzione",descrizione:"Riduzione di opere",motivazione:null,richiesto_da:null,impatto_economico:-1200,impatto_giorni:0},{companyName:"Impresa",customerName:"Cliente",currentNet:1000})).rejects.toThrow("riduzione supera");
  });
});
