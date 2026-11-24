export async function ok(p){const{data,error}=await p;if(error)throw Error(error.message);return data;}
export function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
export const stableJson=value=>JSON.stringify(stable(value));
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
export async function localPost(ctx,area,route,body,signal){
 // Fixed loopback destination, caller's in-memory session, no URL supplied by a document.
 const r=await fetch(`http://127.0.0.1:8081/api/gare-${area}/${route}`,{method:'POST',headers:{Authorization:`Bearer ${ctx.token}`,'X-Gare-Proxy-Key':ctx.config.proxySecret,'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Operazione locale non riuscita');return data;
}
