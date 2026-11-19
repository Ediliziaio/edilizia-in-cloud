import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const auth=vi.hoisted(()=>({getSession:vi.fn(),cache:{accessToken:"cached-token" as string|null,refreshToken:null as string|null}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{id:"u"}}),getCachedTokens:()=>auth.cache}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:auth.getSession}}}));
import {richiestaPipelineLocale} from "@/lib/orders/pipelineLocali";
beforeEach(()=>{auth.cache.accessToken="cached-token";auth.getSession.mockReset();vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({pipeline:[] as never[]})}));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe("pipeline senza attese indefinite sulla sessione",()=>{
 it("usa il token degli eventi auth senza acquisire nuovamente il lock",async()=>{
  await richiestaPipelineLocale("azienda");expect(auth.getSession).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({headers:expect.objectContaining({Authorization:"Bearer cached-token"}),signal:expect.any(AbortSignal)}));
 });
 it("al primo accesso recupera la sessione solo se manca il token",async()=>{
  auth.cache.accessToken=null;auth.getSession.mockResolvedValue({data:{session:{access_token:"initial-token"}}});await richiestaPipelineLocale("azienda");expect(auth.getSession).toHaveBeenCalledOnce();
 });
 it("una sessione bloccata non trattiene la richiesta per sempre",async()=>{
  vi.useFakeTimers();auth.cache.accessToken=null;auth.getSession.mockReturnValue(new Promise(()=>{}));const request=richiestaPipelineLocale("azienda");const check=expect(request).rejects.toThrow("Verifica sessione pipeline: timeout");await vi.advanceTimersByTimeAsync(5000);await check;expect(fetch).not.toHaveBeenCalled();
 });
 it("senza sessione non invia richieste anonime",async()=>{
  auth.cache.accessToken=null;auth.getSession.mockResolvedValue({data:{session:null}});await expect(richiestaPipelineLocale("azienda")).rejects.toThrow("Accedi");expect(fetch).not.toHaveBeenCalled();
 });
});
