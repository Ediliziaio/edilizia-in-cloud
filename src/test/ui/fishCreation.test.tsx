import { renderHook,act,cleanup } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const state=vi.hoisted(()=>({inserted:[] as any[],filters:[] as any[],duplicate:false,fish:vi.fn(),eleven:vi.fn(),requireEleven:vi.fn()}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"company-a"}));
vi.mock("@/lib/fishAgentProxy",()=>({callFishAgent:(...args:any[])=>state.fish(...args)}));
vi.mock("@/modules/ai-agents/hooks/useElevenLabsProxy",()=>({callElevenLabsProxy:(...args:any[])=>state.eleven(...args),requireAgentProxyV2:(...args:any[])=>state.requireEleven(...args)}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:"user-a"}}})},from:()=>{let inserting=false;const q:any={insert:(v:any)=>{inserting=true;state.inserted.push(v);return q;},select:()=>q,eq:(...args:any[])=>{state.filters.push(args);return q;},single:async()=>inserting && state.duplicate?{data:null as {id: string} | null,error:{code:"23505"}}:{data:{id:"draft-a"},error:null}};return q;}}}));
import { useCreateUnifiedAgent } from "@/hooks/useUnifiedAgents";
import { fishOnboardingInput } from "@/lib/fishOnboarding";
const input=()=>({...fishOnboardingInput({name:"Centralino aziendale",flowId:"appointment",calendarId:"calendar-a",operatorNumber:"+39 (02) 123-4567",greeting:"Buongiorno, sono un assistente virtuale.",expressive:true}),client_id:"11111111-1111-4111-8111-111111111111"});
const mount=()=>renderHook(()=>useCreateUnifiedAgent(),{wrapper:({children})=><QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>});
beforeEach(()=>{state.inserted=[];state.filters=[];state.duplicate=false;vi.clearAllMocks();state.fish.mockResolvedValue({success:true});state.eleven.mockResolvedValue({});state.requireEleven.mockResolvedValue(undefined);});
afterEach(cleanup);
describe("Direct Fish creation",()=>{
 it("creates a scoped Fish draft and never calls ElevenLabs",async()=>{
  const {result}=mount();await act(async()=>{await result.current.mutateAsync(input());});
  expect(state.inserted[0]).toMatchObject({id:input().client_id,company_id:"company-a",stato:"bozza",elevenlabs_agent_id:null,tools_config:{voice_provider:"fish_audio",fish:{calendar_id:"calendar-a"},trasferimento:{numero:"+39021234567"}}});
  expect(state.fish).toHaveBeenCalledWith("company-a","draft-a","configure",expect.objectContaining({voice_id:expect.any(String)}));expect(state.eleven).not.toHaveBeenCalled();expect(state.requireEleven).not.toHaveBeenCalled();
 });
 it("retains the draft when Fish is unavailable",async()=>{
  state.fish.mockRejectedValue(new Error("upstream unavailable"));const {result}=mount();let draft:any;
  await act(async()=>{draft=await result.current.mutateAsync(input());});expect(draft.id).toBe("draft-a");expect(state.inserted).toHaveLength(1);expect(state.eleven).not.toHaveBeenCalled();
 });
 it("recovers a duplicate creation nonce only in the current company",async()=>{
  state.duplicate=true;const {result}=mount();await act(async()=>{await result.current.mutateAsync(input());});
  expect(state.inserted).toHaveLength(1);expect(state.filters).toContainEqual(["company_id","company-a"]);expect(state.filters).toContainEqual(["id",input().client_id]);
 });
 it("preserves the legacy provider path for existing non-Fish creation",async()=>{
  const {result}=mount();await act(async()=>{await result.current.mutateAsync({nome:"Legacy",tipo:"vocale",system_prompt:"Istruzioni sufficientemente lunghe per un agente vocale."});});
  expect(state.eleven).toHaveBeenCalledOnce();expect(state.fish).not.toHaveBeenCalled();
 });
});
