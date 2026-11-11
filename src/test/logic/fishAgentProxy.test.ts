import {describe,it,expect,vi,beforeEach} from "vitest";
const state=vi.hoisted(()=>({invoke:vi.fn(),refresh:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:(...args:any[])=>state.invoke(...args)},auth:{refreshSession:()=>state.refresh()}}}));
import {callFishAgent} from "@/lib/fishAgentProxy";
beforeEach(()=>{state.invoke.mockReset();state.refresh.mockReset();state.refresh.mockResolvedValue({error:null});});
describe("Fish management session renewal",()=>{
 it("renews an expired login once before retrying the same authorized action",async()=>{
  state.invoke.mockResolvedValueOnce({data:null,error:{context:new Response("Unauthorized",{status:401})}}).mockResolvedValueOnce({data:{ready:true},error:null});
  expect(await callFishAgent("company-a","agent-a","preview_session")).toEqual({ready:true});expect(state.refresh).toHaveBeenCalledOnce();expect(state.invoke).toHaveBeenCalledTimes(2);expect(state.invoke.mock.calls[0]).toEqual(state.invoke.mock.calls[1]);
 });
 it("does not repeat an ambiguous network or server failure",async()=>{
  state.invoke.mockResolvedValue({data:null,error:{context:new Response("upstream unavailable",{status:503})}});
  await expect(callFishAgent("company-a","agent-a","preview_session")).rejects.toThrow("Backend Fish");expect(state.invoke).toHaveBeenCalledOnce();expect(state.refresh).not.toHaveBeenCalled();
 });
 it("does not loop when session renewal fails",async()=>{
  state.invoke.mockResolvedValue({data:null,error:{context:new Response("Unauthorized",{status:401})}});state.refresh.mockResolvedValue({error:new Error("expired")});
  await expect(callFishAgent("company-a","agent-a","status")).rejects.toThrow("Accedi di nuovo");expect(state.invoke).toHaveBeenCalledOnce();expect(state.refresh).toHaveBeenCalledOnce();
 });
});
