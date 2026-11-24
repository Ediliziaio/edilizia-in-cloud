import{usableAsset}from'./knowledge.mjs';
const normalized=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const fieldKeys={
 'categoria soa':['qualification','category'],'classifica soa':['qualification','classification'],'classificazione soa':['qualification','classification'],'numero attestazione soa':['qualification','number'],'organismo soa':['qualification','issuer'],
 'il sottoscritto':['authority','signer'],'sottoscritto':['authority','signer'],'nome firmatario':['authority','signer'],'firmatario':['authority','signer'],'poteri di firma':['authority','powers'],'nome responsabile tecnico':['person','name'],
 'committente referenza':['experience','client'],'importo referenza':['experience','amount'],'periodo referenza':['experience','period'],'descrizione mezzo':['equipment','description'],
};
export function formSuggestions(fields,assets){return Object.fromEntries(fields.filter(f=>f.supported&&!f.options?.length).map(f=>{
 const match=fieldKeys[normalized(f.label)]||fieldKeys[normalized(f.key)];if(!match)return[f.key,[]];const[kind,key]=match;
 return[f.key,assets.filter(a=>a.kind===kind&&usableAsset(a)&&a.data[key]&&a.data[key].length<=300).map(a=>({asset_id:a.id,asset_revision:a.revision,value:a.data[key],title:a.title,entity_name:a.entity_name,entity_tax_id:a.entity_tax_id,source_locator:a.source_locator}))];
}));}
export function usedFormAssets(fields,values,bindings,assets){const suggestions=formSuggestions(fields,assets),used=[];for(const[key,id]of Object.entries(bindings)){if(!id)continue;const suggestion=suggestions[key]?.find(s=>s.asset_id===id&&s.value===values[key]);if(!suggestion)throw Error('Il dato del patrimonio è cambiato o non coincide con il campo: riseleziona la fonte o usa la compilazione manuale.');const a=assets.find(a=>a.id===id);if(!used.some(x=>x.id===id))used.push({id:a.id,revision:a.revision,title:a.title,entity_name:a.entity_name,source_file_id:a.source_file_id,source_sha256:a.source_sha256});}return used.sort((a,b)=>a.id.localeCompare(b.id));}
