import{z}from'zod';
import{ok,fail}from'./data.mjs';
import{createCoordinator,preparationScope}from'./coordinator.mjs';
import{extractCompany}from'./company-extraction.mjs';
import{infer,groundCitation,normalize,missingMarkers,privateInference}from'../gare-ai/inference.mjs';
import{extractDocuments}from'../gare-ai/extract.mjs';
import{randomUUID}from'node:crypto';
export function installGarePreparation(middlewares,{auth,service,createJob}){
 const coordinator=createCoordinator({service,createJob});
 void service.from('gare_asset_extractions').update({status:'interrupted',error:'Servizio riavviato: ripeti la lettura; i risultati completati sono conservati.'}).eq('status','running').then(()=>{});
 middlewares.use('/api/gare-preparation',async(req,res,next)=>{
  try{
   if(req.method!=='POST')return next();const ctx=await auth(req);if(!['admin','editor'].includes(ctx.role))fail('La preparazione richiede un compilatore o amministratore.',403);
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100_000)fail('Richiesta troppo grande');}const body=JSON.parse(raw),route=new URL(req.url,'http://127.0.0.1').pathname;let result;
   if(route==='/members'){result=await ok(ctx.client.rpc('gare_pilot_members',{cid:ctx.companyId}));}
   else if(route==='/extract-company'){
    const input=z.object({source_file_id:z.string().uuid(),force:z.boolean().default(false)}).parse(body);result=await extractCompany(ctx,input.source_file_id,{force:input.force,signal:AbortSignal.timeout(30*60*1000)});
   }else if(route==='/start'||route==='/resume'){
    const input=z.object({participation_id:z.string().uuid(),force:z.boolean().default(false),id:z.string().uuid().optional()}).parse(body);result=await coordinator.start(ctx,input.participation_id,{force:input.force,resumeId:route==='/resume'?input.id:undefined});
   }else if(route==='/cancel')result=await coordinator.cancel(ctx,z.string().uuid().parse(body.id));
   else if(route==='/apply-criteria'){
    const input=z.object({id:z.string().uuid(),selected:z.array(z.string()).min(1).max(40),confirmed:z.literal(true)}).parse(body);
    const run=await ok(ctx.client.from('gare_preparation_runs').select('*').eq('id',input.id).single()),scope=await preparationScope(ctx,run.participation_id);if(scope.hash!==run.request_hash||run.result.reading_hash&&run.result.reading_hash!==scope.reading_hash)fail('Le fonti o i dati sono cambiati: prepara nuovi risultati prima di applicarli.');
    const existing=await ok(ctx.client.from('gare_technical_criteria').select('*').eq('participation_id',scope.p.id));const inserted=[],skipped=[];
    for(const c of run.result.technical||[]){if(!input.selected.includes(c.id))continue;if(!c.citation.grounded||!scope.sources.some(d=>d.id===c.citation.document_id&&d.sha256===c.citation.sha256))fail('Fonte del criterio non corrente.');
     const code=c.code.trim()||`AI-${c.id.slice(0,8)}`;if(existing.some(e=>e.code===code||e.source_document_id===c.citation.document_id&&e.source_quote===c.citation.quote&&e.title===c.title)){skipped.push(code);continue;}
     const points=c.max_points.match(/^\d{1,3}(?:[.,]\d{1,2})?$/)?Number(c.max_points.replace(',','.')):null;
     inserted.push(await ok(ctx.client.from('gare_technical_criteria').insert({company_id:ctx.companyId,participation_id:scope.p.id,code,title:c.title,max_points:points,source_document_id:c.citation.document_id,source_locator:`${c.citation.page?'Pagina '+c.citation.page+' · ':''}${c.citation.section}`,source_quote:c.citation.quote,proposal:'',commitments:'',limits:c.limits,status:'bozza'}).select().single()));
    }
    result={inserted,skipped};
   }else if(route==='/technical-draft'){
    const input=z.object({participation_id:z.string().uuid(),confirmed:z.literal(true)}).parse(body),scope=await preparationScope(ctx,input.participation_id);
    if(!scope.j?.configuration.expected_categories.includes('tecnica'))fail('Conferma prima che questa fase richieda una busta tecnica.');
    const criteria=await ok(ctx.client.from('gare_technical_criteria').select('*').eq('participation_id',scope.p.id).order('code'));if(!criteria.length)fail('Registra e verifica la griglia dei criteri prima di preparare la bozza tecnica.');
    result=await createJob(ctx,{participation_id:scope.p.id,action:'bozza',category:'tecnica',deep:true,goal:`Segui la griglia dei criteri registrati, nell’ordine, con un capitolo per codice e sottocriterio. Collega soltanto risorse e lavori del titolare corretto. Distingui descrizione, prove, impegni da approvare e dati mancanti. Rispetta i limiti espliciti di pagine e contenuto. Non inserire ribassi, prezzi o importi dell’offerta economica nella relazione tecnica. Non attribuire punteggi o probabilità. La bozza è una struttura di lavoro da revisionare sul modello ufficiale.`});
   }else if(route==='/review-draft'){
    if(!privateInference)fail('I controlli documentali restano disponibili. Per l’analisi AI del testo riservato usa il motore privato.',422);
    const input=z.object({draft_id:z.string().uuid()}).parse(body),draft=await ok(ctx.client.from('gare_ai_drafts').select('*').eq('id',input.draft_id).single()),scope=await preparationScope(ctx,draft.participation_id);
    const signal=AbortSignal.timeout(20*60*1000),extracted=await extractDocuments(ctx,scope.sources,randomUUID(),{signal,progress:async()=>{}});const pages=extracted.pages.slice(0,12);let chars=0;const selected=pages.map(p=>{const value={...p,text:p.text.slice(0,Math.max(0,8000-chars))};chars+=value.text.length;return value;}).filter(p=>p.text);
    const context=`BOZZA (testo da controllare):\n${draft.body.slice(0,8000)}\n\nFONTI:\n${selected.map(p=>`[DOCUMENT_ID=${p.document_id};PAGINA=${p.page};SEZIONE=${p.section}]\n${p.text}`).join('\n')}`;
    const response=await infer('revisiona',context,'Trova al massimo dieci incongruenze concrete tra bozza e fonti: limiti, elementi richiesti, impegni non riscontrati. Ogni osservazione deve citare esattamente il passaggio della bozza in offer_quote e il requisito nella fonte. Se non hai entrambe le prove non inventare una violazione. Nessun voto o certificazione di conformità.',{signal,deep:true});
    const findings=response.result.findings.map(f=>{const citation=f.citation?groundCitation(f.citation,extracted.pages,scope.sources):null;return{...f,citation,verified:!!f.offer_quote&&normalize(draft.body).includes(normalize(f.offer_quote))&&!!citation?.grounded};});
    result={draft_id:draft.id,revision:draft.revision,findings,missing_fields:missingMarkers(draft.body),warnings:[...extracted.warnings,'Revisione assistita parziale: controllare il testo completo, la griglia e gli originali. Non certifica la conformità.'],usage:response.usage};
    await ok(service.from('gare_preparation_reviews').insert({company_id:ctx.companyId,participation_id:draft.participation_id,draft_id:draft.id,draft_revision:draft.revision,created_by:ctx.userId,source_snapshot:scope.snapshot.sources,result}));
   }else if(route==='/complete'){
    const input=z.object({id:z.string().uuid(),note:z.string().trim().min(10).max(2000),confirmed:z.literal(true)}).parse(body),run=await ok(ctx.client.from('gare_preparation_runs').select('*').eq('id',input.id).single());
    if(run.status!=='waiting_review')fail('Completa prima l’elaborazione.');const currentScope=await preparationScope(ctx,run.participation_id);if(currentScope.hash!==run.request_hash||run.result.reading_hash&&run.result.reading_hash!==currentScope.reading_hash)fail('Fonti, letture o dati cambiati: avvia una nuova preparazione.');
    result=await ok(service.from('gare_preparation_runs').update({status:'done',message:'Risultati della preparazione revisionati; completare le verifiche del fascicolo',result:{...run.result,review_note:input.note,reviewed_by:ctx.userId},revision:run.revision+1,updated_at:new Date().toISOString()}).eq('id',run.id).eq('status','waiting_review').select().single());
   }else return next();
   res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
  }catch(e){res.statusCode=e.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e instanceof z.ZodError?'Dati della preparazione non validi':e.message||'Preparazione non riuscita'}));}
 });
}
