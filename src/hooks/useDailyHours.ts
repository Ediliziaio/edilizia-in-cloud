import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { refreshWorkQueries } from '@/lib/orders/refreshWorkQueries';
import { assertDailyHoursCompany, dailyHoursLines, type DailyHoursPerson, type DailyHoursOrder, type DailyHoursRecord } from '@/lib/orders/dailyHours';
import { finestreAnnuali } from '@/lib/orders/orePersone';
import { oggiRoma } from '@/hooks/useOperai';

/** Una lettura di `ufficio_leggi_ore`: una finestra di al massimo un anno. */
type EsitoOre={data:{company_id?:string;pending?:number;records?:DailyHoursRecord[]}|null;error:{message:string}|null};

/** `periodo`: da/a espliciti (es. tutta la commessa); senza, il mese scelto con setMonth. */
export function useDailyHours(orderId?:string, periodo?:{da:string;a:string}) {
 const { effectiveCompany, role }=useAuth(); const p=usePermissions(); const qc=useQueryClient();
 const companyId=effectiveCompany?.id;
 const allowed=!!companyId && !p.isLoading && p.canViewOrders && p.canViewEmployees && p.canViewGiornaleLavori;
 const canEdit=allowed && p.canEditOrders && ['super_admin','company_admin','company_staff'].includes(role ?? '');
 const [month,setMonth]=useState(oggiRoma().slice(0,7));
 const query=useQuery({queryKey:['daily-hours',companyId,orderId,periodo?`${periodo.da}..${periodo.a}`:month,p.canViewCosts],enabled:allowed,queryFn:async()=>{
  const start=periodo?.da??month+'-01'; const end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  const stop=periodo?.a??`${month}-${end}`;
  // `ufficio_leggi_ore` non legge più di un anno per volta: un periodo più lungo (una commessa
  // aperta da anni) si legge a finestre di un anno e i rapportini si uniscono. Prima il chiamante
  // tagliava il periodo a 12 mesi e il resto della commessa spariva senza dirlo.
  const reports=(async():Promise<EsitoOre>=>{
   const finestre=finestreAnnuali(start,stop);
   const esiti:EsitoOre[]=await Promise.all((finestre.length?finestre:[{da:start,a:stop}]).map(f=>(supabase as any).rpc('ufficio_leggi_ore',{p_order_id:orderId??null,p_da:f.da,p_a:f.a,p_solo_riepilogo:false}) as Promise<EsitoOre>));
   const fallita=esiti.find(e=>e.error);
   if(fallita) return {data:null,error:fallita.error};
   for(const e of esiti) assertDailyHoursCompany(e.data,companyId!);
   const prima=esiti[0]?.data??null;
   return {data:prima?{...prima,records:esiti.flatMap(e=>e.data?.records??[])}:null,error:null};
  })();
  let jobsQuery=supabase.from('orders').select('id,order_code,description').eq('company_id',companyId!).is('deleted_at',null).order('created_at',{ascending:false}).limit(1000);
  if(orderId)jobsQuery=jobsQuery.eq('id',orderId);
  const [people,jobs,rows]=await Promise.all([
   supabase.from('employees').select('id,user_id,first_name,last_name,is_active,ore_settimana').eq('company_id',companyId!).order('first_name').limit(1000),
   jobsQuery,reports]);
  if(people.error) throw people.error;if(jobs.error) throw jobs.error;if(rows.error) throw rows.error;
  assertDailyHoursCompany(rows.data,companyId!);
  if([people.data,jobs.data].some(r=>(r?.length??0)>=1000)) throw new Error('Troppi risultati: restringi il periodo o apri la singola commessa.');
  const normalized=(rows.data?.records??[]).map((row: DailyHoursRecord & {user_id:string|null;ore_lavorate:number|null;ore_straordinario:number|null})=>{
   if(Array.isArray(row.presenze)&&row.presenze.length)return row;
   const employee=(people.data??[]).find(e=>!!row.user_id&&e.user_id===row.user_id);
   return employee?{...row,presenze:[{employee_id:employee.id,ore:Number(row.ore_lavorate??0)+Number(row.ore_straordinario??0)}]}:row;
  });
  const employees=(people.data??[]).map(e=>({id:e.id,userId:e.user_id,name:[e.first_name,e.last_name].filter(Boolean).join(' '),active:e.is_active,weeklyHours:e.ore_settimana}));
  return {people:employees as DailyHoursPerson[],activePeople:employees.filter(e=>e.active) as DailyHoursPerson[],orders:(jobs.data??[]).map(o=>({id:o.id,name:[o.order_code,o.description].filter(Boolean).join(' · ')})) as DailyHoursOrder[],lines:dailyHoursLines(normalized)};
 }});
 const refresh=async(id?:string)=>{if(id)refreshWorkQueries(qc,id,companyId); await Promise.all(['daily-hours','hr-labor-reconciliation','hr-giornate'].map(k=>qc.invalidateQueries({queryKey:[k]})));};
 return {allowed,canEdit,showCosts:p.canViewCosts,companyId,month,setMonth,loading:query.isPending,error:query.error?.message??null,data:query.data,retry:()=>{void query.refetch();},
  save:async(input:{requestId:string;orderId:string;employeeId:string;day:string;hours:number;note:string})=>{
   if(!canEdit)throw new Error('Non hai il permesso di registrare ore.');
   const {data,error}=await (supabase as any).rpc('ufficio_registra_ore',{p_request_id:input.requestId,p_order_id:input.orderId,p_employee_id:input.employeeId,p_giorno:input.day,p_ore:input.hours,p_note:input.note});
   if(error)throw new Error(error.message);await refresh(input.orderId);return data as {id:string;stato:string;da_valorizzare:boolean};
  },cancel:async(id:string,updatedAt:string,jobId:string)=>{
   if(!canEdit)throw new Error('Non hai il permesso di annullare ore.');
   const {error}=await (supabase as any).rpc('ufficio_annulla_ore',{p_id:id,p_updated_at:updatedAt});if(error)throw new Error(error.message);await refresh(jobId);
  }};
}
export type DailyHoursController=ReturnType<typeof useDailyHours>;
