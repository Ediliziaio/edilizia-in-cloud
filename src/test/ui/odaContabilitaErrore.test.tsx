import "@testing-library/jest-dom/vitest";
import {render,screen,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({select:()=>({eq:async()=>({data:null as unknown,error:new Error("Offline")})})})}}));
vi.mock("@/components/orders/ExpensePaymentDialog",()=>({ExpensePaymentDialog:(): null=>null}));
import {OdaAccountingCard} from "@/components/orders/OdaAccountingCard";
afterEach(cleanup);
it("un errore di lettura non viene presentato come assenza di costi e fatture",async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={client}><OdaAccountingCard odaId="o" totaleOrdine={100} stato="confermato"/></QueryClientProvider>);expect(await screen.findByRole("alert")).toHaveTextContent("Dati contabili non disponibili");expect(screen.getByRole("button",{name:"Riprova"})).toBeInTheDocument();expect(screen.queryByText(/Nessuno:/)).not.toBeInTheDocument();client.clear();});
