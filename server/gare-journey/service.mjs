import{loadSubject,snapshotSubject}from'../gare-office/subjects.mjs';
import{execFile,python}from'../gare-ai/runtime.mjs';import{promisify}from'node:util';import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{fileURLToPath}from'node:url';import{createHash,randomUUID}from'node:crypto';import{z}from'zod';
const exec=promisify(execFile);
import{validateXml}from'./validator.mjs';
import{currentDocuments}from'../../src/modules/gare-appalti/source-current.js';
const helper=fileURLToPath(new URL('./dgue.py',import.meta.url));
const scope=z.object({participation_id:z.string().uuid(),document_id:z.string().uuid()});
async function ok(p){const{data,error}=await p;if(error)throw Error(error.message);return data;}
export function dgue(input){return new Promise((resolve,reject)=>{const child=execFile(python,[helper],{timeout:30000,maxBuffer:8_000_000},(error,stdout,stderr)=>{if(error)return reject(Error((stderr.split('\n').filter(Boolean).at(-1)||error.message).slice(0,800)));try{resolve(JSON.parse(stdout));}catch{reject(Error('Risposta del compilatore DGUE non valida'));}});child.stdin.end(JSON.stringify(input));});}
export async function signatureCheck(file,name){
 const result={summary:'Formato non supportato per la verifica locale',integrity:'non verificata',trust:'non verificata',revocation:'non verificata',tool:null};
 if(/\.pdf$/i.test(name)){
  const nss=await mkdtemp(path.join(tmpdir(),'gare-nss-'));
  let signature;
  try {
   await exec('certutil',['-N','--empty-password','-d',`sql:${nss}`],{timeout:5000,maxBuffer:100_000});
   signature=await exec('pdfsig',['-nssdir',nss,'-nocert','-no-ocsp',file],{timeout:15_000,maxBuffer:500_000})
    .catch(error=>{if(error.code===2&&/does not contain any signatures/i.test(error.stdout||''))return error;throw error;});
  } finally {
   await rm(nss,{force:true,recursive:true});
  }
  const {stdout,stderr}=signature;
  result.tool='Poppler pdfsig';const output=stdout+'\n'+stderr;
  if(/does not contain any signatures/i.test(output))return{...result,summary:'PDF senza firma digitale rilevata',integrity:'firma assente'};
  const checks=[...output.matchAll(/Signature Validation:\s*(.*)/g)].map(m=>m[1]);
  const all=checks.length&&checks.every(s=>/Signature is Valid/i.test(s));return{...result,summary:all?'Integrità delle firme PDF verificata localmente; controllare identità, catena e revoca':'Firma PDF da verificare: integrità non confermata per tutte le firme',integrity:all?'verificata':'non confermata',signatures:checks.length,details:output.slice(0,10000)};
 }
 if(/\.(p7m|p7s)$/i.test(name)){
  result.tool='OpenSSL CMS';try{await exec('openssl',['cms','-verify','-binary','-inform','DER','-in',file,'-noverify','-out',path.join(path.dirname(file),'verified-content.bin')],{timeout:15000,maxBuffer:500_000});return{...result,summary:'Integrità CAdES/CMS verificata; identità, catena e revoca da verificare',integrity:'verificata'};}catch(e){return{...result,summary:'Firma CMS non verificabile o integrità non confermata',integrity:'non confermata',details:String(e.stderr||e.message).slice(0,1000)};}
 }
 return result;
}
export function installGareJourney(middlewares,{auth}){
 middlewares.use('/api/gare-journey',async(req,res,next)=>{let dir;
  try{
   if(req.method!=='POST')return next();const ctx=await auth(req);const route=new URL(req.url,'http://127.0.0.1').pathname;
   if(!['/signature','/dgue-inspect','/dgue-export','/dgue-check'].includes(route))return next();
   let raw='';for await(const c of req){raw+=c;if(raw.length>2_000_000)throw Error('Richiesta troppo estesa');}const body=JSON.parse(raw);const input=scope.parse(body);
   if(route!=='/signature'&&!['admin','editor'].includes(ctx.role))throw Error('La preparazione delle dichiarazioni richiede un compilatore');
   const p=await ok(ctx.client.from('gare_participations').select('*').eq('id',input.participation_id).single());
   const doc=await ok(ctx.client.from('gare_documents').select('*').eq('id',input.document_id).eq('company_id',ctx.companyId).eq('tender_id',p.tender_id).single());
   if(doc.size_bytes>10_000_000)throw Error('Massimo 10 MB per questa verifica locale');
   if(route!=='/signature'&&doc.category!=='fonte')throw Error('Acquisire la Request tra gli originali della gara');
   if(route==='/signature'&&doc.participation_id!==p.id)throw Error('Documento di un altro fascicolo');
   const blob=await ok(ctx.client.storage.from('gare-private').download(doc.storage_path));const bytes=Buffer.from(await blob.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==doc.sha256)throw Error('Hash del documento non coerente');
   dir=await mkdtemp(path.join(tmpdir(),'gare-journey-'));const source=path.join(dir,'input'+path.extname(doc.name));await writeFile(source,bytes);let result;
   if(route==='/signature')result=await signatureCheck(source,doc.name);
   else if(route==='/dgue-inspect'){const drafts=await ok(ctx.client.from('gare_documents').select('id,name,archived,created_at,generation_snapshot').eq('participation_id',p.id).eq('generation_snapshot->>source_id',doc.id).order('created_at',{ascending:false}).limit(30));result={...await dgue({operation:'inspect',source}),document_id:doc.id,drafts:drafts.filter(d=>d.generation_snapshot.answers&&(!d.archived||/\.json$/i.test(d.name))).map(d=>({document_id:d.id,created_at:d.created_at,...d.generation_snapshot}))};}
   else{
    const typed=z.union([z.string().max(5000),z.object({value:z.string().max(5000).optional(),currency:z.string().max(10).optional(),unit:z.string().max(50).optional(),start:z.string().max(20).optional(),end:z.string().max(20).optional(),scheme_id:z.string().max(200).optional(),list_id:z.string().max(300).optional(),list_agency:z.string().max(200).optional(),list_version:z.string().max(100).optional(),values:z.string().max(2000).optional(),url:z.string().max(1500).optional(),issuer:z.string().max(500).optional(),reference:z.string().max(500).optional()}).strict()]);
    const payload=z.object({identity:z.object({name:z.string().max(300),tax_id:z.string().max(100),signer:z.string().max(300),country:z.string().max(3)}),answers:z.record(typed),repetitions:z.record(z.array(z.record(typed)).max(20)).default({}),lots:z.array(z.string().max(200)).max(100),confirmed:z.literal(true),working_only:z.boolean(),subject_id:z.string().uuid().optional(),dgue_case_id:z.string().uuid().optional(),case_revision:z.number().int().positive().optional(),operator_role_code:z.enum(['SC','SCLE','LE','GM','OERON','OENRON']).optional(),group_name:z.string().max(300).optional()}).parse(body);
    if(!await ok(ctx.client.rpc('gare_source_current',{did:doc.id})))throw Error('Request aggiornata: aprire la fonte corrente');
    const subject=payload.subject_id?await loadSubject(ctx,payload.subject_id,{verified:route!=='/dgue-check'&&!payload.working_only}):null;if(subject&&(payload.identity.name!==subject.name||payload.identity.tax_id!==subject.tax_id))throw Error('Identità non coerente con il soggetto');if(payload.dgue_case_id){const c=await ok(ctx.client.from('gare_dgue_cases').select('*').eq('id',payload.dgue_case_id).eq('company_id',ctx.companyId).eq('participation_id',p.id).eq('source_id',doc.id).eq('subject_id',payload.subject_id).single());if(c.role!==payload.operator_role_code||c.group_name!==(payload.group_name||''))throw Error('Ruolo del DGUE diverso dal fascicolo');if(c.revision!==payload.case_revision||c.subject_revision!==subject.revision)throw Error('Fascicolo DGUE o soggetto cambiato: salva e riconferma prima di generare');}
    if(route==='/dgue-check'){result=await dgue({operation:'check',source,...payload});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;}
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const facts=await ok(ctx.client.from('gare_company_facts').select('id,key,value,revision,expires_on,verified_on').eq('company_id',ctx.companyId).eq('status','confermato').lte('verified_on',today));const reusable_facts=(!subject||subject.kind==='impresa'?facts:[]).filter(f=>(!f.expires_on||f.expires_on>=today)&&({ragione_sociale:payload.identity.name,partita_iva:payload.identity.tax_id,codice_fiscale:payload.identity.tax_id,rappresentante:payload.identity.signer,firmatario:payload.identity.signer,paese:payload.identity.country,country:payload.identity.country})[f.key]===f.value);
    const stable=value=>value&&typeof value==='object'?(Array.isArray(value)?value.map(stable):Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]))):value;
    const request_hash=createHash('sha256').update(JSON.stringify(stable({compiler_revision:5,subject_snapshot:subject?snapshotSubject(subject):null,source:doc.sha256,participation_id:p.id,reusable_facts,...payload}))).digest('hex');
    const drafts=await ok(ctx.client.from('gare_documents').select('*').eq('participation_id',p.id).eq('document_kind','modello_compilato'));
    const current=currentDocuments(drafts);
    const cached=payload.working_only?drafts.find(d=>d.generation_snapshot?.request_hash===request_hash):current.find(d=>d.generation_snapshot?.request_hash===request_hash);
    if(cached){const previous=cached;const b=await ok(ctx.client.storage.from('gare-private').download(previous.storage_path));const content=Buffer.from(await b.arrayBuffer());if(createHash('sha256').update(content).digest('hex')!==previous.sha256)throw Error('Hash della bozza salvata non coerente');res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name:previous.name,content_base64:content.toString('base64'),validation:previous.generation_snapshot.validation,document:previous,reused:true}));return;}
    result=await dgue({operation:'export',source,...payload});
    const output=Buffer.from(result.content_base64,'base64');
    if(result.name.endsWith('.xml')){const generated=path.join(dir,'response.xml');await writeFile(generated,output);result.validation.official=await validateXml(generated,source);if(!result.validation.official.local_consistency)throw Error('La Response non supera i controlli di coerenza con la Request');
     if(result.validation.official.european_rules_passed&&result.validation.official.request_compared)result.unresolved=0;
    }
    const hash=createHash('sha256').update(output).digest('hex');
    const existing=await ok(ctx.client.from('gare_documents').select('*').eq('participation_id',p.id).eq('sha256',hash).eq('document_kind','modello_compilato').limit(1));
    if(existing.length)result.document=existing[0];else{
     const prior=payload.dgue_case_id&&!payload.working_only?current
      .filter(d=>d.generation_snapshot?.dgue_case_id===payload.dgue_case_id&&!d.generation_snapshot?.working_only)
      .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]:undefined;
     const id=randomUUID(),storage_path=`${ctx.companyId}/${id}/${result.name}`;await ok(ctx.client.storage.from('gare-private').upload(storage_path,output,{contentType:result.name.endsWith('.xml')?'application/xml':'application/json',upsert:false}));
     try{result.document=await ok(ctx.client.from('gare_documents').insert({id,company_id:ctx.companyId,tender_id:p.tender_id,participation_id:p.id,name:result.name,storage_path,sha256:hash,size_bytes:output.length,category:'amministrativa',document_kind:'modello_compilato',previous_id:prior?.id||null,version:(prior?.version||0)+1,mandatory:!payload.working_only,archived:payload.working_only,archive_reason:payload.working_only?'Questionario di lavoro conservato separatamente dai documenti di offerta':'',unresolved_fields:result.unresolved??1,generation_snapshot:{...(subject?{subject_snapshot:snapshotSubject(subject)}:{}),...(payload.dgue_case_id?{dgue_case_id:payload.dgue_case_id,case_revision:payload.case_revision}:{}),working_only:payload.working_only,review_flow_version:1,reusable_facts,compiler_revision:5,answers:payload.answers,repetitions:payload.repetitions,request_hash,source_id:doc.id,source_sha256:doc.sha256,identity:payload.identity,lot_ids:payload.lots,validation:result.validation,confirmed_by:ctx.userId}}).select().single());}catch(e){await ctx.client.storage.from('gare-private').remove([storage_path]);throw e;}
    }
   }
   res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e instanceof z.ZodError?'Dati della richiesta non validi':e.message}));}
  finally{if(dir)await rm(dir,{recursive:true,force:true});}
 });
}
