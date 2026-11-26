import { createHash } from 'node:crypto';
import { z } from 'zod';
const endpoint='https://api.ted.europa.eu/v3/notices/search';
const fields=['publication-number','procedure-identifier','notice-title','publication-date','buyer-name','estimated-value-proc','estimated-value-cur-proc','deadline-receipt-tender-date-lot','deadline-receipt-tender-time-lot','place-of-performance','notice-type','contract-nature-main-proc'];
const definitions=[
 {key:'TED',name:'TED · avvisi europei',owner:'Ufficio delle pubblicazioni dell’Unione europea',url:'https://ted.europa.eu',access_mode:'API pubblica documentata',coverage:'Avvisi pubblicati su TED. Allegati integrali e lotti da acquisire e verificare.',license_note:'Avvisi riutilizzabili salvo indicazioni contrarie; metadati CC0. Rispettare i diritti di terzi. Riferimento: https://ted.europa.eu/en/legal-notice',enabled:false},
 {key:'ANAC_PVL',name:'ANAC · Pubblicità a valore legale',owner:'ANAC',url:'https://pubblicitalegale.anticorruzione.it/',access_mode:'Collegamento e importazione manuale',coverage:'Copertura API e allegati non validata',license_note:'Accesso automatizzato e condizioni di riuso da verificare',enabled:false},
 {key:'ANAC_DATA',name:'ANAC · Open Data',owner:'ANAC',url:'https://dati.anticorruzione.it/opendata',access_mode:'Manuale · accesso automatico non validato (403 nel controllo)',coverage:'Dataset e ritardo di pubblicazione da verificare',license_note:'Licenze e accessibilità da verificare per ciascun dataset',enabled:false},
 {key:'ACQUISTI',name:'Acquisti in Rete',owner:'Consip / MEF',url:'https://www.acquistinretepa.it/opencms/vetrina_bandi.html',access_mode:'Collegamento e importazione manuale',coverage:'Documenti caricati dall’impresa; API non validata',license_note:'Verificare accesso e riuso; nessun accesso ad account aziendali',enabled:false},
 {key:'SINTEL',name:'Sintel',owner:'ARIA',url:'https://www.sintel.regione.lombardia.it/eprocdata/sintelSearch.xhtml',access_mode:'Collegamento e importazione manuale',coverage:'Documenti caricati dall’impresa; API non validata',license_note:'Verificare metodo consentito, copertura e riuso',enabled:false},
];
const strings=v=>v==null?[]:Array.isArray(v)?v.flatMap(strings):typeof v==='object'?Object.values(v).flatMap(strings):[String(v)];
const localized=v=>{if(typeof v==='string')return v;if(!v)return'';return strings(v.ita??v.ITA??v.eng??v.ENG??Object.values(v)[0]).join('; ');};
export const canonicalJson=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonicalJson(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonicalJson(value[k]))])):value);
export function normalizeNotice(raw){
 const number=String(raw['publication-number']||'');if(!/^\d+-\d{4}$/.test(number))throw Error('Identificativo TED non riconosciuto');
 const amounts=strings(raw['estimated-value-proc']);const currencies=[...new Set(strings(raw['estimated-value-cur-proc']))];
 const dates=[...new Set(strings(raw['deadline-receipt-tender-date-lot']).map(v=>v.match(/^\d{4}-\d{2}-\d{2}/)?.[0]).filter(Boolean))];
 const times=[...new Set(strings(raw['deadline-receipt-tender-time-lot']))];
 return{publication_number:number,procedure_identifier:strings(raw['procedure-identifier'])[0]||null,title:localized(raw['notice-title'])||`Avviso TED ${number}`,authority:localized(raw['buyer-name'])||'Ente da verificare',publication_date:String(raw['publication-date']||''),territories:strings(raw['place-of-performance']),notice_type:String(raw['notice-type']||''),contract_nature:strings(raw['contract-nature-main-proc']),estimated_values:amounts,currencies,deadline_dates:dates,deadline_times:times,url:`https://ted.europa.eu/it/notice/-/detail/${number}`,coverage:'Sintesi dell’avviso. Disciplinare, lotti e allegati da acquisire.'};
}
async function ok(p){const{data,error}=await p;if(error)throw Error(error.message);return data;}
export function installGareSources(middlewares,{auth,service}){
 async function sourceList(ctx){await ok(service.from('gare_sources').upsert(definitions.map(d=>({...d,company_id:ctx.companyId})),{onConflict:'company_id,key',ignoreDuplicates:true}));return ok(ctx.client.from('gare_sources').select('*').eq('company_id',ctx.companyId).order('key'));}
 middlewares.use('/api/gare-sources',async(req,res,next)=>{try{
  const ctx=await auth(req);const pathname=new URL(req.url,'http://127.0.0.1').pathname;let result;
  if(req.method==='GET'&&pathname==='/status')result=await sourceList(ctx);
  else if(req.method==='POST'&&pathname==='/ted-search'){
   let text='';for await(const chunk of req){text+=chunk;if(text.length>20_000)throw Error('Richiesta troppo grande');}
   const input=z.object({query:z.string().trim().min(3).max(1500),page:z.number().int().min(1).max(100).default(1),scope:z.enum(['ACTIVE','ALL','LATEST']).default('ACTIVE')}).parse(JSON.parse(text));
   const sources=await sourceList(ctx);const source=sources.find(s=>s.key==='TED');if(!source.enabled)throw Error('La consultazione TED è stata disattivata dall’amministratore locale.');
   const payload={query:input.query,page:input.page,limit:10,scope:input.scope,onlyLatestVersions:true,fields};
   const now=new Date().toISOString();await ok(service.from('gare_sources').update({last_attempt:now}).eq('id',source.id).eq('company_id',ctx.companyId));
   const run=await ok(service.from('gare_ingestion_runs').insert({company_id:ctx.companyId,source_id:source.id,query:payload,status:'running'}).select().single());
   try{
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30_000),redirect:'error'});
    if(!response.ok)throw Error(`TED HTTP ${response.status}: ${(await response.text()).slice(0,350)}`);
    const data=await response.json();if(!Array.isArray(data.notices))throw Error('Risposta TED non riconosciuta');const notices=[];let changes=0;
    for(const raw of data.notices){const normalized=normalizeNotice(raw);const sha256=createHash('sha256').update(canonicalJson(raw)).digest('hex');
     const existing=await ok(service.from('gare_notice_versions').select('*').eq('company_id',ctx.companyId).eq('source_id',source.id).eq('publication_number',normalized.publication_number).eq('sha256',sha256).maybeSingle());
     const notice=existing||await ok(service.from('gare_notice_versions').insert({company_id:ctx.companyId,source_id:source.id,publication_number:normalized.publication_number,procedure_identifier:normalized.procedure_identifier,sha256,raw,normalized}).select().single());notices.push(notice);
     if(!existing){const linked=await ok(ctx.client.from('gare_tenders').select('id,notice_version_id,notice:gare_notice_versions(publication_number,procedure_identifier)').eq('company_id',ctx.companyId).not('notice_version_id','is',null));
      for(const tender of linked){if(tender.notice_version_id===notice.id)continue;const previous=tender.notice;
       if(previous?.publication_number!==notice.publication_number&&(!notice.procedure_identifier||previous?.procedure_identifier!==notice.procedure_identifier))continue;
       await ok(service.from('gare_source_changes').upsert({company_id:ctx.companyId,tender_id:tender.id,notice_version_id:notice.id},{onConflict:'tender_id,notice_version_id',ignoreDuplicates:true}));
       await ok(service.from('gare_participations').update({stage:'in_revisione'}).eq('company_id',ctx.companyId).eq('tender_id',tender.id).eq('stage','pronta'));changes++;
      }
     }
    }
    const finished=new Date().toISOString();await ok(service.from('gare_ingestion_runs').update({status:data.timedOut?'partial':'done',count:notices.length,error:data.timedOut?'TED segnala una ricerca parziale per timeout':null,finished_at:finished}).eq('id',run.id).eq('company_id',ctx.companyId));
    await ok(service.from('gare_sources').update(data.timedOut?{last_error:'Ricerca parziale: timeout della fonte'}:{last_success:finished,last_error:null}).eq('id',source.id).eq('company_id',ctx.companyId));
    result={notices,total:data.totalNoticeCount??notices.length,partial:!!data.timedOut,page:input.page,run_id:run.id,changes,acquired_at:finished};
   }catch(error){const message=String(error.message||error).slice(0,700);await service.from('gare_ingestion_runs').update({status:'error',error:message,finished_at:new Date().toISOString()}).eq('id',run.id).eq('company_id',ctx.companyId);await service.from('gare_sources').update({last_error:message}).eq('id',source.id).eq('company_id',ctx.companyId);throw Error(`Aggiornamento non riuscito. L’ultima sincronizzazione riuscita rimane invariata. ${message}`);}
  }else return next();
  res.statusCode=200;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
 }catch(error){res.statusCode=error.status||400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error instanceof z.ZodError?'Parametri di ricerca non validi':error.message}));}});
}
