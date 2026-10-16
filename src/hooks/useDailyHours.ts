import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { refreshWorkQueries } from '@/lib/orders/refreshWorkQueries';
import { assertDailyHoursCompany, dailyHoursLines, type DailyHoursPerson, type DailyHoursOrder, type DailyHoursRecord } from '@/lib/orders/dailyHours';
import { oggiRoma } from '@/hooks/useOperai';

export function useDailyHours(orderId?:string) {
 const { effectiveCompany, role }=useAuth(); const p=usePermissions(); const qc=useQueryClient();
 const companyId=effectiveCompany?.id;
 const allowed=!!companyId && !p.isLoading && p.canViewOrders && p.canViewEmployees && p.canViewGiornaleLavori;
 const canEdit=allowed && p.canEditOrders && ['super_admin','company_admin','company_staff'].includes(role ?? '');
 const [month,setMonth]=useState(oggiRoma().slice(0,7));
 const query=useQuery({queryKey:['daily-hours',companyId,orderId,month,p.canViewCosts],enabled:allowed,queryFn:async()=>{
  const start=month+'-01'; const end=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  const reports=(supabase as any).rpc('ufficio_leggi_ore',{p_order_id:orderId??null,p_da:start,p_a:`${month}-${end}`,p_solo_riepilogo:false});
  let jobsQuery=supabase.from('orders').select('id,order_code,description').eq('company_id',companyId!).is('deleted_at',null).order('created_at',{ascending:false}).limit(1000);
  if(orderId)jobsQuery=jobsQuery.eq('id',orderId);
  const [people,jobs,rows]=await Promise.all([
   supabase.from('employees').select('id,user_id,first_name,last_name,is_active').eq('company_id',companyId!).order('first_name').limit(1000),
   jobsQuery,reports]);
  if(people.error) throw people.error;if(jobs.error) throw jobs.error;if(rows.error) throw rows.error;
  assertDailyHoursCompany(rows.data,companyId!);
  if([people.data,jobs.data].some(r=>(r?.length??0)>=1000)) throw new Error('Troppi risultati: restringi il periodo o apri la singola commessa.');
  const normalized=(rows.data?.records??[]).map((row: DailyHoursRecord & {user_id:string|null;ore_lavorate:number|null;ore_straordinario:number|null})=>{
   if(Array.isArray(row.presenze)&&row.presenze.length)return row;
   const employee=(people.data??[]).find(e=>!!row.user_id&&e.user_id===row.user_id);
   return employee?{...row,presenze:[{employee_id:employee.id,ore:Number(row.ore_lavorate??0)+Number(row.ore_straordinario??0)}]}:row;
  });
  const employees=(people.data??[]).map(e=>({id:e.id,name:[e.first_name,e.last_name].filter(Boolean).join(' '),active:e.is_active}));
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
