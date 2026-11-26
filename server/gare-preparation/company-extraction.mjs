import{randomUUID,createHash}from'node:crypto';
import{extractDocuments}from'../gare-ai/extract.mjs';
import{infer,contextText,groundCitation,MODEL,privateInference}from'../gare-ai/inference.mjs';
import{ok,fail}from'./data.mjs';
import{checkedProposal}from'./proposal.mjs';
const fields={registration:['register','number','issuer','scope'],certification:['scheme','issuer','number','scope'],cel:['client','number','category','period','amount','share','role','completion','contract'],insurance:['issuer','number','scope','amount','conditions'],qualification:['scheme','category','classification','issuer','number','scope'],experience:['client','description','period','amount','currency','category','share','completion'],person:['name','role','skills','relationship','availability'],equipment:['description','availability','quantity','capacity','location'],authority:['signer','powers','role','authority_document','scope'],economic:['metric','period','amount','currency','scope','document']};
export async function extractCompany(ctx,id,{signal,force=false}={}){
 if(!privateInference)fail('Per i documenti aziendali riservati usa il fascicolo manuale o il motore privato.',422);
 const file=await ok(ctx.client.from('gare_evidence_files').select('*').eq('company_id',ctx.companyId).eq('id',id).single());
 const newer=await ok(ctx.client.from('gare_evidence_files').select('id').eq('previous_id',id).limit(1));if(newer.length)fail('La prova è stata aggiornata: scegli la versione corrente.');
 const hash=createHash('sha256').update(JSON.stringify([ctx.companyId,id,file.sha256,MODEL,3])).digest('hex');
 if(!force){const cached=await ok(ctx.client.from('gare_asset_extractions').select('*').eq('request_hash',hash).eq('status','done').order('created_at',{ascending:false}).limit(1));if(cached[0])return{...cached[0].result,extraction_id:cached[0].id,reused:true};}
 const row=await ok(ctx.service.from('gare_asset_extractions').insert({company_id:ctx.companyId,source_file_id:id,source_sha256:file.sha256,created_by:ctx.userId,request_hash:hash,status:'running'}).select().single());
 try{
  const result=await extractDocuments(ctx,[file],randomUUID(),{signal,cacheTable:'gare_company_document_texts',progress:async()=>{}});
  if(!result.pages.length)fail('Nessun testo leggibile nella prova: usa l’inserimento manuale.');
  const proposals=[],warnings=[...result.warnings];let usage={input_tokens:0,output_tokens:0,duration_ms:0};
  const groups=[];let current=[],length=0;for(const p of result.pages){if(length+p.text.length>12000&&current.length){groups.push(current);current=[];length=0;}current.push(p);length+=p.text.length;}if(current.length)groups.push(current);
  if(groups.length>12)fail('Documento aziendale troppo esteso: carica una prova con un perimetro più preciso.');
  for(const pages of groups){
   const response=await infer('profilo',contextText(pages),`Estrai schede aziendali soltanto per fatti espliciti: visure/iscrizioni, certificazioni e regolarità, CEL, polizze, qualificazioni, lavori svolti, persone, mezzi, poteri di firma e dati economici per periodo. Per i CEL riporta quota e importo riferiti al soggetto solo se espliciti, senza calcoli o equivalenze. Il titolare deve essere quello della fonte, non presumere che sia l’azienda collegata. Riporta dati come nella fonte. Non attestare disponibilità o assenza di cause di esclusione. Usa SOLO queste chiavi per data: ${JSON.stringify(fields)}. Non ricavare classifiche o importi da soglie esterne. Ogni scheda deve avere una citazione esatta che riscontri i dati; nessuna scheda confermata automaticamente.`,{signal,deep:true});
   for(const p of response.result.proposals){const citation=groundCitation({...p.citation,document_id:file.id},result.pages,[file]);if(!citation.grounded){warnings.push(`Proposta scartata perché la citazione non è riscontrata: ${p.title}`);continue;}
    const proposal=checkedProposal(p,result.pages.map(p=>p.text).join('\n'),citation);if(proposal)proposals.push(proposal);else warnings.push(`Scheda senza dati riscontrati, non proposta: ${p.title}`);
   }
   warnings.push(...response.result.warnings);for(const key of Object.keys(usage))usage[key]+=response.usage[key]||0;
  }
  const value={source_file_id:id,proposals:[...new Map(proposals.map(p=>[JSON.stringify([p.kind,p.entity_name,p.data]),p])).values()],warnings:[...new Set(warnings)],coverage:result.coverage,usage};
  await ok(ctx.service.from('gare_asset_extractions').update({status:'done',result:value,updated_at:new Date().toISOString()}).eq('id',row.id));return{...value,extraction_id:row.id};
 }catch(e){await ctx.service.from('gare_asset_extractions').update({status:signal?.aborted?'interrupted':'error',error:e.message,updated_at:new Date().toISOString()}).eq('id',row.id);throw e;}
}
