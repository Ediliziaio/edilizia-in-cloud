import {beforeAll,afterAll,describe,it,expect}from'vitest';
import {createClient}from'@supabase/supabase-js';
import {createHmac}from'node:crypto';
import {writeFileSync}from'node:fs';
import {assertLocalFixture,sql,companyId,userId,orderId}from'./backend.mjs';
import {executeToolWithRouting}from'../../supabase/functions/_shared/silvioToolExecution';
import {silvioQuestionPermissionIssue}from'../../supabase/functions/_shared/silvioDataPermission';
import type{ToolContext}from'../../supabase/functions/_shared/silvioTools';
const nums=[1,2,3,4,5,6,7,8,10,11,12,13,14];
const reports:unknown[]=[];
const tokens=new Map<number,string>();
const encode=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');const b=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',exp:4102444800});const key=b+'.'+createHmac('sha256','local-permissions-fixture-only-secret-20261111').update(b).digest('base64url');
const client=createClient('http://127.0.0.1:5189',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>{if(new URL(String(url)).origin!=='http://127.0.0.1:5189')throw new Error('Only local fixture');return fetch(url,init)}}});
const fixtures=new Map<number,{role:string;permissions:Record<string,unknown>}>();
const cid=(n:number)=>`cb000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
beforeAll(async()=>{
 assertLocalFixture();
 for(const n of nums){const login=createClient('http://127.0.0.1:5189',key,{auth:{persistSession:false,autoRefreshToken:false}});const session=await login.auth.signInWithPassword({email:`u${n}@example.test`,password:'LocalePermessi2026!'});expect(session.error).toBeNull();tokens.set(n,session.data.session!.access_token);const {data:roles,error}=await client.from('user_roles').select('role').eq('user_id',userId(n));expect(error).toBeNull();const {data:permissions}=await client.from('staff_permissions').select('*').eq('user_id',userId(n)).maybeSingle();fixtures.set(n,{role:roles![0].role,permissions:permissions??{}});}
 sql(`begin;set local session_replication_role=replica;${[3,10,11].map(n=>`insert into marketing_contacts(id,company_id,first_name,assigned_to)values('${cid(n)}','${companyId}','CRM integration ${n}','${userId(n)}');`).join('')}commit;`);
});
afterAll(()=>{sql("begin;set local session_replication_role=replica;delete from marketing_contacts where id::text like 'cb000000-%';commit;");writeFileSync('/tmp/eic-allroles-silvio.json',JSON.stringify(reports,null,2));});
function context(n:number):ToolContext {return {supabase:client,companyId,userId:userId(n),primaryRole:fixtures.get(n)!.role,authToken:`Bearer ${tokens.get(n)}`,channel:'internal_chat',personaKey:'silvio'} as unknown as ToolContext;}
describe('strumenti Silvio reali sul database locale',()=>{
 it.each(nums)('utente %i: riepilogo commesse con colonne consentite',async n=>{
  const result=await executeToolWithRouting('get_orders_summary',{status:'all',limit:50},context(n));reports.push({actor:n,tool:'get_orders_summary',result});
  if([10,11].includes(n)){expect(result.success).toBe(false);return;}
  expect(result.success,JSON.stringify(result)).toBe(true);
  const text=JSON.stringify(result.data);
  expect(text).not.toContain('Commessa altra azienda');
  if(![3,4,5,8].includes(n))expect(text).not.toMatch(/"(?:total_amount|importo|deposit_amount)":(?:10000|3000)/);
  if(n===13){expect(text).not.toContain('Commessa condivisa');}
 });
 it.each(nums)('utente %i: ricerca CRM verifica i contatti assegnati nel database',async n=>{
  const result=await executeToolWithRouting('cerca_contatti_autorizzati',{},context(n));reports.push({actor:n,tool:'cerca_contatti_autorizzati',result});
  expect(result.success,JSON.stringify(result)).toBe([3,8,10,11].includes(n));
  if([3,10,11].includes(n)){const rows=(result.data as {records:{assigned_to:string}[]}).records;expect(rows.length).toBeGreaterThan(0);expect(rows.every(r=>r.assigned_to===userId(n))).toBe(true);}
 });
 it.each(nums)('utente %i: blocco domande su stipendi e margini',n=>{
  if(n===8)return;
  const p=fixtures.get(n)!.permissions;
  expect(silvioQuestionPermissionIssue('Mostrami gli stipendi dei dipendenti',p)===null).toBe(n===7);
  expect(silvioQuestionPermissionIssue('Quali sono i margini della commessa?',p)===null).toBe(n===5);
 });
 it('la revoca viene riletta prima di eseguire, anche con i permessi precedenti in cache',async()=>{
  sql(`update staff_permissions set can_view_marketing_contacts=false where user_id='${userId(10)}'`);
  try{const result=await executeToolWithRouting('cerca_contatti_autorizzati',{}, {...context(10),staffPermissions:{can_view_marketing_contacts:true}});expect(result.success).toBe(false);reports.push({actor:10,scenario:'revoca',result});}
  finally{const {error}=await client.from('staff_permissions').update(fixtures.get(10)!.permissions).eq('user_id',userId(10));expect(error).toBeNull();}
 });
 it('non permette modifica commesse a sola lettura o lettori senza modifica',async()=>{
  for(const n of [3,4,5,7,14]){const result=await executeToolWithRouting('aggiorna_stato_commessa',{commessa_codice:'PROVA',nuovo_stato:'Non eseguire'},context(n));expect(result.success).toBe(false);expect(result.proposalId).toBeUndefined();reports.push({actor:n,scenario:'modifica negata',result});}
 });
 it('un utente bloccato non interroga il CRM con un contesto ancora valido',async()=>{
  sql(`update profiles set is_blocked=true where id='${userId(10)}'`);
  try{const result=await executeToolWithRouting('cerca_contatti_autorizzati',{},context(10));reports.push({actor:10,scenario:'utente bloccato',result});expect(result.success).toBe(false);}
  finally{sql(`update profiles set is_blocked=false where id='${userId(10)}'`);}
 });
 it('le opportunità rispettano anche le pipeline consentite, non solo l’assegnatario',async()=>{
  const pipeline=(n:number)=>`cc000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  const stage=(n:number)=>`cd000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  const opportunity=(n:number)=>`ce000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
  try{
   sql(`begin;set local session_replication_role=replica;${[1,2].map(n=>`insert into marketing_pipelines(id,company_id,name)values('${pipeline(n)}','${companyId}','Pipeline simulazione ${n}');insert into marketing_pipeline_stages(id,pipeline_id,company_id,name)values('${stage(n)}','${pipeline(n)}','${companyId}','Nuova');insert into marketing_opportunities(id,company_id,contact_id,pipeline_id,stage_id,name,assigned_to)values('${opportunity(n)}','${companyId}','${cid(10)}','${pipeline(n)}','${stage(n)}','Opportunità pipeline ${n}','${userId(10)}');`).join('')}update staff_permissions set pipeline_visibili=array['${pipeline(1)}'::uuid] where user_id='${userId(10)}';commit;`);
   const result=await executeToolWithRouting('cerca_opportunita_autorizzate',{},context(10));reports.push({actor:10,scenario:'pipeline consentite',result});
   expect(result.success).toBe(true);expect((result.data as {records:{id:string}[]}).records.map(r=>r.id)).toEqual([opportunity(1)]);
  }finally{sql(`begin;set local session_replication_role=replica;delete from marketing_opportunities where id::text like 'ce000000-%';delete from marketing_pipeline_stages where id::text like 'cd000000-%';delete from marketing_pipelines where id::text like 'cc000000-%';update staff_permissions set pipeline_visibili='{}' where user_id='${userId(10)}';commit;`);}
 });
 it('solo stato incassi non espone importi nel report autorizzato',async()=>{
  const result=await executeToolWithRouting('report_commessa',{commessa_codice:orderId},context(1));expect(result.success,JSON.stringify(result)).toBe(true);
  const data=result.data as {commessa:{total_amount:unknown};stato_incassi:{status:string}};expect(data.commessa.total_amount).toBeNull();expect(data.stato_incassi.status).toBe('rate_incassate');
 });
 it('un magazzino limitato con importi consentiti non ottiene i totali aziendali',async()=>{
  sql(`update staff_permissions set can_view_order_amounts=true where user_id='${userId(13)}'`);
  try{const result=await executeToolWithRouting('get_orders_summary',{status:'all'},context(13));reports.push({actor:13,scenario:'totali limitati al perimetro',result});expect(result.success).toBe(true);
   const data=result.data as {commesse:{total_amount:number}[];valore_totale_eur:unknown;totale_commesse:unknown};
   expect(data.commesse).toHaveLength(1);expect(data.commesse[0].total_amount).toBe(12000);expect(data.valore_totale_eur).not.toBe(22000);expect(data.totale_commesse).not.toBe(2);
  }finally{sql(`update staff_permissions set can_view_order_amounts=false where user_id='${userId(13)}'`);}
 });
 it.each(['commesse','economia','incassi','personale','contatti','opportunita','fatture','fornitori','calendario','attivita','documenti'])('letture native per area: %s',async area=>{
  const result=await executeToolWithRouting('leggi_dati_autorizzati',{area,commessa_codice:orderId},context(8));expect(result.success,JSON.stringify(result)).toBe(true);
 });
 it('sessione di un altro utente non può essere riutilizzata nel contesto tecnico',async()=>{
  const result=await executeToolWithRouting('get_orders_summary',{}, {...context(1),authToken:`Bearer ${tokens.get(10)}`});expect(result.success).toBe(false);expect(result.error?.code).toBe('session_required');
 });
 it('ruolo amministratore inventato viene respinto anche con token reale',async()=>{
  const result=await executeToolWithRouting('get_orders_summary',{}, {...context(1),primaryRole:'company_admin'});expect(result.success).toBe(false);expect(result.error?.code).toBe('forbidden_actor');
 });
 it('lettore generico non aggira la categoria personale',async()=>{
  const result=await executeToolWithRouting('leggi_dati_autorizzati',{area:'personale'},context(1));expect(result.success).toBe(false);
 });
 it('modifica CRM autorizzata richiede conferma e non cambia il record prima',async()=>{
  const result=await executeToolWithRouting('modifica_contatto_autorizzato',{id:cid(10),modifiche:{first_name:'Prova conferma'}},context(10));expect(result.success,JSON.stringify(result)).toBe(true);expect(result.proposalId).toBeTruthy();
  expect(sql(`select first_name from marketing_contacts where id='${cid(10)}'`).trim()).toBe('CRM integration 10');
 });
 it('HR legge le tariffe individuali, ufficio ordini non le ottiene',async()=>{
  const hr=await executeToolWithRouting('get_team_summary',{},context(7));expect(hr.success,JSON.stringify(hr)).toBe(true);expect(JSON.stringify(hr.data)).toContain('2800');
  const purchasing=await executeToolWithRouting('get_team_summary',{},context(2));expect(purchasing.success).toBe(false);
 });

 it('HR senza costi: anagrafica operativa visibile ma retribuzioni protette anche via REST e PATCH',async()=>{
  const actor=createClient('http://127.0.0.1:5189',key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${tokens.get(7)}`}}});
  const employee='e0000000-0000-4000-a000-000000000001';
  const originalName=sql(`select first_name from employees where id='${employee}'`).trim();
  sql(`update staff_permissions set can_view_costs=false where user_id='${userId(7)}'`);
  try{
   const raw=await actor.from('employees').select('id,gross_salary,costo_orario');expect(raw.error).toBeNull();expect(raw.data).toEqual([]);
   const projected=await actor.from('employees_visibili').select('id,first_name,gross_salary,net_salary,inps_rate,costo_orario,retribuzione_lorda_annua,profilo_costo');expect(projected.error,JSON.stringify(projected.error)).toBeNull();expect(projected.data!.length).toBeGreaterThan(0);
   for(const row of projected.data!)for(const field of ['gross_salary','net_salary','inps_rate','costo_orario','retribuzione_lorda_annua','profilo_costo'])expect(row[field]).toBeNull();
   const team=await executeToolWithRouting('get_team_summary',{},context(7));expect(team.success,JSON.stringify(team)).toBe(true);expect(JSON.stringify(team.data)).not.toContain('2800');
   const updated=await actor.from('employees_visibili').update({first_name:'Anagrafica senza costi',gross_salary:99999}).eq('id',employee).select('id,first_name,gross_salary');expect(updated.error?.code).toBe('42501');
   const admin=createClient('http://127.0.0.1:5189',key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${tokens.get(8)}`}}});
   const permitted=await admin.from('employees_visibili').update({first_name:'Anagrafica amministratore'}).eq('id',employee).select('id,first_name,gross_salary');expect(permitted.error,JSON.stringify(permitted.error)).toBeNull();expect(permitted.data).toHaveLength(1);expect(permitted.data![0].first_name).toBe('Anagrafica amministratore');expect(permitted.data![0].gross_salary).not.toBeNull();
   expect(sql(`select gross_salary from employees where id='${employee}'`).trim()).not.toBe('99999');
  }finally{sql(`update employees set first_name='${originalName.replaceAll("'","''")}' where id='${employee}'`);const {error}=await client.from('staff_permissions').update(fixtures.get(7)!.permissions).eq('user_id',userId(7));expect(error).toBeNull();}
 });
 it('i collegamenti commessa-personale funzionano anche attraverso le viste protette',async()=>{
  const actor=createClient('http://127.0.0.1:5189',key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${tokens.get(8)}`}}});
  const r=await actor.from('order_employees_visibili').select('id,employees_visibili(id,first_name,gross_salary)');expect(r.error,JSON.stringify(r.error)).toBeNull();expect(r.data!.length).toBeGreaterThan(0);
 });

});
