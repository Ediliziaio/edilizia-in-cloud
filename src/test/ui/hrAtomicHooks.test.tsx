import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSalvaUfficio } from "@/hooks/useUffici";
import { useAssumiCandidato } from "@/hooks/useHrCandidati";
import { useUpdateRichiestaStato } from "@/hooks/useRichieste";
const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),success:vi.fn(),company:"demo" as string|null}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>state.company}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:state.rpc,from:state.from}}));
vi.mock("sonner",()=>({toast:{success:state.success,error:vi.fn()}}));
function wrapper({children}:{children:ReactNode}) {return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{children}</QueryClientProvider>;}
beforeEach(()=>{vi.clearAllMocks();state.company="demo";state.rpc.mockResolvedValue({data:"id",error:null});});afterEach(cleanup);
it("office save uses one atomic operation, never delete+insert from the browser",async()=>{
 const hook=renderHook(()=>useSalvaUfficio("demo"),{wrapper});
 await act(async()=>{await hook.result.current.mutateAsync({nome:"Tecnico",membri:["m","m"]});});
 expect(state.rpc).toHaveBeenCalledWith("hr_salva_ufficio",expect.objectContaining({p_company:"demo",p_membri:["m"]}));
 expect(state.from).not.toHaveBeenCalled();
});
it("candidate retry relies on the server link, not on stale client candidate data",async()=>{
 const hook=renderHook(()=>useAssumiCandidato(),{wrapper});
 await act(async()=>{await hook.result.current.mutateAsync({id:"candidate",hr_profilo_id:"stale"} as never);});
 expect(state.rpc).toHaveBeenCalledWith("hr_collega_candidato",{p_company:"demo",p_candidato:"candidate"});
 expect(state.from).not.toHaveBeenCalled();
});
it("a missing request RPC cannot fall back to partial balance and day updates",async()=>{
 state.rpc.mockResolvedValue({data:null,error:{code:"PGRST202",message:"Could not find the function"}});
 const hook=renderHook(()=>useUpdateRichiestaStato(),{wrapper});
 await act(async()=>{await expect(hook.result.current.mutateAsync({id:"request",stato:"approvata"})).rejects.toThrow("nessun saldo modificato");});
 expect(state.from).not.toHaveBeenCalled();expect(state.success).not.toHaveBeenCalled();
});
it("a server failure never appears as a successful office save",async()=>{
 state.rpc.mockResolvedValue({data:null,error:{message:"service unavailable"}});
 const hook=renderHook(()=>useSalvaUfficio("demo"),{wrapper});
 await act(async()=>{await expect(hook.result.current.mutateAsync({nome:"Tecnico",membri:[]})).rejects.toThrow("service unavailable");});
 expect(state.success).not.toHaveBeenCalled();
});
