import "@testing-library/jest-dom/vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
const m=vi.hoisted(()=>({create:vi.fn(),upload:vi.fn(),close:vi.fn(),created:vi.fn()}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:null as null})}));
vi.mock("@/hooks/usePurchaseOrders",()=>({usePurchaseOrders:()=>({orders:[{id:"p",oda_number:"ODA-P",status:"bozza",order_id:null as string | null,suppliers:{name:"Fornitore demo"}}]})}));
vi.mock("@/hooks/useDDTRicezione",()=>({useDDTRicezioneMutations:()=>({createDDT:{mutateAsync:m.create}}),useDDTAttachments:()=>({uploadMainDDT:{mutateAsync:m.upload},uploadAttachments:{mutateAsync:m.upload}})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:vi.fn(),functions:{invoke:vi.fn()}}}));
vi.mock("@/components/warehouse/WarehouseSelect",()=>({WarehouseSelect:(): null=>null}));
vi.mock("@/components/warehouse/OrderSelectCombobox",()=>({OrderSelectCombobox:(): null=>null}));
vi.mock("@/components/orders/SupplierSelect",()=>({SupplierSelect:(): null=>null}));
vi.mock("@/components/ddt/DDTAttachmentUploader",()=>({DDTAttachmentUploader:(): null=>null}));
import {NewDDTDialog} from "@/components/ddt/NewDDTDialog";
beforeEach(()=>{m.create.mockReset().mockResolvedValue({id:"d"});m.upload.mockReset();m.close.mockReset();m.created.mockReset();});afterEach(cleanup);
function open(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><NewDDTDialog open prefillPurchaseOrderId="p" restaQui onOpenChange={m.close} onCreated={m.created}/></MemoryRouter></QueryClientProvider>);}
function final(){fireEvent.change(screen.getByLabelText("Numero DDT"),{target:{value:"DDT-SIM"}});fireEvent.click(screen.getByRole("button",{name:"Avanti"}));fireEvent.click(screen.getByRole("button",{name:"Avanti"}));}
describe("Pulsanti DDT con registrazione simulata",()=>{
 it("numero obbligatorio e riepilogo vuoto bloccano la registrazione",()=>{open();expect(screen.getByRole("button",{name:"Avanti"})).toBeDisabled();final();expect(screen.getByRole("button",{name:"Registra DDT"})).toBeDisabled();expect(screen.getByRole("alert")).toHaveTextContent("Aggiungi il documento");expect(m.create).not.toHaveBeenCalled();});
 it("il pulsante finale invia una sola registrazione e chiude soltanto a salvataggio completato",async()=>{let done!:(v:{id:string})=>void;m.create.mockImplementation(()=>new Promise(r=>{done=r;}));open();final();fireEvent.change(screen.getByLabelText("Quantità ricevuta"),{target:{value:"5"}});const b=screen.getByRole("button",{name:"Registra DDT"});fireEvent.click(b);fireEvent.click(b);expect(m.create).toHaveBeenCalledTimes(1);expect(m.close).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledWith(expect.objectContaining({purchase_order_id:"p",numero_ddt:"DDT-SIM",quantita_ricevuta:5,destinazione:"magazzino"}));done({id:"d"});await waitFor(()=>expect(m.close).toHaveBeenCalledWith(false));expect(m.created).toHaveBeenCalledWith("d");expect(m.upload).not.toHaveBeenCalled();});
 it("l'errore di registrazione lascia i dati e permette di riprovare",async()=>{m.create.mockRejectedValueOnce(new Error("Connessione assente"));open();final();fireEvent.change(screen.getByLabelText("Quantità ricevuta"),{target:{value:"3"}});fireEvent.click(screen.getByRole("button",{name:"Registra DDT"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Registra DDT"})).toBeEnabled());expect(screen.getByLabelText("Quantità ricevuta")).toHaveValue(3);expect(m.close).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Registra DDT"}));await waitFor(()=>expect(m.close).toHaveBeenCalledWith(false));expect(m.create).toHaveBeenCalledTimes(2);});
 it("Annulla chiude senza creare bolla né allegati",()=>{open();fireEvent.click(screen.getByRole("button",{name:"Annulla"}));expect(m.close).toHaveBeenCalledWith(false);expect(m.create).not.toHaveBeenCalled();expect(m.upload).not.toHaveBeenCalled();});
});
