import {useQuery,QueryClient} from "@tanstack/react-query";
import {PersistQueryClientProvider} from "@tanstack/react-query-persist-client";
import {act,cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),del:vi.fn()}));
vi.mock("idb-keyval",()=>db);
import {bindQueryCacheIdentity,createIdbPersister} from "@/lib/queryPersister";
beforeEach(()=>{vi.useFakeTimers();db.get.mockReset();db.del.mockReset();db.set.mockResolvedValue(undefined);bindQueryCacheIdentity("user");});
afterEach(()=>{cleanup();vi.useRealTimers();});
function Probe({load}:{load:()=>Promise<string>}){const{data}=useQuery({queryKey:["pagina-prova"],queryFn:load});return <output>{data??"in attesa"}</output>;}
async function prova(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});const load=vi.fn().mockResolvedValue("Dati caricati");
 render(<PersistQueryClientProvider client={client} persistOptions={{persister:createIdbPersister(()=>"user"),buster:"versione-nuova"}}><Probe load={load}/></PersistQueryClientProvider>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(0);});return load;
}
it("la rimozione bloccata di una cache vecchia non tiene in pausa tutte le pagine",async()=>{
 db.get.mockResolvedValue({owner:"user",client:{timestamp:Date.now(),buster:"versione-vecchia",clientState:{queries:[],mutations:[]}}});
 db.del.mockImplementation(()=>new Promise(()=>{}));const load=await prova();
 expect(load).not.toHaveBeenCalled();
 await act(async()=>{await vi.advanceTimersByTimeAsync(3001);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(load).toHaveBeenCalledOnce();expect(screen.getByText("Dati caricati")).toBeInTheDocument();
});
it("anche IndexedDB che non risponde in lettura lascia partire le richieste delle pagine",async()=>{
 db.get.mockImplementation(()=>new Promise(()=>{}));db.del.mockResolvedValue(undefined);const load=await prova();
 await act(async()=>{await vi.advanceTimersByTimeAsync(3001);});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 expect(load).toHaveBeenCalledOnce();
});
it("un errore nella rimozione della cache vecchia non espone la vecchia cache e non blocca i dati nuovi",async()=>{
 db.get.mockResolvedValue({owner:"user",client:{timestamp:Date.now(),buster:"versione-vecchia",clientState:{queries:[],mutations:[]}}});db.del.mockRejectedValue(Error("IndexedDB non disponibile"));
 const load=await prova();await act(async()=>{await vi.advanceTimersByTimeAsync(1);});expect(load).toHaveBeenCalledOnce();
});
