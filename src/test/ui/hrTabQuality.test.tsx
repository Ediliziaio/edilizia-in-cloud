import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TabDocumenti } from "@/pages/azienda/personale/tabs/TabDocumenti";
import { TabProfili } from "@/pages/azienda/personale/tabs/TabProfili";
import { HrPager } from "@/components/hr/HrPager";
const state=vi.hoisted(()=>({error:false,readOnly:false,profiles:[] as Record<string,unknown>[],retry:vi.fn()}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"demo"}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({isAdmin:true,canViewPersone:true,solaLettura:state.readOnly,isLoading:false})}));
vi.mock("@/hooks/useOrganigramma",()=>({useAllHrProfili:()=>({data:state.profiles,isLoading:false,isError:state.error,refetch:state.retry})}));
vi.mock("@/hooks/useHrDocumenti",()=>({
  useHrScadenzeAzienda:()=>({isLoading:false,isError:state.error,refetch:state.retry,data:[{id:"doc",hr_profilo_id:"past",persona:"Persona Storica",categoria:"altro",titolo:"Documento prova",data_scadenza:"2026-01-01",stato:"scaduto"}]}),
  useHrScadenzeCounts:()=>({data:new Map(),isError:false}),
}));
vi.mock("@/components/hr/HrDocumentiSection",()=>({HrDocumentiSection:({profiloId}:{profiloId:string})=><div>Archivio persona {profiloId}</div>}));
vi.mock("@/components/hr/PushConsentBanner",()=>({PushConsentBanner:():null=>null}));
vi.mock("@/components/hr/HrProfiloSheet",()=>({HrProfiloSheet:():null=>null}));
// A fluent mock for the profile selector, without any network or writes.
vi.mock("@/integrations/supabase/client",()=>({supabase:{from(){const chain:Record<string,unknown>={};["select","eq","order","range","abortSignal"].forEach(k=>chain[k]=()=>chain);chain.then=(resolve:(v:unknown)=>void)=>resolve({data:[],error:null});return chain;}}}));
function mount(element:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);}
beforeEach(()=>{state.error=false;state.readOnly=false;state.profiles=[];});afterEach(cleanup);
describe("qualità schede HR",()=>{
  it("opens the person's archive from a global deadline without a second tab click",async()=>{
    mount(<TabDocumenti/>);fireEvent.click(screen.getByRole("button",{name:"Persona Storica"}));
    await waitFor(()=>expect(screen.getByText("Archivio persona past")).toBeTruthy());
    expect(screen.getByRole("tab",{name:"Per persona"}).getAttribute("aria-selected")).toBe("true");
  });
  it("never shows a compliant empty-state when deadlines fail",()=>{
    state.error=true;mount(<TabDocumenti/>);
    expect(screen.getByRole("alert").textContent).toContain("non disponibili");
    expect(screen.queryByText("Nessuna scadenza da gestire")).toBeNull();
    expect(screen.queryByText("Documenti con scadenza")).toBeNull();
  });
  it("shows active profiles first, pages them, and blocks new profiles for read-only users",()=>{
    state.readOnly=true;state.profiles=Array.from({length:23},(_,i)=>({id:String(i),nome:`Persona ${i}`,cognome:"Test",attivo:i!==22,tipo_contratto:"indeterminato"}));
    mount(<TabProfili/>);
    expect(screen.queryByText("Persona 22 Test")).toBeNull();
    expect(screen.getByRole("button",{name:"Nuovo Profilo"}).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Successivi"}));
    expect(screen.getByRole("button",{name:"Apri profilo di Persona 21 Test"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Apri profilo di Persona 0 Test"})).toBeNull();
  });
  it("a reduced dataset never traps the pager on a nonexistent page",()=>{
    const change=vi.fn();mount(<HrPager total={21} page={7} onPage={change}/>);
    expect(screen.getByText("Pagina 2 di 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Precedenti"}));expect(change).toHaveBeenCalledWith(0);
  });
});
