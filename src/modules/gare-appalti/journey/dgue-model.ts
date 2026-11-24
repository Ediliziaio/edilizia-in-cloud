export type DgueAnswer=string|{value?:string;currency?:string;unit?:string;start?:string;end?:string;scheme_id?:string;list_id?:string;list_agency?:string;list_version?:string;values?:string;url?:string;issuer?:string;reference?:string};
export interface DgueQuestion{id:string;label:string;criterion:string;criterion_id:string;criterion_description?:string;group_key:string;type:string;supported:boolean;conditions:{id:string;value:string}[];condition?:string}
export interface DgueGroup{key:string;criterion:string;criterion_id:string;question_ids:string[];repeatable:boolean;instructions:string[]}
export interface DgueDraft{document_id:string;created_at:string;identity:DgueIdentity;answers:Record<string,DgueAnswer>;repetitions?:Record<string,Record<string,DgueAnswer>[]>;lot_ids:string[]}
export interface DgueIdentity{name:string;tax_id:string;signer:string;country:string}
export interface DgueRequest{drafts?:DgueDraft[];document_id:string;request_id:string;profile:string;ubl_version:string;questions:DgueQuestion[];groups:DgueGroup[];lots:{id:string;label:string}[];warnings:string[];can_generate:boolean;request_xsd:boolean}
export const answerText=(a:DgueAnswer|undefined)=>typeof a==='string'?a:a?.value||'';
export function questionState(q:DgueQuestion,answers:Record<string,DgueAnswer>):'active'|'inactive'|'pending'{let pending=false;for(const c of q.conditions||[]){const value=answerText(answers[c.id]);if(!['true','false'].includes(value))pending=true;else if(value!==c.value)return'inactive';}return pending?'pending':'active';}
export function hasAnswer(a:DgueAnswer|undefined){return typeof a==='string'?!!a.trim()&&a!=='NOT_APPLICABLE':!!a&&Object.values(a).some(v=>v?.trim());}
export function answerComplete(q:DgueQuestion,a:DgueAnswer|undefined){
 if(!hasAnswer(a))return false;
 const data=typeof a==='object'?a:{value:a||''};const value=answerText(a).trim();
 const all=(keys:string[])=>keys.every(k=>!!data[k as keyof typeof data]?.trim());
 if(q.type==='PERIOD')return all(['start','end']);if(q.type==='EVIDENCE_IDENTIFIER')return all(['url','issuer','reference']);if(q.type==='LOT_IDENTIFIER')return !!data.values?.trim()||!!value;
 if(q.type==='AMOUNT')return all(['value','currency']);if(q.type==='CODE')return all(['value','list_id','list_agency','list_version']);if(['IDENTIFIER','ECONOMIC_OPERATOR_IDENTIFIER'].includes(q.type)&&typeof a==='object')return all(['value','scheme_id']);if(['QUANTITY_INTEGER','QUANTITY_YEAR'].includes(q.type)&&typeof a==='object')return all(['value','unit']);return !!value&&value!=='NOT_APPLICABLE';
}
