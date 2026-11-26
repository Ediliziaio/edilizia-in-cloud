import{normalize}from'../gare-ai/inference.mjs';
const keys={registration:['register','number','issuer','scope'],certification:['scheme','issuer','number','scope'],cel:['client','number','category','period','amount','share','role','completion','contract'],insurance:['issuer','number','scope','amount','conditions'],qualification:['scheme','category','classification','issuer','number','scope'],experience:['client','description','period','amount','currency','category','share','completion'],person:['name','role','skills','relationship','availability'],equipment:['description','availability','quantity','capacity','location'],authority:['signer','powers','role','authority_document','scope'],economic:['metric','period','amount','currency','scope','document']};
export function checkedProposal(proposal,text,citation){
 const warnings=[],hay=normalize(text),raw=Object.fromEntries(proposal.data.filter(d=>keys[proposal.kind].includes(d.key)&&d.value.trim()).map(d=>[d.key,d.value]));
 // These are verbatim labelled values, not conversions of categories/classifications.
 if(proposal.kind==='qualification'){
  if(/\bSOA\b/i.test(citation.quote))raw.scheme=citation.quote.match(/\bSOA\b/i)[0];
  const category=citation.quote.match(/\bcategoria\s+((?:OG|OS)\s?\d{1,2})\b/i),level=citation.quote.match(/\bclassifica\s+([IVX]+(?:\s?-?\s?bis)?)\b/i);
  if(category)raw.category=category[1];if(level)raw.classification=level[1];
 }
 const data=Object.fromEntries(Object.entries(raw).filter(([key,v])=>{if(hay.includes(normalize(v)))return true;warnings.push(`Dato non riscontrato testualmente, lasciato vuoto: ${key}`);return false;}));
 if(!Object.keys(data).length)return null;
 const field=value=>{if(!value||hay.includes(normalize(value)))return value;warnings.push('Titolare o identificativo non riscontrato: da completare');return '';};
 return{...proposal,data,entity_name:field(proposal.entity_name),entity_tax_id:field(proposal.entity_tax_id),citation,warnings:[...warnings,'Proposta AI: confrontare ogni dato con la fonte prima di salvare e revisionare.']};
}
