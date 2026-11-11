import React from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state=vi.hoisted(()=>({auth:{} as any}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>state.auth}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string): any=>{
  const chain:any={};for(const method of ["select","eq","order"])chain[method]=():any=>chain;
  const result=():any=>({data:table==="automation_flows"?{id:"flow",company_id:"company",updated_at:"2026-11-11T00:00:00Z"}:[],error:null});
  chain.single=async():Promise<any>=>result();chain.then=(resolve:any):Promise<any>=>Promise.resolve(result()).then(resolve);return chain;
}}}));
import { useAutomationBuilder } from "@/hooks/useAutomationBuilder";
afterEach(cleanup);
function wrapper({children}:{children:React.ReactNode}){
  const [client]=React.useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}}));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
describe("automation remote-empty readiness",()=>{
  it("disabled tenant queries are unknown, not an empty saved graph", async()=>{
    state.auth={};const {result,rerender}=renderHook(()=>useAutomationBuilder("flow"),{wrapper});
    expect(result.current.isLoading).toBe(false);
    expect(result.current.remoteEmpty).toBe(false);
    state.auth={effectiveCompany:{id:"company"},user:{id:"user"}};rerender();
    await waitFor(()=>expect(result.current.flow?.id).toBe("flow"));
    await waitFor(()=>expect(result.current.remoteEmpty).toBe(true));
    expect(result.current.dbNodes).toEqual([]);expect(result.current.dbConnections).toEqual([]);
  });
});
