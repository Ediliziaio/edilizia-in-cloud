import "@testing-library/jest-dom/vitest";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {it,expect,vi,beforeEach,afterEach} from "vitest";
const m=vi.hoisted(()=>({upload:vi.fn(),remove:vi.fn(),signed:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{storage:{from:()=>({upload:m.upload,remove:m.remove,createSignedUrl:m.signed})}}}));
vi.mock("sonner",()=>({toast:{success:m.success,error:m.error}}));
import {OdaDocumentoCard} from "@/components/orders/OdaDocumentoCard";
beforeEach(()=>{m.remove.mockReset().mockResolvedValue({error:null});m.signed.mockReset().mockResolvedValue({data:{signedUrl:"https://example.invalid/file"},error:null});m.upload.mockReset().mockResolvedValue({error:null});m.success.mockReset();m.error.mockReset();});afterEach(cleanup);
it("la conferma originale risulta caricata solo dopo il salvataggio sull'ordine",async()=>{
 let completa:()=>void=()=>{};const onChange=vi.fn((_url: string | null)=>new Promise<void>(resolve=>{completa=resolve;}));
 const {container}=render(<OdaDocumentoCard odaId="oda" label="Conferma originale del fornitore" attachmentUrl={null} onChange={onChange}/>);
 fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["%PDF"],"conferma-originale.pdf",{type:"application/pdf"})]}});
 await waitFor(()=>expect(onChange).toHaveBeenCalled());expect(m.success).not.toHaveBeenCalled();completa();await waitFor(()=>expect(m.success).toHaveBeenCalled());
 expect(onChange.mock.calls[0][0]).toContain("conferma-originale.pdf");
});
it("se il riferimento non viene salvato non annuncia un caricamento riuscito",async()=>{
 const {container}=render(<OdaDocumentoCard odaId="oda" label="Conferma originale del fornitore" attachmentUrl={null} onChange={async()=>{throw new Error("Salvataggio non riuscito");}}/>);
 fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["%PDF"],"originale.pdf",{type:"application/pdf"})]}});
 await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.success).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:/Carica conferma/})).toBeEnabled();
});

it("se il salvataggio sull’ordine fallisce rimuove il solo nuovo upload",async()=>{const {container}=render(<OdaDocumentoCard odaId="oda" label="Conferma" attachmentUrl={null} onChange={async()=>{throw new Error("Non salvato");}}/>);fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[new File(["%PDF"],"conferma.pdf",{type:"application/pdf"})]}});await waitFor(()=>expect(m.remove).toHaveBeenCalledWith([m.upload.mock.calls[0][0]]));expect(m.success).not.toHaveBeenCalled();});
it.each([new File([],"vuoto.pdf",{type:"application/pdf"}),new File(["test"],"test.txt",{type:"text/plain"})])("rifiuta file vuoti o non supportati senza upload",async file=>{const {container}=render(<OdaDocumentoCard odaId="oda" label="Conferma" attachmentUrl={null} onChange={vi.fn()}/>);fireEvent.change(container.querySelector('input[type="file"]')!,{target:{files:[file]}});await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.upload).not.toHaveBeenCalled();});
it("un errore di rete aprendo il documento viene mostrato e il pulsante resta riutilizzabile",async()=>{m.signed.mockRejectedValue(new Error("Rete assente"));render(<OdaDocumentoCard odaId="oda" label="Conferma" attachmentUrl="oda/originale.pdf" onChange={vi.fn()}/>);fireEvent.click(screen.getByRole("button",{name:"Apri conferma"}));await waitFor(()=>expect(m.error).toHaveBeenCalledWith("Documento non apribile",expect.objectContaining({description:"Rete assente"})));expect(screen.getByRole("button",{name:"Apri conferma"})).toBeEnabled();});
it("se non riesce a staccare il riferimento non elimina il file originale",async()=>{render(<OdaDocumentoCard odaId="oda" label="Conferma" attachmentUrl="oda/originale.pdf" onChange={async()=>{throw new Error("Non salvato");}}/>);fireEvent.click(screen.getByRole("button",{name:"Rimuovi conferma"}));await waitFor(()=>expect(m.error).toHaveBeenCalled());expect(m.remove).not.toHaveBeenCalled();});
