import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,renderHook,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {createElement,type PropsWithChildren} from "react";
const auth=vi.hoisted(()=>({getSession:vi.fn(),cache:{accessToken:"cached-token" as string|null,refreshToken:null as string|null}}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({user:{id:"u"}}),getCachedTokens:()=>auth.cache}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{auth:{getSession:auth.getSession}}}));
import {richiestaPipelineLocale,usePipelineLocali} from "@/lib/orders/pipelineLocali";
beforeEach(()=>{auth.cache.accessToken="cached-token";auth.getSession.mockReset();vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({pipeline:[] as never[]})}));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
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

it("mantiene l'ultima pipeline se l'aggiornamento fallisce e permette di riprovare", async () => {
  const iniziale = [{ id: "ristrutturazioni", nome: "Ristrutturazioni", fasi: [] }];
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ pipeline: iniziale, fasiPerCommessa: {} })));
  const client = new QueryClient();
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(() => usePipelineLocali("azienda"), { wrapper });
  await waitFor(() => expect(result.current.pipeline).toEqual(iniziale));
  expect(result.current.errore).toBeUndefined();

  vi.mocked(fetch).mockRejectedValue(new Error("Errore di rete"));
  await result.current.riprova();
  await waitFor(() => expect(result.current.aggiornamentoFallito).toBe(true));
  expect(result.current.errore).toBeUndefined();
  expect(result.current.pipeline).toEqual(iniziale);

  const pipeline = [{ ...iniziale[0], nome: "Cantieri" }];
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ pipeline, fasiPerCommessa: {} })));
  await result.current.riprova();
  await waitFor(() => expect(result.current.pipeline).toEqual(pipeline));
  expect(result.current.aggiornamentoFallito).toBe(false);
  client.clear();
});
