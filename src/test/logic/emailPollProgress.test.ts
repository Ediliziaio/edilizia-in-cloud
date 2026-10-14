import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as progress from "../../../supabase/functions/email-poll-inbox/progresso";
import { LIMITI_POLL,fermaIlGiro } from "../../../supabase/functions/email-poll-inbox/limiti";
import { scegliUidPolling,imapScaricaNuovi } from "../../../supabase/functions/_shared/imapSmtpClient";
import { emailSyncPending } from "../../../src/lib/email/syncPending";

const initial=()=>progress.pollWindow(undefined,"conn","gmail",1000,0,100_000);
describe("bounded email pages and durable progress",()=>{
  it("the UI distinguishes completed, pending and legacy responses",()=>{
    expect(emailSyncPending({pending_windows:1})).toBe(true);
    expect(emailSyncPending({budget_esaurito:true})).toBe(true);
    expect(emailSyncPending({pending_windows:0,budget_esaurito:false})).toBe(false);
    expect(emailSyncPending({emails_stored:2})).toBe(false);
    expect(emailSyncPending(null)).toBe(false);
  });
  it("keeps both independent page tokens and the anchor after scheduling advances",()=>{
    const old={...initial(),inboxToken:"page-2",sentToken:"sent-2"};
    expect(progress.pollWindow(old,"conn","gmail",999_000,0,1000_000)).toEqual(old);
  });
  it("only a fully saved window advances the data watermark",()=>{
    const done={...initial(),inboxDone:true,sentDone:true,untilMs:3_600_000};
    const next=progress.pollWindow(done,"conn","gmail",999_000,0,7_200_000);
    expect(next.sinceMs).toBe(1_800_000);expect(next.inboxToken).toBeNull();expect(next.inboxDone).toBe(false);
  });
  it("does not reuse another account/provider's tokens",()=>{
    expect(progress.pollWindow(initial(),"other","gmail",2000,0,100_000).sinceMs).toBe(2000);
    expect(progress.pollWindow(initial(),"conn","outlook",2000,0,100_000).sentDone).toBe(true);
  });
  it.each(["https://evil.test/v1.0/me/mailFolders/inbox/messages","http://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages",
    "https://graph.microsoft.com:9443/v1.0/me/mailFolders/inbox/messages","https://graph.microsoft.com/v1.0/users/other/messages"])("rejects an unsafe continuation %s",url=>{
    expect(progress.validOutlookNextLink(url)).toBe(false);
  });
  it("allows Microsoft Graph's scoped continuation URL",()=>{
    expect(progress.validOutlookNextLink("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=abc")).toBe(true);
  });
  it("does not silently ignore failed writes or start another batch",async()=>{
    const save=vi.fn(async(n:number)=>{if(n===2)throw new Error("write failed")});
    await expect(progress.saveEmailPage([0,1,2,3,4,5,6],save)).rejects.toThrow("write failed");
    expect(save).toHaveBeenCalledTimes(5);
  });
  it("also catches a synchronous write failure",async()=>{
    await expect(progress.saveEmailPage([1],()=>{throw new Error("sync failure")})).rejects.toThrow("sync failure");
  });
  it("decodes URL-safe base64 including accented UTF-8",()=>{
    const text="Città, qualità e €";const encoded=Buffer.from(text).toString("base64url");
    expect(new TextDecoder().decode(progress.decodeMailBase64(encoded,true))).toBe(text);
  });
  it("IMAP saves an oldest-first prefix before advancing its UID watermark",()=>{
    const ids=["9","2","8","1","7","3"];
    expect(scegliUidPolling(ids,3,"cursore")).toEqual(["1","2","3"]);
    expect(scegliUidPolling(ids.filter(id=>Number(id)>3),3,"cursore")).toEqual(["7","8","9"]);
    expect(scegliUidPolling(ids,3)).toEqual(["1","7","3"]); // Other callers retain their behavior.
  });
});

/** Execute the REAL handler with fake DB/providers, not a rewritten model. */
type OfflineResult={data:unknown;error:{message:string}|null};
function poller(failMessage?:string,provider:"gmail"|"outlook"="gmail"){
  const conn:any={id:"conn",company_id:"company",user_id:"user",provider,email_address:"demo@example.test",
    sync_from_date:"2026-10-01T00:00:00Z",last_synced_at:null,provider_metadata:{keep:"untouched"}};
  const rows=new Map<string,any>();const queries:URL[]=[];let fail=failMessage;
  const db={from:(table:string)=>{
    let op="read",payload:any=null;const filters:[string,unknown][]=[];
    const exec=():OfflineResult=>{
      if(table==="email_oauth_connections"){
        if(op==="update")Object.assign(conn,payload);
        return {data:conn,error:null};
      }
      if(table==="email_inbox"){
        const existing=[...rows.values()].find(row=>filters.every(([k,v])=>row[k]===v));
        if(op==="read")return {data:existing??null,error:null};
        if(payload?.provider_message_id===fail)return {data:null,error:{message:"injected write failure"}};
        if(op==="insert"){const row={id:payload.provider_message_id,...payload};rows.set(row.message_id,row);return {data:row,error:null}}
        if(op==="update"&&existing)Object.assign(existing,payload);
        return {data:existing??null,error:null};
      }
      return {data:[],error:null};
    };
    const q:any={select:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q},is:()=>q,in:()=>q,limit:()=>q,order:()=>q,
      update:(v:any)=>{op="update";payload=v;return q},insert:(v:any)=>{op="insert";payload=v;return q},
      maybeSingle:async()=>exec(),then:(resolve:(v:any)=>void)=>resolve(exec())};return q;
  },rpc:async(name:string,p:any):Promise<OfflineResult>=>{
    if(name==="email_oauth_list_due_for_poll")return {data:[conn],error:null};
    if(name==="email_oauth_get_decrypted_tokens")return {data:[{...conn,access_token:"fake-token",expires_at:"2099-01-01T00:00:00Z"}],error:null};
    if(name==="email_oauth_mark_sync"){conn.last_synced_at=new Date().toISOString();if(p.p_provider_metadata)conn.provider_metadata=p.p_provider_metadata;return {data:null,error:null}}
    return {data:null,error:null};
  }};
  let handler!:(r:Request)=>Promise<Response>;
  const fetchFake=async(input:string|URL|Request)=>{
    const url=new URL(String(input));
    if(url.hostname==="graph.microsoft.com"){
      queries.push(url);
      const next=url.searchParams.has("$skiptoken");
      return Response.json({value:Array.from({length:next?1:20},(_,i)=>({id:"o"+(next?20:i),internetMessageId:"o"+(next?20:i),receivedDateTime:new Date().toISOString(),subject:"Test",bodyPreview:"body",from:{emailAddress:{address:"sender@example.test"}}})),
        ...(!next?{"@odata.nextLink":"https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skiptoken=next"}:{})});
    }
    if(url.hostname!=="gmail.googleapis.com")return Response.json({});
    queries.push(url);
    if(url.pathname.endsWith("/messages")){
      const q=url.searchParams.get("q")??"";
      if(q.includes("in:sent")||q.includes("is:unread"))return Response.json({messages:[]});
      if(url.searchParams.get("maxResults")==="5")return Response.json({messages:[{id:"hot"}]});
      if(url.searchParams.get("pageToken")==="page-2")return Response.json({messages:[{id:"m20"}]});
      return Response.json({messages:Array.from({length:20},(_,i)=>({id:"m"+i})),nextPageToken:"page-2"});
    }
    const id=url.pathname.split("/").at(-1)!;
    return Response.json({id,internalDate:String(Date.now()),payload:{headers:[{name:"Message-ID",value:id},{name:"From",value:"sender@example.test"}],body:{data:Buffer.from("Test body").toString("base64url")}}});
  };
  const requireFake=(name:string)=>{
    if(name.includes("supabase-js"))return {createClient:()=>db};
    if(name==="./progresso.ts")return progress;
    if(name==="./limiti.ts")return {LIMITI_POLL,fermaIlGiro};
    if(name.includes("withMetricsRapida"))return {serveConMetricheRapida:(_n:string,h:typeof handler)=>{handler=h}};
    if(name.includes("headers"))return {getCorsHeaders:()=>({})};
    if(name.includes("emailRicevutaEvento"))return {emettiEmailRicevuta:async()=>{}};
    return {};
  };
  const code=ts.transpileModule(readFileSync("supabase/functions/email-poll-inbox/index.ts","utf8"),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const deno={env:{get:(key:string)=>({SUPABASE_URL:"https://fake.example.test",SUPABASE_SERVICE_ROLE_KEY:"fake-service"} as Record<string,string>)[key]}};
  new Function("require","exports","Deno","fetch",code)(requireFake,{},deno,fetchFake);
  return {conn,rows,queries,clearFailure:()=>{fail=undefined},run:()=>handler(new Request("https://fake.example.test/poll",{method:"POST",headers:{Authorization:"Bearer fake-service","Content-Type":"application/json"},body:"{}"}))};
}

describe("real email handler with offline providers",()=>{
  it("Outlook also saves a bounded page and resumes its own provider continuation",async()=>{
    const p=poller(undefined,"outlook");expect((await p.run()).status).toBe(200);expect(p.rows.size).toBe(20);
    expect(p.conn.provider_metadata.eic_poll_window.inboxToken).toContain("$skiptoken=next");
    expect((await p.run()).status).toBe(200);expect(p.rows.size).toBe(21);
    expect(p.conn.provider_metadata.eic_poll_window.inboxDone).toBe(true);
  });
  it("a tampered Outlook cursor cannot send credentials to another host",async()=>{
    const p=poller(undefined,"outlook");await p.run();p.queries.length=0;
    p.conn.provider_metadata.eic_poll_window.inboxToken="https://evil.test/steal";
    expect((await p.run()).status).toBe(502);expect(p.queries).toHaveLength(0);
  });
  it("saves one page then continues from its token without dropping the tail",async()=>{
    const p=poller();const first=await p.run();expect(first.status).toBe(200);
    expect((await first.json()).pending_windows).toBe(1);expect(p.rows.size).toBe(20);
    const anchor=p.conn.provider_metadata.eic_poll_window.untilMs;
    const second=await p.run();expect(second.status).toBe(200);expect(p.rows.size).toBe(21);
    expect(p.conn.provider_metadata.eic_poll_window.untilMs).toBe(anchor);
    expect(p.conn.provider_metadata.eic_poll_window.inboxDone).toBe(true);
    expect(p.conn.provider_metadata.keep).toBe("untouched");
  });
  it("failed storage does not checkpoint an incomplete page, even though last_synced_at advances",async()=>{
    const p=poller("m2");expect((await p.run()).status).toBe(502);
    expect(p.conn.provider_metadata.eic_poll_window.inboxToken).toBeNull();
    const anchor=p.conn.provider_metadata.eic_poll_window.sinceMs;
    p.clearFailure();expect((await p.run()).status).toBe(200);
    expect(p.conn.provider_metadata.eic_poll_window.sinceMs).toBe(anchor);
    expect(p.rows.size).toBe(20);expect(p.conn.provider_metadata.eic_poll_window.inboxToken).toBe("page-2");
  });
  it("a historical continuation also fetches recent mail without moving its original window",async()=>{
    const p=poller();await p.run();const anchor=p.conn.provider_metadata.eic_poll_window.untilMs;
    p.conn.provider_metadata.eic_poll_window.untilMs=anchor-120_000;
    await p.run();expect(p.rows.has("hot")).toBe(true);expect(p.rows.has("m20")).toBe(true);
    expect(p.conn.provider_metadata.eic_poll_window.untilMs).toBe(anchor-120_000);
  });
});

describe("IMAP protocol cursor cannot silently skip failed fetches",()=>{
  function server(missing:string){
    const frames=["* OK test server\r\n"];let closed=false;
    const conn={close:()=>{closed=true},write:async(bytes:Uint8Array)=>{
      const command=new TextDecoder().decode(bytes);const tag=command.split(" ")[0];
      if(command.includes("UID SEARCH"))frames.push(`* SEARCH 1 2 3 4 5 6\r\n${tag} OK done\r\n`);
      else if(command.includes("UID FETCH")){
        const uid=command.match(/UID FETCH (\d+)/)![1];
        if(uid===missing)frames.push(`${tag} NO unavailable\r\n`);
        else {
          const body="From: sender@example.test\r\nMessage-ID: <m"+uid+">\r\nSubject: Test\r\n\r\nBody";
          frames.push(`* 1 FETCH (UID ${uid} BODY[] {${new TextEncoder().encode(body).length}}\r\n${body}\r\n)\r\n${tag} OK done\r\n`);
        }
      }else frames.push(`${tag} OK done\r\n`);
      return bytes.length;
    },read:async(buffer:Uint8Array)=>{const bytes=new TextEncoder().encode(frames.shift()!);buffer.set(bytes);return bytes.length}};
    vi.stubGlobal("Deno",{connectTls:async()=>conn,connect:async()=>conn});
    return {closed:()=>closed};
  }
  const config={host:"offline.test",port:993,secure:true,username:"test",password:"fake"};
  it("cursor ingestion stops rather than advancing over an unavailable UID",async()=>{
    const s=server("2");
    try {await expect(imapScaricaNuovi(config,new Date(),3,null,true,undefined,"cursore")).rejects.toThrow("imap_message_incomplete");expect(s.closed()).toBe(true)}
    finally {vi.unstubAllGlobals();}
  });
  it("other IMAP callers retain the existing recent-head behavior",async()=>{
    server("5");
    try {expect((await imapScaricaNuovi(config,new Date(),3,null,true)).map(m=>m.uid)).toEqual(["4","6"])}
    finally {vi.unstubAllGlobals();}
  });
});
