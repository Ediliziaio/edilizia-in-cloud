import { evidenceValidAt } from './domain';
import type { Evidence,Participation,Stage } from './types';

export const pipelineStages=[
 {id:'in_valutazione',label:'Valutazione',color:'#5485bd'},
 {id:'in_preparazione',label:'Preparazione',color:'#e99837'},
 {id:'in_revisione',label:'Revisione',color:'#8d75bf'},
 {id:'pronta',label:'Pronte',color:'#34866b'},
 {id:'presentata',label:'Presentate',color:'#3b91a5'},
] as const;
export const concludedStages:Stage[]=['esito','ritirata','non_partecipare'];
export const stageCount=(rows:Participation[],stage:Stage)=>rows.filter(p=>p.stage===stage).length;
export function afterDays(date:string,days:number){
 const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function upcomingDate(date:string,today:string,days:number){return date>=today&&date<=afterDays(today,days);}
export function evidenceState(e:Evidence,today:string){
 if(e.status==='non_applicabile')return 'non_applicabile';
 return !!e.verified_on&&evidenceValidAt(e.status,e.expires_on,e.verified_on,today)?'valida':'da_verificare';
}
export function evidenceExpiring(e:Evidence,today:string){return evidenceState(e,today)==='valida'&&!!e.expires_on&&upcomingDate(e.expires_on,today,30);}
