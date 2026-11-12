/** Real Edge handlers with only the model transport substituted. Local synthetic DB only. */
import http from 'node:http';
import {createHmac} from 'node:crypto';
import {symlink} from 'node:fs/promises';
import {assertLocalFixture} from '../backend.mjs';
assertLocalFixture();
const jwt=role=>{const e=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const b=e({alg:'HS256',typ:'JWT'})+'.'+e({role,exp:4102444800});return b+'.'+createHmac('sha256','local-permissions-fixture-only-secret-20261111').update(b).digest('base64url')};
const env={SUPABASE_URL:'http://127.0.0.1:5189',SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),ENABLE_COUNCIL_AUTO_DELEGATE:'false',SILVIO_TOOL_DOMAIN_FILTER_DISABLED:'true'};
globalThis.Deno={env:{get:key=>env[key]}};
globalThis.EdgeRuntime={waitUntil:p=>p.catch(e=>console.error('Local background:',e.message))};
const originalFetch=globalThis.fetch;
globalThis.fetch=(url,init)=>{const u=new URL(typeof url==='string'?url:url.url??String(url));if(u.origin!=='http://127.0.0.1:5189')throw new Error('External network disabled in local chat test');return originalFetch(url,init)};
try{await symlink(process.cwd()+'/node_modules','/tmp/eic-silvio-chat-runtime/node_modules')}catch(e){if(e.code!=='EEXIST')throw e}
const chat=(await import('/tmp/eic-silvio-chat-runtime/chat.mjs')).default;
const action=(await import('/tmp/eic-silvio-chat-runtime/action.mjs')).default;
http.createServer(async(req,res)=>{try{const handler=req.url==='/silvio-chat'?chat:req.url==='/silvio-execute-action'?action:null;if(!handler){res.writeHead(404).end();return}const chunks=[];for await(const c of req)chunks.push(c);const response=await handler(new Request('http://127.0.0.1:5191'+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch(e){console.error(e);res.writeHead(500).end(JSON.stringify({error:e.message}))}}).listen(5191,'127.0.0.1',()=>console.log('Real chat/action handlers, SIMULATED model, local data: 5191'));
