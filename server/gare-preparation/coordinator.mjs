import{assetProofs,replacedProofs}from'./proofs.mjs';
import{loadSubject}from'../gare-office/subjects.mjs';
import{procurementField}from'../gare-templates/assistance.mjs';
import{createHash}from'node:crypto';
import{infer,privateInference}from'../gare-ai/inference.mjs';
import{stableJson,ok,fail,localPost}from'./data.mjs';
import{latest,matchAssets,todayRome}from'./knowledge.mjs';
import{canonicalField,commonFieldKey}from'../../src/modules/gare-appalti/dossier/field-key.js';
const digest=x=>createHash('sha256').update(stableJson(x)).digest('hex');
export async function preparationScope(ctx,pid){
 const p=await ok(ctx.client.from('gare_participations').select('*').eq('company_id',ctx.companyId).eq('id',pid).single());
 const [docs,assets,facts,journeys,subjects,company,readings]=await Promise.all([
  ok(ctx.client.from('gare_documents').select('*').eq('tender_id',p.tender_id).eq('category','fonte').eq('archived',false)),
  ok(ctx.client.from('gare_company_assets').select('*').eq('company_id',ctx.companyId).order('id')),
  ok(ctx.client.from('gare_company_facts').select('*').eq('company_id',ctx.companyId).order('id')),
  ok(ctx.client.from('gare_journeys').select('*').eq('participation_id',pid)),ok(ctx.client.from('gare_company_subjects').select('*').eq('company_id',ctx.companyId).order('id')),ok(ctx.client.from('gare_companies').select('profile').eq('id',ctx.companyId).single()),ok(ctx.client.from('gare_document_texts').select('document_id,sha256,pages,coverage').eq('company_id',ctx.companyId))]);
 const replacements=await replacedProofs(ctx);const proofAssets=await assetProofs(ctx,assets,replacements);for(const a of assets)Object.assign(a,proofAssets.find(p=>p.id===a.id));const staleProofs=[...new Set([...replacements].filter(id=>assets.some(a=>a.source_file_id===id)||subjects.some(s=>s.source_file_id===id)))].sort();const sources=latest(docs).sort((a,b)=>a.id.localeCompare(b.id)),j=journeys[0];
 const criteria=await ok(ctx.client.from('gare_technical_criteria').select('id,revision').eq('participation_id',pid).order('id'));
 const snapshot={...(staleProofs.length?{stale_proofs:staleProofs}:{}),sources:sources.map(d=>({id:d.id,sha256:d.sha256,name:d.name})),assets:assets.map(a=>({id:a.id,revision:a.revision})),facts:facts.map(f=>({id:f.id,revision:f.revision})),criteria,subjects:subjects.map(({id,revision,status,source_file_id})=>({id,revision,status,source_file_id})),date:todayRome(),profile:digest(company.profile),scope:j?{kind:j.configuration.kind,phase:j.configuration.phase,form:j.configuration.form,parties:j.configuration.parties,expected_categories:j.configuration.expected_categories}:null};
 return{p,sources,assets,facts,j,subjects,snapshot,reading_hash:digest(readings.filter(r=>sources.some(d=>d.id===r.document_id)).map(r=>({id:r.document_id,sha256:r.sha256,pages:r.pages,reader:r.coverage?.reader_revision,status:r.coverage?.status})).sort((a,b)=>a.id.localeCompare(b.id))),hash:digest({version:8,company:ctx.companyId,pid,snapshot})};
}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{signal?.throwIfAborted();const timer=setTimeout(done,ms);function done(){signal?.removeEventListener('abort',stop);resolve();}function stop(){clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(signal.reason);}signal?.addEventListener('abort',stop,{once:true});});
export function createCoordinator({service,createJob}){
 const active=new Map(),starting=new Map();
 void service.from('gare_preparation_runs').update({status:'interrupted',message:'Servizio riavviato: riprendi la preparazione con la sessione locale.',updated_at:new Date().toISOString()}).in('status',['queued','running']).then(()=>{});
 async function start(ctx,pid,options={}){const key=ctx.companyId+':'+pid;if(starting.has(key))return starting.get(key);const task=startUnlocked(ctx,pid,options);starting.set(key,task);try{return await task;}finally{starting.delete(key);}}
 async function startUnlocked(ctx,pid,{force=false,resumeId}={}){
  const scope=await preparationScope(ctx,pid);if(!scope.sources.length)fail('Carica prima gli originali della gara.');
  let run;
  if(resumeId){run=await ok(ctx.client.from('gare_preparation_runs').select('*').eq('id',resumeId).eq('participation_id',pid).single());if(active.has(run.id))return run;if(!['interrupted','error','cancelled'].includes(run.status))fail('Questa preparazione non richiede una ripresa.');if(run.request_hash!==scope.hash)fail('Fonti, patrimonio o perimetro sono cambiati: avvia una nuova preparazione per conservare lo storico.');}
  else if(!force){const existing=await ok(ctx.client.from('gare_preparation_runs').select('*').eq('request_hash',scope.hash).in('status',['queued','running','waiting_review','done']).order('created_at',{ascending:false}).limit(1));const current=existing.find(r=>!r.result?.reading_hash||r.result.reading_hash===scope.reading_hash);if(current)return current;}
  run=run?await ok(service.from('gare_preparation_runs').update({status:'queued',error:null,message:'Ripresa dai passaggi già salvati',updated_at:new Date().toISOString()}).eq('id',run.id).select().single()):await ok(service.from('gare_preparation_runs').insert({company_id:ctx.companyId,participation_id:pid,created_by:ctx.userId,request_hash:scope.hash,snapshot:scope.snapshot,message:'Preparazione locale in coda'}).select().single());
  const controller=new AbortController();active.set(run.id,controller);void execute(ctx,scope,run,controller).finally(()=>active.delete(run.id));return run;
 }
 async function execute(ctx,scope,run,controller){
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(90*60*1000)]);let steps=run.steps||{},result=run.result||{};
  async function update(patch){Object.assign(run,patch);await ok(service.from('gare_preparation_runs').update({...patch,steps,result,revision:run.revision+1,updated_at:new Date().toISOString()}).eq('id',run.id).eq('company_id',ctx.companyId));run.revision++;}
  async function stage(key,progress,message,task){signal.throwIfAborted();if(steps[key]?.status==='done')return;steps[key]={...steps[key],status:'running',detail:message};await update({status:'running',progress,message});await task();steps[key]={...steps[key],status:'done',detail:'Passaggio salvato'};await update({progress});}
  try{
   await stage('inventory',5,'Controllo degli originali e del perimetro',async()=>{result.inventory=scope.sources.map(d=>({id:d.id,name:d.name,kind:d.document_kind,review:'Originale conservato; lettura e riconoscimento da verificare'}));});
   await stage('analysis',15,'Lettura delle fonti e raccolta delle citazioni',async()=>{
    // XML is inspected structurally in the DGUE step, including lots and conditional questions.
    const sources=scope.sources.filter(doc=>!/\.xml$/i.test(doc.name));
    const saved=steps.analysis?.job_ids||[],ids=[];
    for(let i=0;i<sources.length;i+=12){
     const batch=sources.slice(i,i+12);
     const batchIds=new Set(batch.map(doc=>doc.id));
     let job=saved[i/12]?await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',saved[i/12]).single()):null;
     if(job&&(job.input?.analysis_scope!=='operativa'||job.source_snapshot.length!==batch.length||job.source_snapshot.some(doc=>!batchIds.has(doc.id))))job=null;
     if(!job||['error','cancelled','interrupted'].includes(job.status))job=await createJob(ctx,{participation_id:scope.p.id,action:'analizza',document_ids:[...batchIds],analysis_scope:'operativa',deep:false,force:!!job},{resume:job});
     ids.push(job.id);
     steps.analysis={...steps.analysis,job_ids:[...ids,...saved.slice(ids.length)]};
     await update({message:`Analisi ${i/12+1}: elaborazione salvata`});
     while(['queued','running'].includes(job.status)){
      await delay(1500,signal);job=await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',job.id).single());
      await update({progress:15+Math.round(30*(i+job.progress/100*batch.length)/sources.length),message:job.message});
     }
     if(job.status!=='done')fail(job.error||'Analisi interrotta: riprendi per completare.');
    }
    steps.analysis={...steps.analysis,job_ids:ids};
    result.analysis_ids=ids;
   });
   result.reading_hash=(await preparationScope(ctx,scope.p.id)).reading_hash;
   const analyses=result.analysis_ids?.length?await ok(ctx.client.from('gare_ai_jobs').select('*').in('id',result.analysis_ids)):[];
   await stage('models',50,'Riconoscimento dei moduli originali',async()=>{
    result.contracts=[];result.warnings=analyses.flatMap(j=>j.result?.warnings||[]);
    for(const doc of scope.sources.filter(d=>/\.docx?(\.p7m)?$/i.test(d.name)||d.document_kind==='modello'&&/\.(pdf|p7m)$/i.test(d.name))){signal.throwIfAborted();try{const c=await localPost(ctx,'templates','inspect',{participation_id:scope.p.id,document_id:doc.id},signal);result.contracts.push(c);}catch(e){result.warnings.push(`${doc.name}: ${e.message}. Originale disponibile nel percorso manuale.`);}await update({message:`Modello controllato: ${doc.name}`});}
   });
   await stage('forms',60,'Proposte dei moduli dal fascicolo e dai testi letti',async()=>{
    result.form_proposals=[];const primary=scope.subjects.find(s=>s.kind==='impresa'&&s.status!=='archiviato');const subject=primary?await loadSubject(ctx,primary.id):null;if(subject&&!subject.current)result.warnings.push('Il fascicolo dell’impresa richiede un nuovo riscontro: i valori dei moduli vanno verificati manualmente.');
    for(const contract of result.contracts||[]){signal.throwIfAborted();const batches=[];const relevant=scope.sources.filter(d=>!d.name.toLowerCase().endsWith('.zip')&&!d.name.toLowerCase().endsWith('.xml'));if(contract.fields.some(procurementField))for(let i=0;i<relevant.length;i+=12)batches.push(relevant.slice(i,i+12).map(d=>d.id));if(!batches.length)batches.push([]);let proposals=[],warnings=[];
     for(const ids of batches){try{const answer=await localPost(ctx,'templates','suggest',{contract_id:contract.id,document_ids:ids,...(subject?{subject_id:subject.id}:{})},signal);proposals.push(...answer.proposals);warnings.push(...answer.warnings);}catch(e){warnings.push(e.message);}}
     proposals=[...new Map(proposals.map(p=>[stableJson(p),p])).values()];result.form_proposals.push({contract_id:contract.id,proposals,warnings});await update({message:`Valori proposti e citazioni salvati: ${contract.name}`});
    }
   });
   await stage('dgue',65,'Inventario DGUE per operatori e lotti',async()=>{
    result.dgue_inventory=[];for(const source of scope.sources.filter(d=>/\.xml$/i.test(d.name))){signal.throwIfAborted();try{const meta=await localPost(ctx,'journey','dgue-inspect',{participation_id:scope.p.id,document_id:source.id},signal);result.dgue_inventory.push({source_id:source.id,name:source.name,questions:meta.questions.length,criteria:[...new Set(meta.questions.map(q=>q.criterion_id))].length,lots:meta.lots,can_generate:meta.can_generate,role_note:'Un fascicolo distinto per ciascun operatore; confermare ruoli, dipendenze e lotti nelle istruzioni.'});}catch(e){result.warnings.push(`${source.name}: ${e.message}`);}}
   });
   await stage('matching',70,'Collegamento tra richieste e patrimonio aziendale',async()=>{
    const requirements=await ok(ctx.client.from('gare_requirements').select('*').eq('participation_id',scope.p.id));
    const proposed=analyses.flatMap(j=>j.result?.requirements||[]).filter(r=>r.citation?.grounded);
    const allRequirements=[...new Map([...requirements,...proposed].map(r=>[r.id,r])).values()];result.matches=matchAssets(allRequirements,scope.assets);
    const available=scope.assets.filter(a=>a.status!=='archiviato').slice(0,30).map(a=>({id:a.id,kind:a.kind,title:a.title,entity_name:a.entity_name,entity_tax_id:a.entity_tax_id,status:a.source_replaced?'in_verifica':a.status,data:a.data,source_locator:a.source_locator}));
    if(privateInference&&available.length&&JSON.stringify(available).length<11000){for(let offset=0;offset<allRequirements.length;offset+=8){
     const batch=allRequirements.slice(offset,offset+8);const context=JSON.stringify({requirements:batch.map(r=>({id:r.id,description:r.description,threshold:r.threshold,period:r.reference_period,proof:r.expected_proof})),assets:available});if(context.length>18500){result.warnings.push('Abbinamento semantico parziale: perimetro esteso, mantenuti i suggerimenti testuali.');continue;}
     let response;try{response=await infer('abbinamenti',context,'Proponi collegamenti semantici utili fra richieste e schede. Usa soltanto gli ID forniti; nessuna equivalenza fra categorie, classifiche o certificazioni diverse. Distingui il titolare del dato, periodo, quote e disponibilità. Non decidere ammissibilità. Se manca una prova sufficiente lascia asset_ids vuoto. Per ogni collegamento indica perché può essere utile e quali verifiche restano.',{signal,deep:false});}catch(error){signal.throwIfAborted();result.warnings.push(`Abbinamenti AI non disponibili per ${batch.length} richieste: conservati i riscontri testuali. ${error.message}`);continue;}
     for(const m of response.result.matches){const target=result.matches.find(r=>r.requirement_id===m.requirement_id&&batch.some(b=>b.id===r.requirement_id));if(!target)continue;const candidates=m.asset_ids.map(id=>{const a=available.find(a=>a.id===id);return a?{id:a.id,title:a.title,status:a.status==='confermato'?'confermato':'da_verificare',reasons:[`Proposta semantica AI: ${m.reason}`,`Titolare: ${a.entity_name} · ${a.entity_tax_id}`,...m.missing_checks,'Collegamento da verificare dall’impresa, nessuna ammissibilità automatica']}:null;}).filter(Boolean);if(candidates.length)target.candidates=candidates;}
     await update({message:`Confronto semantico: ${Math.min(offset+8,allRequirements.length)} di ${allRequirements.length} richieste`});
    }}else if(privateInference&&available.length)result.warnings.push('Patrimonio molto esteso: suggerimenti testuali disponibili; restringere le schede per un confronto semantico completo.');
    result.technical=analyses.flatMap(j=>j.result?.technical_criteria||[]).filter(c=>c.citation?.grounded);
    const questions=[];const seen=new Set();for(const c of result.contracts||[]){for(const f of c.fields.filter(f=>f.supported)){const key=commonFieldKey(f,c.id);const values=(result.form_proposals||[]).find(x=>x.contract_id===c.id)?.proposals.filter(x=>x.field_key===f.key)||[];if(!c.mapping[f.key]&&!values.length&&!seen.has(key)){questions.push({id:key,title:f.label,detail:canonicalField(f)?'Dato comune riutilizzabile: completalo una volta e riconferma nei modelli.':`Richiesta specifica del modello ${c.name}; non viene condivisa con altri campi omonimi.`,area:'moduli'});seen.add(key);}}if(c.format==='pdf_mapped'&&!c.constraints.mapping_confirmed)questions.push({id:c.id,title:`Conferma i campi di ${c.name}`,detail:'Il PDF non ha campi canonici: verifica le regioni nell’originale.',area:'moduli'});}
    for(const m of result.matches.filter(m=>!m.candidates.length)){const technical=/criterio\s+[a-z]\d|criterio\s+tecnico/i.test(m.description);questions.push({id:m.requirement_id,title:m.description,detail:technical?'Completa la proposta tecnica, le prove pertinenti e gli impegni del criterio.':'Nessuna scheda aziendale collegabile individuata: scegli una prova o registra la verifica manuale.',area:technical?'offerta':'requisiti'});}
    if(!scope.j)questions.unshift({id:'scope',title:'Conferma soggetti, fase e buste richieste',detail:'Attiva il percorso guidato prima di preparare la consegna.',area:'percorso'});
    if((result.dgue_inventory||[]).length)questions.push({id:'dgue-operators',title:'Completa i DGUE distinti per operatore e lotto',detail:'Il pacchetto mantiene risposte separate. Verifica quali soggetti devono produrre un DGUE nelle istruzioni.',area:'dgue'});result.questions=questions;
   });
   await stage('technical',85,'Preparazione della struttura tecnica e dei controlli',async()=>{
    const criteria=await ok(ctx.client.from('gare_technical_criteria').select('*').eq('participation_id',scope.p.id));
    result.review=criteria.filter(c=>!c.proposal?.trim()).map(c=>({severity:'attenzione',description:`Criterio ${c.code}: proposta tecnica da scrivere con prove e impegni`,offer_quote:'',verified:true}));
    if(scope.j?.configuration.expected_categories.includes('tecnica')&&criteria.length){
     let job=steps.technical?.job_ids?.[0]?await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',steps.technical.job_ids[0]).single()):null;
     if(!job||['error','cancelled','interrupted'].includes(job.status)){job=await createJob(ctx,{participation_id:scope.p.id,action:'bozza',category:'tecnica',deep:true,goal:'Organizza un capitolo per ciascun criterio registrato e relativo codice. Collega solo dati e prove del soggetto corretto; lascia da completare dati mancanti e da approvare ogni nuovo impegno. Segui i limiti espliciti. Escludi ribassi e prezzi dell’offerta economica dalla relazione tecnica. Nessun punteggio o probabilità di vittoria.'});steps.technical={...steps.technical,job_ids:[job.id]};await update({message:'Bozza tecnica per criteri in preparazione'});}
     while(['queued','running'].includes(job.status)){await delay(1500,signal);job=await ok(ctx.client.from('gare_ai_jobs').select('*').eq('id',job.id).single());await update({progress:85+Math.round(job.progress/10),message:job.message});}
     if(job.status!=='done')fail(job.error||'Bozza tecnica interrotta: riprendi la preparazione.');result.draft_ids=job.result?.draft_id?[job.result.draft_id]:[];
    }
    result.review.push({severity:'attenzione',description:'Rivedere le proposte AI, la copertura delle pagine e i moduli prima di applicare i risultati. Firma e presentazione richiedono le operazioni sul portale.',offer_quote:'',verified:true});
   });
   const finalScope=await preparationScope(ctx,scope.p.id);if(finalScope.hash!==run.request_hash||finalScope.reading_hash!==result.reading_hash)fail('Il perimetro è cambiato durante l’elaborazione: conserva questi risultati e avvia una nuova preparazione.');
   await update({status:'waiting_review',progress:100,message:'Preparazione salvata: rivedi proposte, dati mancanti e moduli',error:null});
  }catch(e){await update({status:controller.signal.aborted?'cancelled':signal.aborted||/JWT expired|sessione.*scadut/i.test(e.message||'')?'interrupted':'error',message:'Risultati intermedi conservati. Puoi riprendere o avviare una nuova preparazione.',error:e.message||'Elaborazione interrotta'});}
 }
 async function cancel(ctx,id){const run=await ok(ctx.client.from('gare_preparation_runs').select('*').eq('id',id).single());if(run.created_by!==ctx.userId&&ctx.role!=='admin')fail('Non puoi interrompere questa preparazione.',403);active.get(id)?.abort(Error('Interrotta dall’operatore'));return{cancelled:true};}
 return{start,cancel};
}
