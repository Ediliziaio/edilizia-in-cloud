import { execFileSync, execFile } from "node:child_process";
import { createHmac } from "node:crypto";
export const fixture = process.env.EIC_PERMISSIONS_FIXTURE || "eic-history-10fd4bba52";
export const database = "audit_permissions";
export const companyId = "a0000000-0000-4000-a000-000000000001";
export const orderId = "d0000000-0000-4000-a000-000000000001";
export const actors = ["Tecnico", "Ufficio ordini", "Commerciale", "Amministrazione", "Responsabile commessa", "Operaio", "HR retribuzioni", "Amministratore", "Cliente portale", "Venditore CRM", "Call center", "Subappaltatore", "Magazzino limitato", "Sola lettura"];
const secret = "local-permissions-fixture-only-secret-20261111";
export function sql(query) {
  return execFileSync("docker", ["exec", "-i", fixture, "psql", "-X", "-U", "supabase_admin", "-d", database, "-v", "ON_ERROR_STOP=1", "-Atq"], { input: query, encoding: "utf8", maxBuffer: 8e6 });
}
export function assertLocalFixture() {
  const [meta] = JSON.parse(execFileSync("docker", ["inspect", fixture], { encoding: "utf8" }));
  if (meta.HostConfig.NetworkMode !== "none" || !meta.State.Running) throw new Error("Serve il fixture locale senza rete, avviato");
  if (sql("select count(*) from public.companies where name not like 'Laboratorio %'").trim() !== "0") throw new Error("Il laboratorio accetta soltanto aziende sintetiche");
}
export function userId(actor) {
  if (!Number.isInteger(actor) || actor < 1 || actor > actors.length) throw new Error("Profilo di laboratorio non valido");
  return `10000000-0000-4000-a000-${String(actor).padStart(12,"0")}`;
}
function jwt(actor) {
  const encode = x => Buffer.from(JSON.stringify(x)).toString("base64url");
  const body = encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ role: "authenticated", sub: userId(actor), exp: Math.floor(Date.now() / 1000) + 3600 });
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}
export function service(port, path, method = "GET", body, headers = {}) {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\n")) throw new Error("Percorso non valido");
  const args = ["exec", "-i", fixture, "curl", "--silent", "--show-error", "--max-time", "20", "--request", method, "--header", "Content-Type: application/json", "--write-out", "\n__LAB_STATUS__:%{http_code}"];
  args.push(method === "HEAD" ? "--head" : "--dump-header", ...(method === "HEAD" ? [] : ["-"]));
  for (const [name, value] of Object.entries(headers)) if (["prefer", "accept", "range", "range-unit", "authorization", "accept-profile", "content-profile", "x-client-info", "x-supabase-api-version"].includes(name.toLowerCase())) args.push("--header", `${name}: ${value}`);
  if (body !== undefined) args.push("--data-binary", "@-");
  args.push(`http://127.0.0.1:${port}` + path);
  const output = execFileSync("docker", args, { input: body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), encoding: "utf8", maxBuffer: 8e6 });
  const at = output.lastIndexOf("\n__LAB_STATUS__:");
  const raw = output.slice(0, at);
  const boundary = raw.indexOf("\r\n\r\n");
  const headerText = boundary >= 0 ? raw.slice(0, boundary) : raw;
  const text = method === "HEAD" ? "" : boundary >= 0 ? raw.slice(boundary + 4) : raw;
  const responseHeaders = {};
  for (const line of headerText.split(/\r?\n/)) { const colon=line.indexOf(":");if(colon>0){const key=line.slice(0,colon).toLowerCase();if(["content-range","range-unit","retry-after","location"].includes(key))responseHeaders[key]=line.slice(colon+1).trim();} }
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: Number(output.slice(at + "\n__LAB_STATUS__:".length)), data, headers: responseHeaders };
}
/** Async bridge for the browser: independent REST calls must not block the gateway. */
export async function serviceAsync(port,path,method="GET",body,headers={}) {
 if(!path.startsWith('/')||path.startsWith('//')||path.includes('\n'))throw new Error('Percorso non valido');
 const args=['exec','-i',fixture,'curl','--silent','--show-error','--max-time','20','--request',method,'--header','Content-Type: application/json','--write-out','\n__LAB_STATUS__:%{http_code}'];
 args.push(method==='HEAD'?'--head':'--dump-header',...(method==='HEAD'?[]:['-']));
 for(const[name,value]of Object.entries(headers))if(['prefer','accept','range','range-unit','authorization','accept-profile','content-profile','x-client-info','x-supabase-api-version'].includes(name.toLowerCase()))args.push('--header',`${name}: ${value}`);
 if(body!==undefined)args.push('--data-binary','@-');args.push(`http://127.0.0.1:${port}`+path);
 const output=await new Promise((resolve,reject)=>{const child=execFile('docker',args,{encoding:'utf8',maxBuffer:8e6,timeout:25000},(error,out)=>error?reject(error):resolve(out));child.stdin.on('error',()=>{});child.stdin.end(body===undefined?'':typeof body==='string'?body:JSON.stringify(body));});
 const at=output.lastIndexOf('\n__LAB_STATUS__:');const raw=output.slice(0,at);const boundary=raw.indexOf('\r\n\r\n');const header=boundary>=0?raw.slice(0,boundary):raw;const text=method==='HEAD'?'':boundary>=0?raw.slice(boundary+4):raw;let data;try{data=text?JSON.parse(text):null}catch{data=text}
 const responseHeaders={};for(const line of header.split(/\r?\n/)){const colon=line.indexOf(':');if(colon>0){const key=line.slice(0,colon).toLowerCase();if(['content-range','range-unit','retry-after','location'].includes(key))responseHeaders[key]=line.slice(colon+1).trim()}}
 return {status:Number(output.slice(at+'\n__LAB_STATUS__:'.length)),data,headers:responseHeaders};
}
export function rest(actor,path,method="GET",body,headers={}) {
  return service(3002,path,method,body,{...headers,Authorization:`Bearer ${jwt(actor)}`});
}
export const localActorToken = jwt;
/** Local binary bridge for actual Storage uploads/downloads, never JSON-encodes bytes. */
export function storageService(path,method='GET',body,headers={}) {
 if(!path.startsWith('/')||path.startsWith('//')||path.includes('\n'))throw new Error('Percorso non valido');
 const args=['exec','-i',fixture,'curl','--silent','--show-error','--max-time','20','--request',method,'--dump-header','-'];
 for(const[k,v]of Object.entries(headers))if(['authorization','content-type','x-upsert','cache-control','range','accept'].includes(k.toLowerCase()))args.push('--header',`${k}: ${v}`);
 if(body!==undefined)args.push('--data-binary','@-');args.push('http://127.0.0.1:5000'+path);
 const output=execFileSync('docker',args,{input:body??'',maxBuffer:8e6});let boundary=output.indexOf('\r\n\r\n');
 if(boundary<0)throw new Error('Risposta Storage non valida');
 let header=output.subarray(0,boundary).toString();let data=output.subarray(boundary+4);
 if(header.startsWith('HTTP/1.1 100 ')){boundary=data.indexOf('\r\n\r\n');header=data.subarray(0,boundary).toString();data=data.subarray(boundary+4)}
 const responseHeaders={};for(const line of header.split(/\r?\n/)){const at=line.indexOf(':');if(at>0){const k=line.slice(0,at).toLowerCase();if(['content-type','content-disposition','content-range','etag'].includes(k))responseHeaders[k]=line.slice(at+1).trim()}}
 return{status:Number(header.match(/^HTTP\/\S+ (\d+)/)?.[1]??500),headers:responseHeaders,body:data};
}
