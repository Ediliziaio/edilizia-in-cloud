import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { BatchScanEntry } from "@/components/warehouse/BatchBarcodeScanner";
const mocks=vi.hoisted(()=>({register:vi.fn().mockResolvedValue({uscita_id:"uscita",numero:"U-1",created_movements:1,updated_units:1,errors:[]})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"company"}})}));
vi.mock("@/hooks/use-mobile",()=>({useIsMobile:()=>false}));
vi.mock("@/hooks/warehouse/useWarehouseUscita",()=>({useRegisterUscita:()=>({mutateAsync:mocks.register,isPending:false})}));
vi.mock("@/components/warehouse/OrderSelectCombobox",()=>({OrderSelectCombobox:({value}:{value:string})=><output aria-label="Commessa selezionata">{value}</output>}));
vi.mock("@/components/warehouse/CreaDdtDaUscitaDialog",()=>({CreaDdtDaUscitaDialog:(): null => null}));
vi.mock("@/components/warehouse/ManualArticleAdder",()=>({ManualArticleAdder:({onEntriesChange}:{onEntriesChange:(entries:BatchScanEntry[])=>void})=><>
 <button onClick={()=>onEntriesChange([{clientUuid:"r1",scannedAt:0,stockItemId:"stock",itemName:"Modello serializzato",quantity:1,serialNumbers:[],rawCode:"M1",trackingMode:"serialized"}])}>Articolo senza matricola</button>
 <button onClick={()=>onEntriesChange([{clientUuid:"r1",scannedAt:0,stockItemId:"stock",itemName:"Modello serializzato",quantity:1,serialNumbers:["DEMO-003"],rawCode:"M1",trackingMode:"serialized"}])}>Articolo con matricola</button>
 </>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 const result={data:table==="warehouses"?[{id:"warehouse",name:"Magazzino demo",is_default:true}]:[],error:null as null};
 const q:Record<string,unknown>={};for(const m of ["select","eq","in","order","limit"])q[m]=()=>q;
 q.maybeSingle=async()=>({data:null as null,error:null as null});q.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve);return q;
}}}));
import { UscitaMerceSheet } from "@/components/warehouse/UscitaMerceSheet";
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("mantiene il destinatario completo e richiede la matricola prima della RPC transazionale",async()=>{
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><UscitaMerceSheet open onOpenChange={vi.fn()} initialOrder={{id:"order",order_code:"DEMO",customer_name:"Cliente demo",default_warehouse_id:"warehouse",work_start_date:null,work_end_date:null,expected_date:null,indirizzo_lavori:"Via Cantiere 1",status:null}} /></QueryClientProvider>);
 expect(screen.getByLabelText("Commessa selezionata")).toHaveTextContent("order");
 expect(mocks.register).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Articolo senza matricola"}));
 expect(screen.getByRole("button",{name:/Registra uscita/})).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Articolo con matricola"}));
 const save=screen.getByRole("button",{name:/Registra uscita/});expect(save).toBeEnabled();fireEvent.click(save);
 await waitFor(()=>expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({warehouseId:"warehouse",destinatario:{tipo:"cantiere",order_id:"order",cliente_snapshot:{ragione_sociale:"Cliente demo",indirizzo_via:"Via Cantiere 1",indirizzo_nazione:"IT",tipo_cliente:"B2B"}},scans:[{stock_item_id:"stock",quantity:1,serial_numbers:["DEMO-003"],raw_code:"M1"}]})));
});
