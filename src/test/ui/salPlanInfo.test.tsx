import "@testing-library/jest-dom/vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {SalPlanInfo} from "@/components/orders/SalPlanInfo";
const state=vi.hoisted(()=>({rule:"approvato" as string|null,settings:true}));
vi.mock("@/hooks/useSalMatura",()=>({useSalMatura:()=>state.rule}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canViewSettingsOrders:state.settings})}));
beforeEach(()=>{state.rule="approvato";state.settings=true;});afterEach(cleanup);
const draw=()=>render(<QueryClientProvider client={new QueryClient()}><SalPlanInfo creating companyId="company" installments={[{id:"r",position:0,label:"SAL 1",type:"deposit",amount:100,is_paid:false,trigger_evento:"sal_numero"}]}/></QueryClientProvider>);
describe("Impostazioni e nuova commessa: SAL non generati dalle rate",()=>{
  it("spiega cosa nasce alla creazione, ambito aziendale e percorso per il verbale",()=>{draw();expect(screen.getByLabelText("Come funzionano i SAL")).toHaveTextContent("non si generano verbali o fatture");expect(screen.getByLabelText("Come funzionano i SAL")).toHaveTextContent("tutte le commesse");expect(screen.getByRole("link")).toHaveAttribute("href","/azienda/impostazioni/modelli-pagamento#sal");});
  it("lettura fallita non presume la maturazione all'emissione",()=>{state.rule=null;draw();expect(screen.getByText(/Regola aziendale non verificata/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Rileggi regola SAL"})).toBeInTheDocument();});
  it("non espone le impostazioni a chi non ha il permesso",()=>{state.settings=false;draw();expect(screen.queryByRole("link")).not.toBeInTheDocument();});
});
