import {automationWebhookUrl} from './automationWebhook.ts';

function ipv4(raw:string):number|null {
 const p=raw.split('.');if(p.length!==4||p.some(x=>!/^\d{1,3}$/.test(x)||Number(x)>255))return null;
 return p.reduce((n,x)=>n*256+Number(x),0);
}
function publicAddress(ip:string):boolean {
 const n=ipv4(ip);if(n!==null){const [a,b,c]=ip.split('.').map(Number);return !([0,10,127].includes(a)||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 // DNS may return IPv6: accept global unicast only, never mapped IPv4 or local/link-local.
 return /^[23][a-f0-9]{3}:/i.test(ip)&&!/^2001:db8:/i.test(ip);
}
export async function globalWebhookTarget(raw:string,resolve:(host:string,type:'A'|'AAAA')=>Promise<string[]>,allowed:string[]=[]):Promise<URL>{
 const url=automationWebhookUrl(raw);if(url.protocol!=='https:')throw new Error('Il webhook richiede HTTPS');
 const literal=ipv4(url.hostname);let ips:string[];
 if(literal!==null)ips=[url.hostname];else {const r=await Promise.allSettled([resolve(url.hostname,'A'),resolve(url.hostname,'AAAA')]);ips=r.flatMap(x=>x.status==='fulfilled'?x.value:[]);}
 if(!ips.length||ips.some(ip=>!publicAddress(ip)))throw new Error('Destinazione DNS non pubblica o non disponibile');
 if(allowed.length&&ips.some(ip=>!allowed.some(rule=>{
  if(rule===ip)return true;const [base,prefix]=rule.split('/');const a=ipv4(ip),b=ipv4(base),bits=Number(prefix);
  return prefix!==undefined&&a!==null&&b!==null&&Number.isInteger(bits)&&bits>=0&&bits<=32&&Math.floor(a/2**(32-bits))===Math.floor(b/2**(32-bits));
 })))throw new Error('La destinazione non rispetta gli IP consentiti');
 return url;
}
export type GlobalDelivery={id:string;event_type:string;payload:unknown;event_id?:string;occurred_at?:string;url:string;secret?:string|null;timeout_seconds?:number;allowed_ips?:string[];lease_token?:string};
export async function deliverGlobalWebhook(delivery:GlobalDelivery,fetcher:typeof fetch=fetch,resolve:(host:string,type:'A'|'AAAA')=>Promise<string[]>=(h,t)=>Deno.resolveDns(h,t,{signal:AbortSignal.timeout(3000)})){
 const started=Date.now();try{
  const url=await globalWebhookTarget(delivery.url,resolve,delivery.allowed_ips??[]);
  const timestamp=delivery.occurred_at??new Date().toISOString();const eventId=delivery.event_id??delivery.id;
  const body=JSON.stringify({id:eventId,event:delivery.event_type,timestamp,data:delivery.payload});
  const deliveryTime=new Date().toISOString();
  const headers:Record<string,string>={'Content-Type':'application/json','X-Webhook-ID':eventId,'X-Webhook-Event':delivery.event_type,'X-Webhook-Timestamp':deliveryTime,'User-Agent':'EdiliziaInCloud-Webhook/1.0'};
  if(delivery.secret){
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(delivery.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const sign=async(value:string)=>'sha256='+Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
   headers['X-Webhook-Signature']=await sign(body); // Existing integrations keep their signature contract.
   headers['X-Webhook-Signature-V2']=await sign(deliveryTime+'.'+body);
  }
  const response=await fetcher(url,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(Math.max(3,Math.min(15,delivery.timeout_seconds??15))*1000)});
  // Never persist an arbitrary receiver response: it can echo credentials or personal data.
  await response.body?.cancel();return {status:response.ok?'success':'failed',http_status:response.status,response_body:`HTTP ${response.status}`,duration_ms:Date.now()-started};
 }catch{return {status:'failed',http_status:null,response_body:'Consegna non riuscita: verifica URL, DNS, IP consentiti e timeout',duration_ms:Date.now()-started};}
}
