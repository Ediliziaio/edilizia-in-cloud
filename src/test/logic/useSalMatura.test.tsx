import {cleanup,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ReactNode} from "react";
const state=vi.hoisted(()=>({read:vi.fn(),company:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({select:()=>({eq:(_key:string,id:string)=>{state.company(id);return {maybeSingle:state.read};}})})}}));
import {useSalMatura} from "@/hooks/useSalMatura";
const wrapper=()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:1,gcTime:0}}});
  return ({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
beforeEach(()=>{vi.clearAllMocks();});afterEach(cleanup);
describe("Regola SAL: assenza e guasto sono diversi",()=>{
  it("una riga assente usa il default del database",async()=>{
    state.read.mockResolvedValue({data:null,error:null});const h=renderHook(()=>useSalMatura("company-one"),{wrapper:wrapper()});
    await waitFor(()=>expect(h.result.current).toBe("emesso"));expect(state.company).toHaveBeenCalledWith("company-one");
  });
  it("un errore non inventa la regola emesso",async()=>{
    state.read.mockResolvedValue({data:null,error:new Error("rete")});const h=renderHook(()=>useSalMatura("company"),{wrapper:wrapper()});
    await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));expect(h.result.current).toBeNull();
  });
  it("una configurazione sconosciuta è non verificata",async()=>{
    state.read.mockResolvedValue({data:{sal_matura_quando:"mistero"},error:null});const h=renderHook(()=>useSalMatura("company"),{wrapper:wrapper()});
    await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(2));expect(h.result.current).toBeNull();
  });
  it("non effettua richieste senza azienda",()=>{
    const h=renderHook(()=>useSalMatura(undefined),{wrapper:wrapper()});expect(h.result.current).toBeNull();expect(state.read).not.toHaveBeenCalled();
  });
  it("mantiene distinta la regola approvato",async()=>{
    state.read.mockResolvedValue({data:{sal_matura_quando:"approvato"},error:null});const h=renderHook(()=>useSalMatura("company"),{wrapper:wrapper()});
    await waitFor(()=>expect(h.result.current).toBe("approvato"));
  });
});
