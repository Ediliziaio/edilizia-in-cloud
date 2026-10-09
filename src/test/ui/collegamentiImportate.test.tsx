import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CollegamentiEmessaImportata } from "@/components/fatturazione/CollegamentiEmessaImportata";
import { RecuperaClientiImportati } from "@/components/fatturazione/RecuperaClientiImportati";
import { DbMinimo } from "../helpers/edgeFinto";
const mock = vi.hoisted(() => ({ company:"a", edit:true, rpc:vi.fn(), create:vi.fn(), db:null as unknown as DbMinimo, toast:vi.fn() }));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:mock.company}})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditCustomers:mock.edit,canEditOrders:mock.edit})}));
vi.mock("@/lib/fatturazione/collegamentiImportate",()=>({riconciliaEmessa:(...args:unknown[])=>mock.rpc(...args)}));
vi.mock("@/components/orders/CreateCustomerDialog",()=>({CreateCustomerDialog:()=> <div>Modulo cliente senza portale</div>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(name:string)=>mock.db.from(name),functions:{invoke:(...args:unknown[])=>mock.create(...args)}}}));
vi.mock("sonner",()=>({toast:{success:()=>{},error:(...a:unknown[])=>mock.toast(...a)}}));
const fattura: React.ComponentProps<typeof CollegamentiEmessaImportata>["fattura"] = {id:"i",invoice_number:"1/26",document_type:"invoice",order_id:null,client_company_name:"Mario Rossi",client_fiscal_code:"CF",client_vat_number:null,client_email:null,client_address:"Fatturazione",client_city:"Roma",client_zip:"00100",client_country:"IT"};
let client:QueryClient;
beforeEach(()=>{
  client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}}); mock.company="a";mock.edit=true;mock.rpc.mockReset();mock.create.mockReset();mock.toast.mockReset(); mock.db=new DbMinimo();
  mock.rpc.mockResolvedValue({status:"ok",customer_id:null,cliente_operativo_mancante:true,crea_anagrafica:true});
});
afterEach(()=>{cleanup();client.clear();});
const mostra=(el:React.ReactNode)=>render(<MemoryRouter><QueryClientProvider client={client}>{el}</QueryClientProvider></MemoryRouter>);
describe("Collegamenti cliente/lavoro da storico",()=>{
  it("non scrive al caricamento: la verifica è esplicitamente in anteprima",async()=>{
    mostra(<CollegamentiEmessaImportata companyId="a" fattura={fattura}/>);
    await screen.findByRole("button",{name:"Crea cliente per i lavori"});
    expect(mock.rpc.mock.calls).toEqual([["a","i"]]);
    expect(screen.queryByRole("link",{name:"Prepara nuovo lavoro"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Recupera dati anagrafica"}));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("a","i",true,undefined));
  });
  it.each([false,"altra"])("non recupera dati senza permessi o nell'azienda diversa (%s)",async value=>{
    if(value===false)mock.edit=false;else if(value==="altra") mock.company=value;
    mostra(<CollegamentiEmessaImportata companyId="a" fattura={fattura}/>);
    expect(mock.rpc).not.toHaveBeenCalled();expect(screen.queryByRole("button")).toBeNull();
  });
  it("nessun cliente/commessa automatici per identità ambigua",async()=>{
    mock.rpc.mockResolvedValue({status:"da_verificare",motivo:"Due clienti corrispondono"});
    mostra(<CollegamentiEmessaImportata companyId="a" fattura={fattura}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Due clienti");
    expect(screen.queryByRole("button",{name:"Crea cliente per i lavori"})).toBeNull();
  });
  it("una nota di credito permette il collegamento a un lavoro esistente, non uno nuovo",async()=>{
    mock.rpc.mockResolvedValue({status:"ok",customer_id:"c"});
    mock.db.tabelle.orders=[{id:"o",company_id:"a",customer_id:"c",deleted_at:null,order_code:"C-1",description:"Infissi",work_address:"Cantiere"}];
    mostra(<CollegamentiEmessaImportata companyId="a" fattura={{...fattura,document_type:"credit_note"}}/>);
    await screen.findByRole("option",{name:/C-1/});
    expect(screen.queryByRole("link",{name:"Prepara nuovo lavoro"})).toBeNull();
    fireEvent.change(screen.getByLabelText("Commessa da collegare"),{target:{value:"o"}});
    fireEvent.click(screen.getByRole("button",{name:"Collega"}));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("a","i",true,"o"));
  });
  it("commessa già presente: si apre, non se ne crea una copia",async()=>{
    mock.rpc.mockResolvedValue({status:"ok",customer_id:"c",order_id:"o"});
    mostra(<CollegamentiEmessaImportata companyId="a" fattura={{...fattura,order_id:"o"}}/>);
    expect(await screen.findByRole("link",{name:"Apri commessa"})).toHaveAttribute("href","/azienda/ordini/o");
    expect(screen.queryByRole("link",{name:"Prepara nuovo lavoro"})).toBeNull();
  });
  it("errore di verifica non viene presentato come cliente mancante",async()=>{
    mock.rpc.mockRejectedValue(new Error("Rete"));mostra(<CollegamentiEmessaImportata companyId="a" fattura={fattura}/>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco");
    expect(screen.queryByRole("button",{name:"Crea cliente per i lavori"})).toBeNull();
  });
});
describe("Recupero clienti in blocco",()=>{
  it("cambio azienda interrompe il vecchio recupero e non lascia bloccato il nuovo",async()=>{
    let completa!: (r:unknown)=>void;
    mock.rpc.mockImplementationOnce(()=>new Promise(resolve=>{completa=resolve;}));
    const vista=mostra(<RecuperaClientiImportati companyId="a" invoiceIds={["i","i2"]}/>);
    fireEvent.click(screen.getByRole("button",{name:"Recupera clienti dallo storico"}));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button",{name:"Conferma recupero anagrafiche"}));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(1));
    mock.company="b";
    vista.rerender(<MemoryRouter><QueryClientProvider client={client}><RecuperaClientiImportati companyId="b" invoiceIds={["nuova"]}/></QueryClientProvider></MemoryRouter>);
    await act(async()=>{completa({status:"ok",cliente_operativo_mancante:true});});
    expect(mock.create).not.toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Recupera clienti dallo storico"}));
    expect(screen.getByRole("button",{name:"Conferma recupero anagrafiche"})).not.toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("richiede conferma, e per default non crea account o cantieri",async()=>{
    mostra(<RecuperaClientiImportati companyId="a" invoiceIds={["i"]}/>);
    expect(mock.rpc).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Recupera clienti dallo storico"}));
    expect(mock.rpc).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Conferma recupero anagrafiche"}));
    expect(await screen.findByText(/1 nuove anagrafiche/)).toBeInTheDocument();expect(mock.create).not.toHaveBeenCalled();
  });
  it("creazione operativa opt-in: usa il server idempotente, non abilita il portale o email",async()=>{
    mock.db.tabelle.invoices=[{id:"i",company_id:"a",external_provider:"xml_import",deleted_at:null,...fattura}];
    mock.create.mockResolvedValue({data:{success:true,customer:{id:"c"}},error:null});
    mock.rpc.mockResolvedValueOnce({status:"ok",cliente_operativo_mancante:true,crea_anagrafica:true}).mockResolvedValue({status:"ok",customer_id:"c"});
    mostra(<RecuperaClientiImportati companyId="a" invoiceIds={["i"]}/>);
    fireEvent.click(screen.getByRole("button",{name:"Recupera clienti dallo storico"}));
    fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Conferma recupero anagrafiche"}));
    expect(await screen.findByText(/1 nuovi clienti operativi/)).toBeInTheDocument();
    expect(mock.create).toHaveBeenCalledWith("create-customer",{body:expect.objectContaining({company_id:"a",imported_invoice_id:"i",create_portal_account:false,send_welcome_email:false,address:"Fatturazione"})});
    expect(mock.create.mock.calls[0][1].body).not.toHaveProperty("site_address");
  });
  it("riavvio dopo errore: dice quanti non sono stati elaborati e non dichiara successo totale",async()=>{
    mock.rpc.mockRejectedValue(new Error("Rete"));mostra(<RecuperaClientiImportati companyId="a" invoiceIds={["i"]}/>);
    fireEvent.click(screen.getByRole("button",{name:"Recupera clienti dallo storico"}));fireEvent.click(screen.getByRole("button",{name:"Conferma recupero anagrafiche"}));
    expect(await screen.findByText(/1 non elaborate/)).toBeInTheDocument();expect(screen.getByText(/già recuperate non vengono duplicate/)).toBeInTheDocument();
  });
});
