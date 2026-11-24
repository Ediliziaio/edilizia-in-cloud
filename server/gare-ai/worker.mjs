import{assetProofs}from'../gare-preparation/proofs.mjs';
import{sessionContexts}from'./session-context.mjs';
import { createClient } from '@supabase/supabase-js';
import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pilotCompanyId } from './runtime.mjs';
import {scopeSourcePages} from './source-scope.mjs';
import { analyzeSegments, INTEGRAL_SEGMENT_CHARS, planAnalysisSegments } from './analysis-segments.mjs';
import { extractDocuments,READER_REVISION } from './extract.mjs';
import { contextText,contextLimit,groundResult,infer,localModels,missingMarkers,MODEL,operationalPassages,retrieveContext } from './inference.mjs';
import { installGareTemplates } from '../gare-templates/service.mjs';
import{installGarePreparation}from'../gare-preparation/service.mjs';
import{selectKnowledge}from'../gare-preparation/knowledge.mjs';
import{installGareOffice}from'../gare-office/service.mjs';
import{installGareReview}from'../gare-review/service.mjs';
import { installGareJourney } from '../gare-journey/service.mjs';
import { installGareSources } from '../gare-sources/ted.mjs';
import {installGareIntake} from '../gare-intake/service.mjs';
import {currentDocuments} from '../../src/modules/gare-appalti/source-current.js';
import { draftFile } from './documents.mjs';
import { previewDraft } from './preview.mjs';

const inputSchema=z.object({participation_id:z.string().uuid(),action:z.enum(['analizza','rispondi','bozza','confronta']),document_ids:z.array(z.string().uuid()).max(12).default([]),question:z.string().max(4000).default(''),goal:z.string().max(5000).default(''),category:z.enum(['amministrativa','tecnica','economica']).default('tecnica'),deep:z.boolean().default(true),analysis_scope:z.enum(['operativa','integrale']).default('integrale'),force:z.boolean().default(false),source_scope:z.object({unit_key:z.string().regex(/^(?:p|s):[1-9]\d{0,4}$/),extracted_sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional()}).strict().superRefine((v,c)=>{if(v.source_scope&&(v.action!=='rispondi'||v.document_ids.length!==1))c.addIssue({code:z.ZodIssueCode.custom,message:'La domanda sul testo richiede una sola fonte'});});
const latest=currentDocuments;
async function ok(p){const{data,error}=await p;if(error)throw Error(error.message);return data;}
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
const sumUsage=(a,b)=>({input_tokens:(a.input_tokens||0)+(b.input_tokens||0),output_tokens:(a.output_tokens||0)+(b.output_tokens||0),duration_ms:(a.duration_ms||0)+(b.duration_ms||0),model:MODEL});
export function installGareAI(middlewares, config){
 const sessions=sessionContexts();
 const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 installGareOffice(middlewares,{auth,service});installGareReview(middlewares,{auth,service});installGareJourney(middlewares,{auth});installGareTemplates(middlewares,{auth,service});installGareSources(middlewares,{auth,service});
 installGareIntake(middlewares,{auth,service});
 const pending=[],active=new Map();let draining=false,filterRunning=false;
 installGarePreparation(middlewares,{auth,service,createJob});
 void service.from('gare_ai_jobs').update({status:'interrupted',message:'Servizio riavviato: riprendi con Riprova.',updated_at:new Date().toISOString()}).eq('company_id',pilotCompanyId).in('status',['queued','running']).then(()=>{});
 async function auth(req){
  const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if(!token)fail('Sessione richiesta',401);
  const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user||data.user.is_anonymous)fail('Sessione scaduta',401);
  const role=await ok(client.rpc('gare_pilot_role',{cid:pilotCompanyId}));
  if(!['admin','editor'].includes(role))fail('Accesso non abilitato',403);
  const company=await ok(client.from('gare_companies').select('*').eq('id',pilotCompanyId).single());
  return sessions.accept({client,service,token,userId:data.user.id,companyId:pilotCompanyId,role,company,config});
 }
 async function createJob(ctx,raw,{resume}={}){
  if(filterRunning)fail('Il motore sta preparando filtri: riprova fra pochi secondi.',409);
  const input=inputSchema.parse(raw);if(input.action!=='rispondi'&&!['admin','editor'].includes(ctx.role))fail('Il tuo ruolo non può avviare elaborazioni che preparano dati o documenti.',403);
  const p=await ok(ctx.client.from('gare_participations').select('*').eq('id',input.participation_id).eq('company_id',ctx.companyId).single());
  const documents=await ok(ctx.client.from('gare_documents').select('*').eq('company_id',ctx.companyId).eq('tender_id',p.tender_id).eq('category','fonte'));
  const selected=input.document_ids.length?documents.filter(d=>input.document_ids.includes(d.id)):latest(documents);
  if(input.document_ids.length&&selected.length!==new Set(input.document_ids).size)fail('Uno dei documenti non appartiene a questa procedura.');
  if(!selected.length)fail('Carica e seleziona almeno un documento sorgente.');
  if(input.source_scope){if(!await ok(ctx.client.rpc('gare_source_current',{did:selected[0].id})))fail('La fonte è storica: apri la versione corrente',409);const cached=await ok(ctx.client.from('gare_document_texts').select('pages,coverage').eq('document_id',selected[0].id).eq('sha256',selected[0].sha256).maybeSingle());if(cached?.coverage?.reader_revision!==READER_REVISION)fail('Completa la lettura corrente prima di chiedere alla pagina',409);try{scopeSourcePages(input.source_scope,{pages:cached.pages,coverage:[cached.coverage]},selected);}catch(e){fail(e.message,409);}}
  if(input.action==='confronta'&&selected.length!==2)fail('Per il confronto seleziona esattamente due versioni.');
  if(input.action==='rispondi'&&input.question.trim().length<5)fail('Scrivi una domanda di almeno cinque caratteri.');
  const models=await localModels();if(!models.some(m=>m.name===MODEL))fail('Il modello locale è ancora da scaricare. Attendi il completamento del setup AI.');
  const evidence=await ok(ctx.client.from('gare_evidence').select('*').eq('company_id',ctx.companyId));
  const snapshot=selected.map(d=>({id:d.id,sha256:d.sha256,version:d.version,name:d.name}));
  const economicRevisions=await ok(ctx.client.from('gare_economic_scenarios').select('id,revision').eq('participation_id',p.id));
  const criterionRevisions=await ok(ctx.client.from('gare_technical_criteria').select('id,revision').eq('participation_id',p.id));
  const reusableFacts=await ok(ctx.client.from('gare_company_facts').select('id,revision').eq('company_id',ctx.companyId).order('id'));const journeysForCache=await ok(ctx.client.from('gare_journeys').select('configuration').eq('participation_id',p.id));const scopeForCache=journeysForCache[0]?.configuration;const journeyScope=scopeForCache&&['bozza','rispondi'].includes(input.action)?{kind:scopeForCache.kind,phase:scopeForCache.phase,form:scopeForCache.form,parties:scopeForCache.parties}:null;
  const libraryRevisions=await ok(ctx.client.from('gare_technical_library').select('id,revision').eq('company_id',ctx.companyId).order('id'));
  const assetRevisions=await ok(ctx.client.from('gare_company_assets').select('id,revision').eq('company_id',ctx.companyId).order('id'));
  const dependsOnCompany=['bozza','rispondi'].includes(input.action)&&!input.source_scope;const hash=createHash('sha256').update(JSON.stringify({company:ctx.companyId,pipeline_revision:input.action==='analizza'?15:13,model:MODEL,input:{...input,force:false},sources:snapshot,...(dependsOnCompany?{libraryRevisions,assetRevisions,reusableFacts,journeyScope,economicRevisions,criterionRevisions,evidence:evidence.map(e=>[e.id,e.revision]),profile:ctx.company.profile,participation_revision:p.revision}:{})})).digest('hex');
  if(!input.force){const existing=await ok(ctx.client.from('gare_ai_jobs').select('*').eq('request_hash',hash).in('status',['queued','running','done']).order('created_at',{ascending:false}).limit(1));if(existing[0])return existing[0];}
  const saved = input.action==='analizza' && resume?.request_hash===hash
   && ['error','interrupted','cancelled'].includes(resume.status) ? resume.result?.analysis_checkpoint : null;
  const job=await ok(service.from('gare_ai_jobs').insert({company_id:ctx.companyId,participation_id:p.id,created_by:ctx.userId,action:input.action,model:MODEL,input,request_hash:hash,source_snapshot:snapshot,...(saved?{result:{analysis_checkpoint:saved}}:{}),message:'In coda per l’elaborazione locale'}).select().single());
  const controller=new AbortController();active.set(job.id,controller);pending.push({ctx,job,input,documents:selected,participation:p,evidence,controller});void drain();return job;
 }
 async function drain(){if(draining)return;draining=true;try{while(pending.length){const item=pending.shift();await run(item);active.delete(item.job.id);}}finally{draining=false;}}
 async function run({ctx,job,input,documents,participation,evidence,controller}){
  let progressValue=1,lastMessage='Avvio analisi locale',usage={};
  const update=async(progress,message)=>{progressValue=progress;lastMessage=message;await ok(service.from('gare_ai_jobs').update({status:'running',progress,message,updated_at:new Date().toISOString()}).eq('id',job.id).eq('company_id',ctx.companyId));};
  const heartbeat=setInterval(()=>{void service.from('gare_ai_jobs').update({updated_at:new Date().toISOString(),progress:progressValue,message:lastMessage}).eq('id',job.id).eq('company_id',ctx.companyId).then(()=>{});},4000);heartbeat.unref();
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30*60*1000)]);
  try{
   if(signal.aborted)throw Error('Annullata');await update(2,'Verifica degli originali e delle versioni');
   const extracted=await extractDocuments(ctx,documents,job.id,{signal,progress:update});
   if(!extracted.pages.length)throw Error('Nessun testo analizzabile. I documenti richiedono lettura manuale o un formato supportato.');
   const tender=await ok(ctx.client.from('gare_tenders').select('*').eq('id',participation.tender_id).single());
   const scenarios=await ok(ctx.client.from('gare_economic_scenarios').select('id,title,input,revision').eq('participation_id',participation.id));
   const criteria=await ok(ctx.client.from('gare_technical_criteria').select('*').eq('participation_id',participation.id));
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const reusable=await ok(ctx.client.from('gare_company_facts').select('*').eq('company_id',ctx.companyId).eq('status','confermato').lte('verified_on',today));const validFacts=reusable.filter(f=>!f.expires_on||f.expires_on>=today);const journeys=await ok(ctx.client.from('gare_journeys').select('configuration').eq('participation_id',participation.id));const c=journeys[0]?.configuration;
   const allAssets=await assetProofs(ctx,await ok(ctx.client.from('gare_company_assets').select('*').eq('company_id',ctx.companyId)));const knowledge=selectKnowledge(allAssets,[tender.title,input.goal,input.question,...criteria.map(c=>c.title)].join(' '),5000);
   const library=await ok(ctx.client.from('gare_technical_library').select('*').eq('company_id',ctx.companyId).eq('status','approvato').order('id'));let librarySize=0;const selectedLibrary=library.filter(e=>{if(!e.reviewed_by||e.evidence_ids.some(id=>!evidence.some(v=>v.id===id&&v.status==='valido'&&v.verified_on<=today&&(!v.expires_on||v.expires_on>=today))))return false;const n=JSON.stringify(e).length;if(librarySize+n>2500)return false;librarySize+=n;return true;}).map(e=>({id:e.id,revision:e.revision,title:e.title,body:e.body,evidence_ids:e.evidence_ids}));
   const facts={reusable_library:selectedLibrary,reusable_assets:knowledge.selected,assets_omitted:knowledge.omitted,dati_riutilizzabili:validFacts.map(f=>({id:f.id,key:f.key,value:f.value,source:f.source,revision:f.revision,expires_on:f.expires_on,verified_on:f.verified_on})),perimetro:c?{kind:c.kind,phase:c.phase,form:c.form,parties:c.parties}:null,scenari_economici_da_verificare:scenarios,criteri_tecnici_registrati:criteria.map(c=>({id:c.id,revision:c.revision,code:c.code,title:c.title,proposal:c.proposal,commitments:c.commitments,limits:c.limits,status:c.status})),gara:{id:tender.id,revision:tender.revision,title:tender.title,base_amount:tender.base_amount,deadline_date:tender.deadline_date,deadline_time:tender.deadline_time,timezone:tender.timezone},impresa:ctx.company.profile,evidenze:evidence.slice(0,12).map(e=>({id:e.id,revision:e.revision,title:e.title,value:e.value,status:e.status,verified_on:e.verified_on,expires_on:e.expires_on,source:e.source}))};
   const metadata=input.source_scope?'Rispondi esclusivamente al testo della pagina o sezione fornita. I riferimenti ad altre parti del documento richiedono consultazione separata; se manca un dato, dichiaralo. Nessuna valutazione di ammissibilità.':['analizza','confronta'].includes(input.action)?'Estrai e confronta esclusivamente i documenti; nessun dato della scheda gara è una fonte per i termini.':`DATI GESTIONALI (non equivalgono a dichiarazioni riconfermate): ${JSON.stringify(facts)}`;
   let result;
   if(input.action==='analizza'){
    const operational=input.analysis_scope==='operativa';
    const passages=operational?operationalPassages(extracted.pages,documents):extracted.pages;
    const deepAnalysis=input.deep&&!operational;
    const contextBudget=contextLimit(deepAnalysis)-metadata.length-1;
    const segments=planAnalysisSegments(passages,operational?contextBudget:Math.min(contextBudget,INTEGRAL_SEGMENT_CHARS));
    if(!segments.length)throw Error('Nessun passaggio disponibile per l’analisi.');
    let currentProgress=35, segmentLabel='';
    result=await analyzeSegments({
     segments,checkpoint:job.result?.analysis_checkpoint,signal,
     async analyze(pages){
      const response=await infer(operational?'analisi_operativa':'analizza',`${metadata}\n${contextText(pages)}`,
       operational
        ? 'Sintesi breve. Per questo passaggio seleziona fino a due requisiti, tre documenti, due scadenze e due criteri espliciti. Cita una frase breve esatta. Lascia vuote le liste se mancano riscontri.'
        : 'Estrai requisiti, documenti richiesti, scadenze, criteri e criticità espliciti del segmento. Una voce per obbligo o termine distinto. Riassunto di una frase e citazioni esatte e brevi. Non dedurre l’ammissibilità.',
       {signal,deep:deepAnalysis});
      usage=sumUsage(usage,response.usage);
      return groundResult('analizza',operational?{...response.result,criteria:[],missing_documents:[]}:response.result,pages,documents,evidence);
     },
     async onSegment(i,total,resumed,part){
      currentProgress=35+Math.round(i/total*55);
      segmentLabel=operational?'Riepilogo operativo':`Analisi approfondita · segmento ${i+1}/${total}`;
      if(part.length)segmentLabel+=` · parte ${part.map(i=>i+1).join('.')}`;
      await update(currentProgress,resumed?`${segmentLabel} · ripresa dai segmenti salvati`:segmentLabel);
     },
     async onSplit(){await update(currentProgress,`${segmentLabel} · analizzo in parti più brevi`);},
     accountFailed(spent){usage=sumUsage(usage,spent);},
     async save(checkpoint){
      await ok(service.from('gare_ai_jobs').update({result:{analysis_checkpoint:checkpoint},usage}).eq('id',job.id).eq('company_id',ctx.companyId));
     },
    });
    if(operational)extracted.warnings.push('Riepilogo operativo dai passaggi selezionati. Per esaminare tutto il testo, apri gli originali o avvia l’analisi approfondita.');
   }else{
    const availablePages=scopeSourcePages(input.source_scope,extracted,documents);
    const metadataBudget=contextLimit(input.deep)-metadata.length-1;if(metadataBudget<500)throw Error('Dati aziendali e criteri troppo estesi per questa elaborazione: restringere il perimetro prima di avviare la bozza.');
    const comparePartial=input.action==='confronta'&&contextText(extracted.pages).length>metadataBudget;
    if(comparePartial)extracted.warnings.push('Confronto parziale: selezionati i passaggi pertinenti di entrambe le fonti; controllare gli originali integrali.');
    const selected=input.action==='confronta'?(comparePartial?documents.flatMap(d=>retrieveContext(extracted.pages.filter(p=>p.document_id===d.id),'rettifica scadenza requisiti importi modifica',Math.floor((metadataBudget-2)/documents.length))):extracted.pages):retrieveContext(availablePages,input.question||input.goal||input.category,Math.min(16000,metadataBudget));
    await update(40,input.action==='bozza'?'Redazione della bozza con fonti e dati aziendali':input.action==='confronta'?'Confronto delle versioni e degli impatti':'Ricerca dei passaggi pertinenti e risposta con fonti');
    const response=await infer(input.action,`${metadata}\n${contextText(selected)}`,input.action==='bozza'?`Prepara una bozza LIBERA nella busta ${input.category}. ${input.goal} Se un modello ufficiale è richiesto, segnala che questa bozza non lo sostituisce. Ogni nuovo impegno deve restare da approvare.`:input.action==='confronta'?'Confronta le due fonti selezionate, identifica cambiamenti, scadenze e requisiti potenzialmente coinvolti. Non applicare modifiche.':input.question,{signal,deep:input.deep});usage=sumUsage(usage,response.usage);result=groundResult(input.action,response.result,input.source_scope?availablePages:extracted.pages,documents,evidence);
    if(input.action==='bozza'){
     const body=result.sections.map(s=>`${s.heading}\n${s.text}`).join('\n\n')+(result.missing_fields.length?'\n\nDATI DA COMPLETARE\n'+result.missing_fields.map(f=>/\[DA (?:COMPLETARE|CONFERMARE|APPROVARE)/i.test(f)?f:`[DA COMPLETARE: ${f}]`).join('\n'):'')+(result.commitments.length?'\n\nIMPEGNI DA APPROVARE\n'+result.commitments.map(f=>/\[DA (?:COMPLETARE|CONFERMARE|APPROVARE)/i.test(f)?f:`[DA APPROVARE: ${f}]`).join('\n'):'');
     const draft=await ok(service.from('gare_ai_drafts').insert({company_id:ctx.companyId,participation_id:participation.id,job_id:job.id,title:result.title,category:input.category,body,source_snapshot:job.source_snapshot,missing_fields:missingMarkers(body),fact_snapshot:facts}).select().single());result={...result,draft_id:draft.id};
    }
   }
   const warnings=[...extracted.warnings];if(['bozza','rispondi'].includes(input.action)&&!input.source_scope&&knowledge.omitted)warnings.push(`Contesto aziendale selezionato per pertinenza: ${knowledge.selected.length} schede utilizzate, ${knowledge.omitted} schede confermate escluse dal limite di contesto. Consultare il patrimonio completo.`);if(!documents.some(d=>d.document_kind==='disciplinare'))warnings.push('Disciplinare non presente tra le fonti selezionate: analisi parziale.');
   await update(98,'Verifica delle citazioni e salvataggio dei risultati');
   await ok(service.from('gare_ai_jobs').update({status:'done',progress:100,message:'Elaborazione completata: revisione umana richiesta',result:{...result,warnings,coverage:extracted.coverage,source_snapshot:job.source_snapshot},usage:{...usage,extraction_ms:extracted.duration_ms,vision_pages:extracted.vision_pages},updated_at:new Date().toISOString()}).eq('id',job.id).eq('company_id',ctx.companyId));
  }catch(error){await service.from('gare_ai_jobs').update({status:controller.signal.aborted?'cancelled':/JWT expired|sessione.*scadut/i.test(error.message||'')?'interrupted':'error',error:controller.signal.aborted?'Elaborazione annullata dall’utente':String(error.message||error).slice(0,1200),message:'Elaborazione non completata',usage,updated_at:new Date().toISOString()}).eq('id',job.id).eq('company_id',ctx.companyId);}
  finally{clearInterval(heartbeat);}
 }
 async function exportDraft(ctx,body){
  if(!['admin','editor'].includes(ctx.role))fail('Permesso di compilazione richiesto',403);
  const input=z.object({draft_id:z.string().uuid(),format:z.enum(['docx','pdf']),revision:z.number().int(),confirmed:z.literal(true)}).parse(body);
  const draft=await ok(ctx.client.from('gare_ai_drafts').select('*').eq('id',input.draft_id).eq('company_id',ctx.companyId).single());if(draft.revision!==input.revision)fail('Bozza modificata: ricarica prima di esportare.');
  const p=await ok(ctx.client.from('gare_participations').select('*').eq('id',draft.participation_id).single());
  const current=await ok(ctx.client.from('gare_documents').select('id,sha256,previous_id').eq('tender_id',p.tender_id));
  const factsCurrent=await ok(ctx.client.rpc('gare_ai_facts_current',{did:draft.id}));
  const stale=!factsCurrent||draft.source_snapshot.some(s=>!current.some(d=>d.id===s.id&&d.sha256===s.sha256)||current.some(d=>d.previous_id===s.id));
  const prior=await ok(ctx.client.from('gare_documents').select('*').eq('ai_draft_id',draft.id).eq('category',draft.category).order('version',{ascending:false}));
  const previous=prior.find(d=>d.name.toLowerCase().endsWith('.'+input.format));
  const output=await draftFile(draft,input.format);const storage_path=`${ctx.companyId}/${randomUUID()}/${output.name}`;
  await ok(ctx.client.storage.from('gare-private').upload(storage_path,output.buffer,{contentType:output.contentType,upsert:false}));
  const document=await ok(ctx.client.from('gare_documents').insert({company_id:ctx.companyId,tender_id:p.tender_id,participation_id:p.id,name:output.name,storage_path,sha256:createHash('sha256').update(output.buffer).digest('hex'),size_bytes:output.buffer.length,category:draft.category,document_kind:'bozza_libera_ai',mandatory:true,previous_id:previous?.id||null,version:(previous?.version||0)+1,generation_snapshot:{draft_id:draft.id,revision:draft.revision,sources:draft.source_snapshot,facts:draft.fact_snapshot},ai_job_id:draft.job_id,ai_draft_id:draft.id,unresolved_fields:missingMarkers(draft.body).length+(stale?1:0)}).select().single());
  return{document,stale,missing_fields:missingMarkers(draft.body)};
 }
 middlewares.use('/api/gare-ai',async(req,res,next)=>{
  try{
   const ctx=await auth(req);const pathname=new URL(req.url,'http://127.0.0.1:8081').pathname;
   let result;
   if(req.method==='GET'&&pathname==='/status'){
    try{const models=await localModels();result={available:models.some(m=>m.name===MODEL),model:MODEL,models:models.map(m=>({name:m.name,size:m.size})),local:false};}catch{result={available:false,model:MODEL,local:false,error:'Il motore AI sul server non risponde'};}
   }else if(req.method==='POST'){
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100_000)fail('Richiesta troppo grande',413);}let body;try{body=JSON.parse(raw);}catch{fail('JSON non valido');}
    if(pathname==='/renew')result={renewed:true};
    else if(pathname==='/filters'){
     if(draining||filterRunning)fail('Il motore sta elaborando documenti: riprova al termine del lavoro.',409);
     const input=z.object({text:z.string().trim().min(5).max(600)}).strict().parse(body);
     const tenders=await ok(ctx.client.from('gare_tenders').select('territory').eq('company_id',ctx.companyId));const territories=[...new Set(tenders.map(t=>t.territory))];
     const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date());
     filterRunning=true;const response=await infer('filtri',`Territori presenti nell’archivio: ${JSON.stringify(territories)}. Oggi: ${today}. La ricerca riguarda solo l’archivio locale.`,`${input.text}\nConverti la richiesta in filtri. Inserisci solo condizioni esplicite, null per dati non indicati. min_amount e max_amount in euro; territorio uguale a una voce esistente quando corrisponde. q contiene soltanto parole sull’oggetto o sull’ente, senza territorio, importi, date o aggettivi generici. Non dichiarare di avere trovato gare. Se ambiguo lascia null e spiega in notes.`,{signal:AbortSignal.timeout(90_000),deep:false}).finally(()=>{filterRunning=false;});
     if(response.result.min_amount!==null&&response.result.max_amount!==null&&response.result.min_amount>response.result.max_amount)fail('Intervallo importi ambiguo: specifica minimo e massimo.');
     result={filters:response.result,usage:response.usage,local:false};
    }
    else if(pathname==='/jobs')result=await createJob(ctx,body);
    else if(pathname==='/cancel'){
     const job=await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',z.string().uuid().parse(body.id)).single());if(job.created_by!==ctx.userId&&ctx.role!=='admin')fail('Non puoi annullare questo lavoro',403);active.get(job.id)?.abort();result={cancelled:true};
    }else if(pathname==='/retry'){
     const job=await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',z.string().uuid().parse(body.id)).single());result=await createJob(ctx,{...job.input,force:true},{resume:job});
    }else if(pathname==='/preview-draft')result=await previewDraft(ctx,body);
    else if(pathname==='/export-draft')result=await exportDraft(ctx,body);
    else return next();
   }else return next();
   res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
  }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error instanceof z.ZodError?'Dati della richiesta non validi.':error.message||'Operazione non riuscita'}));}
 });
}
