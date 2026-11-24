import{normalize}from'../gare-ai/inference.mjs';
import {currentDocuments} from '../../src/modules/gare-appalti/source-current.js';
export const todayRome=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const latest=currentDocuments;
export const usableAsset=(a,today=todayRome())=>a.status==='confermato'&&!a.source_replaced&&!!a.reviewed_by&&!!a.verified_on&&a.verified_on<=today&&(!a.expires_on||a.expires_on>=today);
const tokens=s=>normalize(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>2);
export function matchAssets(requirements,assets){
 return requirements.map(r=>{
  const words=tokens([r.description,r.kind,r.threshold,r.expected_proof].join(' '));
  const codes=[...[r.description,r.threshold].join(' ').matchAll(/\b(?:OG|OS)\s?\d{1,2}\b/gi)].map(m=>m[0].toLowerCase().replace(/ /g,''));
  const candidates=assets.filter(a=>a.status!=='archiviato').map(a=>{
   const hay=tokens([a.title,...Object.values(a.data)].join(' '));const common=[...new Set(words.filter(w=>hay.includes(w)))];
   const category=(a.data.category||'').toLowerCase().replace(/ /g,'');const exact=codes.length>0&&codes.includes(category);
   return{id:a.id,title:a.title,status:usableAsset(a)?'confermato':'da_verificare',rank:common.length+(exact?10:0),reasons:[...(exact?[`Categoria ${a.data.category} presente nella scheda`]:[]),...(common.length?[`Termini comuni: ${common.slice(0,5).join(', ')}`]:[]),`Titolare: ${a.entity_name||'da indicare'}${a.entity_tax_id?' · '+a.entity_tax_id:''}`,'Soggetto, periodo, soglia e ambito richiedono verifica nella gara']};
  }).filter(a=>a.rank>1).sort((a,b)=>Number(b.status==='confermato')-Number(a.status==='confermato')||b.rank-a.rank).slice(0,4);
  return{requirement_id:r.id,description:r.description,candidates};
 });
}
export function selectKnowledge(assets,goal,limit=7000){
 const terms=tokens(goal);const sorted=assets.filter(a=>usableAsset(a)).sort((a,b)=>{
  const score=x=>terms.filter(t=>tokens([x.title,...Object.values(x.data)].join(' ')).includes(t)).length;
  return score(b)-score(a)||a.id.localeCompare(b.id);
 });
 const selected=[];let size=0;
 for(const a of sorted){const item={id:a.id,revision:a.revision,kind:a.kind,title:a.title,entity_name:a.entity_name,entity_tax_id:a.entity_tax_id,data:a.data,source_file_id:a.source_file_id,source_sha256:a.source_sha256,source_locator:a.source_locator,source_quote:a.source_quote?.slice(0,500),verified_on:a.verified_on,expires_on:a.expires_on};const n=JSON.stringify(item).length;if(size+n>limit)continue;selected.push(item);size+=n;}
 return{selected,omitted:sorted.length-selected.length};
}
