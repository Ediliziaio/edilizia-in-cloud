import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContractImportDialog } from "@/components/orders/ContractImportDialog";
import { REGOLA_VOCI } from "@/lib/orders/avvisiContratto";

const mocks=vi.hoisted(()=>({invoke:vi.fn(),upload:vi.fn(),download:vi.fn(),maybeSingle:vi.fn(),toastError:vi.fn(),leggiComputo:vi.fn(),cerca:vi.fn(),recenti:vi.fn(),salva:vi.fn()}));
vi.mock("@/lib/orders/lettureContrattoSalvate",async(importOriginal)=>({
  ...await importOriginal<typeof import("@/lib/orders/lettureContrattoSalvate")>(),
  cercaLetturaContratto:mocks.cerca,elencaLettureContratto:mocks.recenti,salvaLetturaContratto:mocks.salva,
}));
vi.mock("@/lib/orders/contrattoDaComputo",()=>({leggiComputoSenzaAi:mocks.leggiComputo}));
vi.mock("@/hooks/useContractWorkflowProfile",()=>({useContractWorkflowProfile:()=>({data:"standard"})}));
vi.mock("@/hooks/useFasiDiPartenza",()=>({useFasiDiPartenza:()=>({perContratto:[] as unknown[]})}));
vi.mock("@/hooks/usePianoAcquistiComputo",()=>({usePianoAcquistiComputo:()=>({data:{magazzino:[],esistenti:[],coperture:[],fasi:[],fornitori:[]},isPending:false,isError:false})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"demo",name:"Demo Azienda S.r.l."}})}));
const testo=vi.hoisted(()=>({pagine:[] as string[]}));
vi.mock("@/lib/orders/testoPaginePdf",()=>({testoPaginePdf:async()=>testo.pagine}));
vi.mock("sonner",()=>({toast:{error:mocks.toastError,success:vi.fn(),warning:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{
  functions:{invoke:mocks.invoke},
  storage:{from:()=>({upload:mocks.upload,download:mocks.download})},
  from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.maybeSingle})})}),
}}));

const extracted={natura_documento:"contratto_cliente",cliente:{nome_completo:"[DEMO] Cliente"},descrizione_lavori:"Due finestre",importo_totale_eur:1000,iva_pct:10,importo_totale_ivato_eur:1100,voci:[{descrizione:"Finestra",quantita:2,prezzo_unitario_eur:500}],fasi_pagamento:[{descrizione:"Saldo",percentuale:100}],data_documento:"2026-11-11"};
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal("crypto",webcrypto);
  vi.stubGlobal("File",class extends File { async arrayBuffer(){return new Uint8Array([1,2,3]).buffer;} });
  mocks.upload.mockResolvedValue({error:null});
  mocks.download.mockResolvedValue({data:new Blob(["PDF"]),error:null});
  mocks.maybeSingle.mockResolvedValue({data:null,error:null});
  mocks.invoke.mockResolvedValue({data:{extracted},error:null});
  mocks.leggiComputo.mockResolvedValue(null);
  mocks.cerca.mockResolvedValue(null);mocks.recenti.mockResolvedValue([]);
  mocks.salva.mockImplementation(async(input)=>({versione:1,contesto:input.contesto,salvata_il:"2026-11-19T15:00:00Z",estratto:input.estratto,originale:input.originale}));
  testo.pagine=[];
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function apri(initialAnalysisId?:string){
  const onApply=vi.fn();
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><ContractImportDialog open companyId="demo" onOpenChange={vi.fn()} onApply={onApply} initialAnalysisId={initialAnalysisId}/></MemoryRouter></QueryClientProvider>);
  return onApply;
}
async function leggi(){
  const file=new File(["PDF"],"contratto.pdf",{type:"application/pdf"});
  Object.defineProperty(file,"arrayBuffer",{value:async()=>new Uint8Array([1,2,3]).buffer});
  fireEvent.change(screen.getByLabelText("File contratto"),{target:{files:[file]}});
  fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
  await screen.findByRole("button",{name:"Applica alla commessa"});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Applica alla commessa"})).not.toBeDisabled());
}
describe("import contratto dalla lettura all'applicazione",()=>{
  it("stesso file rinominato: riprende l'analisi senza upload o AI",async()=>{
    const {parseContractExtract}=await import("@/lib/orders/contractExtract");
    mocks.cerca.mockResolvedValue({versione:1,contesto:"contesto",salvata_il:"2026-11-19T15:00:00Z",estratto:parseContractExtract(extracted),originale:{bucket:"documenti-smart",path:"demo/ai-contratti/originale.pdf",name:"originale.pdf",mime:"application/pdf"}});
    const onApply=apri();await leggi();
    expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
    expect(await screen.findByText(/Lettura recuperata/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    expect(onApply).toHaveBeenCalledOnce();
  });
  it("riapre una lettura recente senza riselezionare il documento",async()=>{
    const {parseContractExtract}=await import("@/lib/orders/contractExtract");
    mocks.recenti.mockResolvedValue([{versione:1,contesto:"contesto",salvata_il:"2026-11-19T15:00:00Z",estratto:parseContractExtract(extracted),originale:{bucket:"documenti-smart",path:"demo/ai-contratti/originale.pdf",name:"originale.pdf",mime:"application/pdf"}}]);
    apri();fireEvent.click(await screen.findByRole("button",{name:/originale.pdf ·/}));
    expect(await screen.findByRole("button",{name:"Applica alla commessa"})).toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("ripristina anche le indicazioni usate per una lettura recente",async()=>{
    const {parseContractExtract}=await import("@/lib/orders/contractExtract");
    const {contestoLetturaContratto}=await import("@/lib/orders/lettureContrattoSalvate");
    mocks.recenti.mockResolvedValue([{versione:1,contesto:contestoLetturaContratto("cliente","Demo Azienda S.r.l.","IVA da verificare"),salvata_il:"2026-11-19T15:00:00Z",estratto:parseContractExtract(extracted),originale:{bucket:"documenti-smart",path:"demo/ai-contratti/originale.pdf",name:"originale.pdf",mime:"application/pdf"}}]);
    apri();fireEvent.click(await screen.findByRole("button",{name:/originale.pdf ·/}));
    fireEvent.click(screen.getByRole("button",{name:"Ricarica un altro"}));
    expect(screen.getByLabelText("Indicazioni per l'AI (facoltative)")).toHaveValue("IVA da verificare");
  });
  it("un guasto dell'archivio non viene scambiato per assenza di letture già pagate",async()=>{
    mocks.cerca.mockRejectedValue(new Error("Archivio non disponibile"));
    apri();
    fireEvent.change(screen.getByLabelText("File contratto"),{target:{files:[new File(["PDF"],"contratto.pdf",{type:"application/pdf"})]}});
    fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Archivio non disponibile");
    expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("un computo strutturato si analizza sul dispositivo e si carica solo alla conferma",async()=>{
    const {parseContractExtract}=await import("@/lib/orders/contractExtract");
    mocks.leggiComputo.mockResolvedValue(parseContractExtract({...extracted,origine_lettura:"computo",fasi_lavoro:[{nome:"Fondazioni",sottofasi:["Armature"]}]}));
    const onApply=apri();await leggi();
    expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("tab",{name:/Voci di lavoro/})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][2]).toMatchObject({bucket:"documenti-smart",name:"contratto.pdf"});
  });
  it("rifiuta un file vuoto prima di chiamare l'AI",()=>{
    apri();fireEvent.change(screen.getByLabelText("File contratto"),{target:{files:[new File([],"vuoto.pdf",{type:"application/pdf"})]}});
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("file è vuoto"));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"Analizza con l'AI"})).toBeDisabled();
  });
  it("mantiene l'originale e non certifica la firma dalla data del documento",async()=>{
    const onApply=apri();await leggi();
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][2]).toMatchObject({bucket:"documenti-smart",name:"contratto.pdf"});
    expect(onApply.mock.calls[0][2]).not.toHaveProperty("firmaConfermataIl");
    expect(mocks.invoke.mock.calls[0][1].body.user_hint).toContain("quota_azienda_eur");
  });
  it("richiede la data di firma effettiva dopo la verifica esplicita",async()=>{
    const onApply=apri();await leggi();
    fireEvent.click(screen.getByLabelText("Ho verificato che il documento è firmato dalle parti"));
    expect(screen.getByRole("button",{name:"Applica alla commessa"})).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Data effettiva della firma"),{target:{value:"2020-11-10"}});
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    expect(onApply.mock.calls[0][2]).toMatchObject({firmaConfermataIl:"2020-11-10"});
  });
  it("un'estrazione vuota non cancella i campi della commessa",async()=>{
    mocks.invoke.mockResolvedValue({data:{extracted:{}},error:null});
    const onApply=apri();
    const file=new File(["PDF"],"vuoto.pdf",{type:"application/pdf"});
    Object.defineProperty(file,"arrayBuffer",{value:async()=>new Uint8Array([1]).buffer});
    fireEvent.change(screen.getByLabelText("File contratto"),{target:{files:[file]}});
    fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non sono stati letti dati utili");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole("button",{name:"Applica alla commessa"})).not.toBeInTheDocument();
  });
  it("non perde in silenzio il documento arrivato da Silvio se il download fallisce",async()=>{
    mocks.maybeSingle.mockResolvedValue({data:{storage_bucket:"order-attachments",storage_path:"demo/file.pdf",file_name:"file.pdf",mime_type:"application/pdf",company_id:"demo"},error:null});
    mocks.download.mockResolvedValue({data:null,error:{message:"Not found"}});
    const onApply=apri("analisi-demo");
    await screen.findByText("file.pdf",{exact:true});
    fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
    await screen.findByRole("button",{name:"Applica alla commessa"});
    await waitFor(()=>expect(screen.getByRole("button",{name:"Applica alla commessa"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(()=>expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("documento originale")));
  });
  it("conserva nel bucket dei contratti il file di Silvio prima di applicarlo",async()=>{
    mocks.maybeSingle.mockResolvedValue({data:{storage_bucket:"documenti-analisi",storage_path:"demo/file.pdf",file_name:"file.pdf",mime_type:"application/pdf",company_id:"demo"},error:null});
    const onApply=apri("analisi-demo");
    await screen.findByText("file.pdf",{exact:true});
    fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
    await screen.findByRole("button",{name:"Applica alla commessa"});
    await waitFor(()=>expect(screen.getByRole("button",{name:"Applica alla commessa"})).toBeEnabled());
    fireEvent.click(screen.getByRole("button",{name:"Applica alla commessa"}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][2]).toMatchObject({bucket:"documenti-smart",path:expect.stringMatching(/^demo\/ai-contratti\/[a-f0-9]+-file\.pdf$/)});
  });
  it("manda sempre la regola delle voci; se l'AI legge solo il totale di un PDF pieno di prezzi, rilegge da sola",async()=>{
    // Il preventivo vero (17/11/2026): la riga «a corpo» e sotto 56 righe con i prezzi.
    testo.pagine=[Array.from({length:30},(_,i)=>`DEM_1.${i} Demolizione € ${(i+10).toLocaleString("it-IT")},50 Mq 10,00 € ${(i+100).toLocaleString("it-IT")},00`).join("\n")];
    const dettaglio=Array.from({length:20},(_,i)=>({descrizione:`Voce ${i+1}`,quantita:1,prezzo_unitario_eur:50}));
    mocks.invoke
      .mockResolvedValueOnce({data:{extracted:{...extracted,voci:[{descrizione:"Ristrutturazione a corpo",quantita:1,prezzo_unitario_eur:1000}]}},error:null})
      .mockResolvedValueOnce({data:{extracted:{...extracted,voci:dettaglio}},error:null});
    apri();await leggi();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls[0][1].body.user_hint).toContain(REGOLA_VOCI);
    expect(mocks.invoke.mock.calls[1][1].body.user_hint).toContain("estrai OGNI riga");
    // Le venti righe del documento sono lavorazioni ancora da scomporre, non venti prodotti.
    fireEvent.click(await screen.findByRole("tab",{name:/Articoli0/}));
    expect(screen.getByText(/20 voci senza unità dichiarata/)).toBeInTheDocument();
  });
});
