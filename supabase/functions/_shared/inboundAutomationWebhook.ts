const UUID=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const RESERVED=new Set(['company_id','legacy_events','custom_field_flow_path','test_mode','dry_run','manual_flow_id','_webhook_flow_id','webhook_endpoint_id','__proto__','constructor','prototype']);
export async function hashWebhookSecret(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
export function newWebhookSecret():string{return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
function pathParts(path:unknown):string[]{if(typeof path!=='string'||path.length>240)throw Error('Percorso non valido');const p=path.split('.');if(p.length>8||p.some(s=>!s||RESERVED.has(s)||!/^[a-zA-Z0-9_-]+$/.test(s)))throw Error('Percorso non valido');return p;}
export function validateInboundMapping(value:any){
 if(!value||!['contact','opportunity'].includes(value.entity_type))throw Error('Scegli contatto o opportunità');
 if((value.entity_mode??'existing_id')==='contact_upsert'){
  if(value.entity_type!=='contact'||!value.contact_fields||typeof value.contact_fields!=='object'||Array.isArray(value.contact_fields))throw Error('Mappa contatto non valida');
  if(!value.contact_fields.email&&!value.contact_fields.phone)throw Error('Mappa almeno email o telefono');
  for(const [key,path] of Object.entries(value.contact_fields)){if(!['email','phone','first_name','last_name'].includes(key))throw Error('Campo contatto non consentito');pathParts(path);}
 }else if((value.entity_mode??'existing_id')==='existing_id')pathParts(value.entity_id_path);else throw Error('Modalità di identificazione non valida');
 if(!value.payload_paths||typeof value.payload_paths!=='object'||Array.isArray(value.payload_paths)||Object.keys(value.payload_paths).length>32)throw Error('Mappa payload non valida');
 for(const [key,path] of Object.entries(value.payload_paths)){if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)||RESERVED.has(key))throw Error('Nome payload riservato o non valido');pathParts(path);}
 return value;
}
export function mapInboundPayload(mapping:any,body:unknown):{entityId:string|null;payload:Record<string,unknown>;contact?:Record<string,string>}{
 validateInboundMapping(mapping);
 const get=(path:unknown)=>pathParts(path).reduce<unknown>((v,k)=>v&&typeof v==='object'&&Object.hasOwn(v,k)?(v as Record<string,unknown>)[k]:undefined,body);
 let id:string|null=null;let contact:Record<string,string>|undefined;
 if(mapping.entity_mode==='contact_upsert'){
  contact={};for(const [key,path] of Object.entries(mapping.contact_fields)){const raw=get(path);if(raw==null||raw==='')continue;if(typeof raw!=='string')throw Error('I campi contatto devono essere stringhe');let value=raw.trim();if(key==='email')value=value.toLowerCase();if(key==='phone')value=value.replace(/[\s().-]/g,'').replace(/^00/,'+');if(key==='email'&&(value.length>254||!/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(value)))throw Error('Email non valida');if(key==='phone'&&!/^[+][1-9][0-9]{7,14}$/.test(value))throw Error('Telefono richiesto in formato internazionale, es. +393331234567');if(['first_name','last_name'].includes(key)&&value.length>100)throw Error('Nome o cognome troppo lungo');contact[key]=value;}
  if(!contact.email&&!contact.phone)throw Error('Serve email o telefono per identificare il contatto');
 }else{const found=get(mapping.entity_id_path);if(typeof found!=='string'||!UUID.test(found))throw Error('Manca un ID record UUID valido nel percorso configurato');id=found.toLowerCase();}
 const payload:Record<string,unknown>={};for(const [key,path] of Object.entries(mapping.payload_paths)){const value=get(path);if(value!==undefined)payload[key]=value;}
 return {entityId:id,payload,...(contact?{contact}:{})};
}
async function limitedJson(req:Request){
 const reader=req.body?.getReader();if(!reader)throw Error('Corpo JSON richiesto');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('Corpo oltre 64 KB');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}const raw=new TextDecoder().decode(bytes);const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Serve un oggetto JSON');return{data,raw};
}
export function inboundWebhookHandler(db:any,cors:(r:Request)=>Record<string,string>=()=>({}),now=()=>Date.now()){
 return async(req:Request)=>{
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json','Cache-Control':'no-store',...(status===429?{'Retry-After':'60'}:{})}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors(req),'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-event-id, x-webhook-timestamp, x-webhook-test'}});
  if(req.method!=='POST')return json({error:'Usa POST'},405);
  const endpoint=new URL(req.url).searchParams.get('endpoint');const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  if(!endpoint||!UUID.test(endpoint)||!token)return json({error:'Webhook non autorizzato'},401);
  const timestamp=req.headers.get('X-Webhook-Timestamp')??'';const eventId=req.headers.get('X-Event-ID')??'';
  if(!/^\d{10}$/.test(timestamp)||Math.abs(now()-Number(timestamp)*1000)>300000||eventId.length<1||eventId.length>160)return json({error:'Servono X-Event-ID e X-Webhook-Timestamp recente (secondi Unix, tolleranza 5 minuti)'},400);
  const secretHash=await hashWebhookSecret(token);
  const {data:config,error}=await db.from('automation_webhook_endpoints').select('id,mapping_json').eq('id',endpoint).eq('secret_hash',secretHash).eq('is_active',true).maybeSingle();
  if(error)return json({error:'Servizio temporaneamente non disponibile'},503);
  if(!config)return json({error:'Webhook non autorizzato'},401);
  try{
   const {data,raw}=await limitedJson(req);const mapped=mapInboundPayload(config.mapping_json,data);const test=req.headers.get('X-Webhook-Test')==='1';
   const {data:result,error:failure}=await db.rpc('automation_accept_webhook',{p_endpoint:endpoint,p_secret_hash:secretHash,p_event_id:eventId,p_digest:await hashWebhookSecret(raw),p_entity_id:mapped.entityId,p_payload:mapped.payload,p_test:test,p_contact:mapped.contact??null});
   if(failure)return json({error:failure.code==='23505'?'X-Event-ID già usato con un corpo diverso':failure.code==='54000'?'Limite di 60 eventi al minuto':failure.code==='42501'?'Webhook non autorizzato':'Controlla record, azienda e configurazione del flusso'},failure.code==='23505'?409:failure.code==='54000'?429:failure.code==='42501'?401:422);
   return json(result,test||result?.duplicate?200:202);
  }catch(e){return json({error:e instanceof Error?e.message:'JSON non valido'},400);}
 };
}
