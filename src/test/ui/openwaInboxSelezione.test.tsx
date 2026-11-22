import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Inbox from "@/pages/admin/marketing/AdminWhatsappLocaleInbox";

const db=vi.hoisted(()=>({read:false,richieste:[] as unknown[],aggiornamenti:[] as string[]}));
vi.mock("@/hooks/usePushNotifications",()=>({usePushNotifications:()=>({supported:false,isSubscribed:false,isLoading:false})}));
vi.mock("@/components/admin/whatsapp-locale/IdentitaThread",()=>({default:():null=>null}));
vi.mock("@/components/admin/whatsapp-locale/PannelloChat",()=>({default:():null=>null}));
vi.mock("@/components/admin/whatsapp-locale/RisposteRapide",()=>({default:():null=>null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{
  rpc:async (_name:string,p:{p_solo_non_letti?:boolean})=>{
    db.richieste.push(p);
    return {data:db.read&&p.p_solo_non_letti?[]:[{wa_chat_id:"prova@c.us",contact_name:"Conversazione sintetica",contact_phone:"000",ultimo_at:"2026-11-22T10:00:00Z",ultimo_testo:"Messaggio locale",non_letti:db.read?0:1,totale:1,stato:"aperta"}],error:null as null};
  },
  from:(table:string)=>{
    let update=false;const filters=new Map<string,unknown>();
    const q={select:()=>q,update:()=>{update=true;return q;},eq:(k:string,v:unknown)=>{filters.set(k,v);return q;},is:()=>q,order:()=>q,limit:()=>q,
      then:(ok:(value:unknown)=>unknown)=>{
        if(update){db.read=true;db.aggiornamenti.push(String(filters.get("wa_chat_id")));}
        return Promise.resolve({data:table==="openwa_numbers"?[]:update?[]:[{id:"m1",wa_chat_id:"prova@c.us",direction:"inbound",body:"Messaggio locale",created_at:"2026-11-22T10:00:00Z",read_at:db.read?"oggi":null}],error:null}).then(ok);
      }};return q;
  },
  channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn(),
  functions:{invoke:()=>{throw Error("Il collaudo non deve inviare messaggi");}},
}}));

function apri(url="/admin/marketing/whatsapp-locale"){
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Inbox/></MemoryRouter></QueryClientProvider>);
}
beforeEach(()=>{db.read=false;db.richieste=[];db.aggiornamenti=[];});
describe("selezione inbox senza riferimenti modificati durante il render",()=>{
  it("mantiene aperta la chat quando segnandola letta scompare dall'elenco dei non letti",async()=>{
    apri();
    await screen.findByRole("button",{name:/Conversazione sintetica/});
    fireEvent.click(screen.getByRole("button",{name:/Da leggere/}));
    fireEvent.click(await screen.findByRole("button",{name:/Conversazione sintetica/}));
    await waitFor(()=>expect(db.aggiornamenti).toEqual(["prova@c.us"]));
    await screen.findByText(/Nessuna conversazione/);
    expect(screen.getByText("Conversazione sintetica")).toBeInTheDocument();
    expect(screen.queryByText("Seleziona una conversazione")).toBeNull();
  });
  it("un collegamento diretto carica subito anche le chat chiuse e conserva la scelta sui filtri",async()=>{
    apri("/admin/marketing/whatsapp-locale?chat=prova%40c.us");
    await screen.findByRole("button",{name:/Conversazione sintetica/});
    expect(db.richieste[0] as Record<string,unknown>).toMatchObject({p_stato:"tutte"});
    fireEvent.click(screen.getByRole("button",{name:"Chiuse"}));
    await waitFor(()=>expect(db.richieste.at(-1) as Record<string,unknown>).toMatchObject({p_stato:"chiusa"}));
    expect(screen.getByRole("link",{name:"000"})).toHaveAttribute("href","tel:000");
  });
});
