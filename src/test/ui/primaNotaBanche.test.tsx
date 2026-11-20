import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NewEntryDialog from "@/components/prima-nota/NewEntryDialog";
const banche = [
  { valore:"banca:alfa", etichetta:"Banca Alfa · …1234", account_label:"Banca Alfa", bank_account_id:"alfa", conto_liquidita_id:"piano-alfa" },
  { valore:"banca:beta", etichetta:"Banca Beta · …5678", account_label:"Banca Beta", bank_account_id:"beta", conto_liquidita_id:"piano-beta" },
];
vi.mock("@/hooks/useContiPrimaNota", () => ({useContiPrimaNota:()=>({data:banche,isError:false,isPending:false})}));
vi.mock("@/contexts/AuthContext", () => ({useAuth:()=>({effectiveCompany:{id:"demo",contabilita_generale_attiva:true}})}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{rpc:async():Promise<{data:{metodo:string}[];error:null}>=>({data:[],error:null}),from:()=>{
  const q={select:()=>q,eq:()=>q,order:()=>q,not:()=>q,is:()=>q,limit:()=>q,then:(r:unknown)=>Promise.resolve({data:[],error:null}).then(r as never)};return q;
}}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
Element.prototype.scrollIntoView ??= ()=>{};
it("chiede la banca effettiva e salva il conto scelto con la sua identità e il conto contabile",async()=>{
  const confirm=vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><NewEntryDialog open onOpenChange={vi.fn()} onConfirm={confirm} isPending={false}/></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText("Descrizione"),{target:{value:"Pagamento con Banca Beta"}});
  fireEvent.change(screen.getByRole("spinbutton"),{target:{value:"123"}});
  expect(screen.getByText("Scegli il conto bancario effettivo.")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Registra"})).toBeDisabled();
  fireEvent.keyDown(screen.getByLabelText("Conto",{exact:true}),{key:"ArrowDown"});
  fireEvent.click(await screen.findByRole("option",{name:"Banca Beta · …5678"}));
  fireEvent.keyDown(screen.getByLabelText("Metodo",{exact:true}),{key:"ArrowDown"});
  fireEvent.click(await screen.findByRole("option",{name:"Nuova modalità…"}));
  fireEvent.change(screen.getByLabelText("Modalità di pagamento personalizzata"),{target:{value:"POS SumUp"}});
  fireEvent.click(screen.getByRole("button",{name:"Registra"}));
  await waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.objectContaining({bank_account_id:"beta",conto_liquidita_id:"piano-beta",account_label:"Banca Beta",amount:123,payment_method:"POS SumUp"})));
  expect(screen.getByRole("link",{name:"Apri scrittura con più conti"})).toHaveAttribute("href",expect.stringContaining("nuova=scrittura"));
});
