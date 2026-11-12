import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContractImportDialog } from "@/components/orders/ContractImportDialog";

const mocks=vi.hoisted(()=>({invoke:vi.fn(),upload:vi.fn(),download:vi.fn(),maybeSingle:vi.fn(),toastError:vi.fn()}));
vi.mock("@/hooks/useContractWorkflowProfile",()=>({useContractWorkflowProfile:()=>({data:"standard"})}));
vi.mock("@/hooks/useFasiDiPartenza",()=>({useFasiDiPartenza:()=>({perContratto:[] as unknown[]})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"demo",name:"Demo Azienda S.r.l."}})}));
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
}
describe("import contratto dalla lettura all'applicazione",()=>{
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
    expect(onApply.mock.calls[0][2]).toMatchObject({bucket:"order-attachments",name:"contratto.pdf"});
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
    fireEvent.click(await screen.findByRole("button",{name:"Applica alla commessa"}));
    expect(onApply).not.toHaveBeenCalled();
    await waitFor(()=>expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("documento originale")));
  });
  it("conserva nel bucket dei contratti il file di Silvio prima di applicarlo",async()=>{
    mocks.maybeSingle.mockResolvedValue({data:{storage_bucket:"documenti-analisi",storage_path:"demo/file.pdf",file_name:"file.pdf",mime_type:"application/pdf",company_id:"demo"},error:null});
    const onApply=apri("analisi-demo");
    await screen.findByText("file.pdf",{exact:true});
    fireEvent.click(screen.getByRole("button",{name:"Analizza con l'AI"}));
    fireEvent.click(await screen.findByRole("button",{name:"Applica alla commessa"}));
    await waitFor(()=>expect(onApply).toHaveBeenCalledOnce());
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][2]).toMatchObject({bucket:"order-attachments",path:expect.stringMatching(/^demo\/ai-contratti\/[a-f0-9]+-file\.pdf$/)});
  });
});
