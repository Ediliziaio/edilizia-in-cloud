vi.mock("../../../supabase/functions/_shared/silvioActorRole.ts",()=>({toolActorRoleIsCurrent:async()=>true}));
import {describe,it,expect,vi} from 'vitest';
import {applyStaffScope,type StaffScope,executeToolWithRouting} from '../../../supabase/functions/_shared/silvioToolExecution';
import {silvioDataPermissionIssue,silvioQuestionPermissionIssue} from '../../../supabase/functions/_shared/silvioDataPermission';
import {SILVIO_TOOLS,getToolsForChannel,type ToolContext,type SilvioTool} from '../../../supabase/functions/_shared/silvioTools';
const scope:StaffScope={codiciConsentiti:new Set(),idConsentiti:new Set(),commesseRistrette:false,nascondiImporti:true,nascondiMargini:true,nascondiCosti:false,nascondiPersonale:true,nascondiIncassi:false};
describe('Silvio applica i permessi dei dati',()=>{
 it.each(['Mostrami gli stipendi','Quanto abbiamo incassato?','Quali sono i margini?','Mostrami tutti i costi'])('nega senza permesso: %s',q=>expect(silvioQuestionPermissionIssue(q,{})).toBeTruthy());
 it('lo stato incassi è separato dagli importi',()=>{expect(silvioQuestionPermissionIssue('Il cliente ha pagato?',{can_view_order_payment_status:true})).toBeNull();expect(silvioQuestionPermissionIssue('Quanto ha pagato?',{can_view_order_payment_status:true})).toBeTruthy()});
 it('consente costo aggregato senza venduto, margini e dati individuali',()=>{
 const output=applyStaffScope({total_amount:10000,costo_personale_aggregato:350,margine:7650,persone:[{employee_id:'x',ore:10,costo:350,hourly_rate:35,notes:'Retribuzione'}]},scope,'cantiere');const s=JSON.stringify(output);expect(s).not.toContain('10000');expect(s).not.toContain('7650');expect(s).not.toContain('hourly_rate":35');expect(s).not.toContain('"costo":350');expect(output).toMatchObject({costo_personale_aggregato:350});
 });
 it('non limita le commesse usando il flag CRM',()=>expect(applyStaffScope([{order_id:'other',description:'Commessa ufficio'}],scope,'cantiere')).toEqual([{order_id:'other',description:'Commessa ufficio'}]));
 it('i dati riservati non rientrano da testo libero o URL firmati',()=>{const out=applyStaffScope({note:'Retribuzione Mario 3000 euro',file:'https://example.test/storage/v1/object/sign/bucket/file?token=secret'},scope,'cantiere');expect(JSON.stringify(out)).not.toContain('3000');expect(JSON.stringify(out)).not.toContain('secret')});
 it('un lettore di commesse non può eseguire modifiche',()=>expect(silvioDataPermissionIssue('aggiorna_commessa','cantiere',{can_view_orders:true},true)).toBeTruthy());
 it('leggere contatti non concede l’esportazione CSV',()=>expect(silvioDataPermissionIssue('export_contacts','crm',{can_view_marketing_contacts:true})).toBeTruthy());
 it('nega il margine prima di interrogare i dati',()=>expect(silvioDataPermissionIssue('get_marginalita_commesse','cantiere',{})).toBeTruthy());
 it('nega ricerche trasversali non verificabili',()=>expect(silvioDataPermissionIssue('universal_search','knowledge',{})).toBeTruthy());
 it('un aggregato CRM senza filtro assegnatario non aggira il portafoglio',()=>expect(silvioDataPermissionIssue('get_pipeline_forecast','crm',{only_assigned:true})).toBeTruthy());
 it('un aggregato CRM non concede dati di moduli spenti',()=>expect(silvioDataPermissionIssue('get_top_customers','crm',{can_view_order_amounts:true,can_view_marketing_opportunities:true})).toBeTruthy());
 it('gli strumenti CRM verificati rimangono disponibili' ,()=>expect(silvioDataPermissionIssue('cerca_contatti_autorizzati','crm',{only_assigned:true,can_view_marketing_contacts:true})).toBeNull());
 it('rilegge i permessi revocati prima di eseguire, anche con cache permissiva',async()=>{
 const name='__office_permission_probe';let calls=0;
 SILVIO_TOOLS[name]={schema:{type:'function',function:{name,description:'probe',parameters:{type:'object',properties:{}}}},domain:'cantiere',riskLevel:'safe',allowedRoles:['company_staff'],executor:async()=>{calls++;return {total_amount:9999}}} as SilvioTool;
 const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{can_view_orders:false},error:null})};
 try{const result=await executeToolWithRouting(name,{}, {supabase:{from:(t:string)=>t==='tool_execution_log'?{insert:async()=>({error:null})}:t==='profiles'?(()=>{const a={select:()=>a,eq:()=>a,maybeSingle:async()=>({data:{id:'u',is_blocked:false},error:null})};return a})():q},companyId:'c',userId:'u',primaryRole:'company_staff',channel:'internal_chat',staffPermissions:{can_view_orders:true}} as unknown as ToolContext);expect(result.success).toBe(false);expect(calls).toBe(0);}finally{delete SILVIO_TOOLS[name]}
 });
 it('il catalogo usa il permesso CRM granulare anche con il vecchio flag generale spento',()=>{
  const tools=getToolsForChannel({channel:'internal_chat',role:'salesperson',staffPermissions:{can_view_marketing:false,can_view_marketing_contacts:true,only_assigned:true}});
  expect(tools).toContain(SILVIO_TOOLS.cerca_contatti_autorizzati);
  expect(tools).not.toContain(SILVIO_TOOLS.cerca_opportunita_autorizzate);
 });
 it.each([{id:'u',is_blocked:true},null])('nega un attore bloccato o mancante prima di interrogare i dati: %j',async actor=>{
  const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:actor,error:null})};
  const result=await executeToolWithRouting('get_orders_summary',{}, {supabase:{from:()=>q},companyId:'c',userId:'u',primaryRole:'company_staff'} as unknown as ToolContext);
  expect(result.success).toBe(false);expect(result.error?.code).toBe('actor_unavailable');
 });
 it('perimetro ristretto: mantiene la riga autorizzata ma non i totali aziendali',()=>{
  const limited={...scope,commesseRistrette:true,idConsentiti:new Set(['own']),nascondiImporti:false};
  const out=applyStaffScope({commesse:[{order_id:'own',valore_eur:12000},{order_id:'other',valore_eur:10000}],totale_commesse:2,valore_totale_eur:22000,kpi:{margine:7000}},limited,'cantiere') as Record<string,unknown>;
  expect(out.commesse).toEqual([{order_id:'own',valore_eur:12000}]);expect(out.totale_commesse).not.toBe(2);expect(out.valore_totale_eur).not.toBe(22000);expect(JSON.stringify(out)).not.toContain('7000');
 });
 it('il solo stato incassi permette booleani, non importi né testo finanziario arbitrario',()=>{
  const out=applyStaffScope({incassata_tutta:false,is_paid:true,da_incassare_eur:3000,stato_pagamento:'pagato 3000 euro'},scope,'cantiere') as Record<string,unknown>;
  expect(out.incassata_tutta).toBe(false);expect(out.is_paid).toBe(true);expect(JSON.stringify(out)).not.toContain('3000');
 });
});
