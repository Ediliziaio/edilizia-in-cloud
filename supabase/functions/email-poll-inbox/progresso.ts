export interface PollWindow {
  version: 1;
  connectionId: string;
  provider: "gmail" | "outlook";
  sinceMs: number;
  untilMs: number;
  inboxToken: string | null;
  sentToken: string | null;
  inboxDone: boolean;
  sentDone: boolean;
}

export function pollWindow(previous: unknown, connectionId: string, provider: "gmail" | "outlook",
  sinceMs: number, syncFromMs: number, now: number): PollWindow {
  const p=previous as PollWindow | undefined;
  const valid=p?.version===1&&p.connectionId===connectionId&&p.provider===provider
    &&Number.isFinite(p.sinceMs)&&Number.isFinite(p.untilMs)&&p.untilMs>p.sinceMs
    &&typeof p.inboxDone==="boolean"&&typeof p.sentDone==="boolean"
    &&(p.inboxToken===null||typeof p.inboxToken==="string")&&(p.sentToken===null||typeof p.sentToken==="string");
  if(valid&&(!p!.inboxDone||!p!.sentDone)) return {...p!};
  // last_synced_at is a scheduling timestamp and also advances on failures.
  // Only the end of a fully saved window is a trustworthy data watermark.
  const start=valid?Math.max(syncFromMs,p!.untilMs-30*60_000):sinceMs;
  return {version:1,connectionId,provider,sinceMs:start,untilMs:Math.max(now,start+1000),
    inboxToken:null,sentToken:null,inboxDone:false,sentDone:provider!=="gmail"};
}

export function validOutlookNextLink(value: string): boolean {
  try {
    const url=new URL(value);
    return url.origin==="https://graph.microsoft.com"&&!url.username&&!url.password
      &&/^\/v1\.0\/me\/mailFolders\/inbox\/messages$/i.test(url.pathname);
  } catch {return false;}
}

/** A rejected write must stop checkpointing, not silently advance the cursor. */
export async function saveEmailPage<T>(items: T[], save: (item:T)=>Promise<unknown>, batchSize=5): Promise<void> {
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>10)throw new Error("Invalid email batch size");
  for(let i=0;i<items.length;i+=batchSize){
    const results=await Promise.allSettled(items.slice(i,i+batchSize).map(item=>Promise.resolve().then(()=>save(item))));
    const failed=results.find((r):r is PromiseRejectedResult=>r.status==="rejected");
    if(failed) throw failed.reason;
  }
}

/** Native decoding where supported avoids a JS loop over every attachment byte. */
export function decodeMailBase64(value:string,urlSafe=false):Uint8Array {
  const s=urlSafe?value.replace(/-/g,"+").replace(/_/g,"/"):value;
  const padded=s.padEnd(s.length+((4-s.length%4)%4),"=");
  const native=(Uint8Array as unknown as {fromBase64?:(data:string)=>Uint8Array}).fromBase64;
  if(native)return native(padded);
  const binary=atob(padded);const out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}
