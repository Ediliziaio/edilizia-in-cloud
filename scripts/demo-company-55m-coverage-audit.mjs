/** Read-only, tenant-wide coverage. Planned jobs are not invented executed work. */
import { C, q, sql, save, guard } from './demo-company-55m.mjs';
guard();
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const rows=sql(`select o.id,o.order_code,o.total_amount,o.customer_id,o.quote_id,
  o.work_start_date,o.work_end_date,o.percentuale_avanzamento,s.name status,
  (select count(*) from order_work_phases p where p.order_id=o.id) phases,
  (select count(*) from order_work_phases p where p.order_id=o.id and p.percentuale>0) advanced_phases,
  (select count(*) from campo_rapportini r where r.order_id=o.id and r.company_id=o.company_id) reports,
  (select count(*) from order_employees e where e.order_id=o.id) employees,
  (select count(*) from order_external_teams e where e.order_id=o.id) teams,
  (select count(*) from order_acceptance_reports a where a.order_id=o.id and a.company_id=o.company_id) acceptance,
  (select count(*) from purchase_orders p where p.order_id=o.id and p.company_id=o.company_id) purchase_orders,
  (select count(*) from order_attachments a where a.order_id=o.id) attachments
  from orders o left join order_statuses s on s.id=o.current_status_id
  where o.company_id=${q(C)} and o.deleted_at is null order by o.order_code`);
const [integrity]=sql(`select jsonb_build_object(
  'quoteTenantMismatch',(select count(*) from orders o join quotes d on d.id=o.quote_id where o.company_id=${q(C)} and d.company_id<>o.company_id),
  'phaseTenantMismatch',(select count(*) from order_work_phases p join orders o on o.id=p.order_id where o.company_id=${q(C)} and p.company_id<>o.company_id),
  'reportTenantMismatch',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and r.company_id<>o.company_id),
  'employeeTenantMismatch',(select count(*) from order_employees x join orders o on o.id=x.order_id join employees e on e.id=x.employee_id where o.company_id=${q(C)} and e.company_id<>o.company_id),
  'teamTenantMismatch',(select count(*) from order_external_teams x join orders o on o.id=x.order_id join external_teams e on e.id=x.external_team_id where o.company_id=${q(C)} and e.company_id<>o.company_id),
  'purchaseTenantMismatch',(select count(*) from purchase_orders p join orders o on o.id=p.order_id join suppliers s on s.id=p.supplier_id where o.company_id=${q(C)} and (p.company_id<>o.company_id or s.company_id<>o.company_id)),
  'nativeRateTenantMismatch',(select count(*) from order_installments r join orders o on o.id=r.order_id join documenti_fiscali d on d.id=r.documento_fiscale_id where o.company_id=${q(C)} and d.company_id<>o.company_id),
  'legacyRateTenantMismatch',(select count(*) from order_installments r join orders o on o.id=r.order_id join invoices d on d.id=r.invoice_id where o.company_id=${q(C)} and d.company_id<>o.company_id),
  'employeePhaseMismatch',(select count(*) from order_employees e join orders o on o.id=e.order_id join order_work_phases p on p.id=e.phase_id where o.company_id=${q(C)} and p.order_id<>e.order_id),
  'teamPhaseMismatch',(select count(*) from order_external_teams e join orders o on o.id=e.order_id join order_work_phases p on p.id=e.phase_id where o.company_id=${q(C)} and p.order_id<>e.order_id),
  'reportPhaseMismatch',(select count(*) from campo_rapportini r cross join lateral jsonb_array_elements(coalesce(r.fasi_lavorate,'[]'::jsonb)) f left join order_work_phases p on p.id::text=f->>'fase_id' where r.company_id=${q(C)} and nullif(f->>'fase_id','') is not null and (p.id is null or p.order_id<>r.order_id or p.company_id<>r.company_id)),
  'materialPhaseMismatch',(select count(*) from campo_rapportini r cross join lateral jsonb_array_elements(coalesce(r.materiali_usati,'[]'::jsonb)) m left join order_work_phases p on p.id::text=m->>'fase_id' where r.company_id=${q(C)} and nullif(m->>'fase_id','') is not null and (p.id is null or p.order_id<>r.order_id or p.company_id<>r.company_id)),
  'materialStockMismatch',(select count(*) from campo_rapportini r cross join lateral jsonb_array_elements(coalesce(r.materiali_usati,'[]'::jsonb)) m left join warehouse_stock s on s.id::text=m->>'stock_item_id' where r.company_id=${q(C)} and nullif(m->>'stock_item_id','') is not null and (s.id is null or s.company_id<>r.company_id)),
  'materialOrderItemMismatch',(select count(*) from campo_rapportini r cross join lateral jsonb_array_elements(coalesce(r.materiali_usati,'[]'::jsonb)) m left join order_items i on i.id::text=m->>'order_item_id' where r.company_id=${q(C)} and nullif(m->>'order_item_id','') is not null and (i.id is null or i.order_id<>r.order_id))
  ) data`);
const issues=[],warnings=[],notRequired=[];
for(const row of rows){
  // Explicit technical, zero-value window fixture: do not assign fake crews/costs.
  if(row.order_code==='ORD-2026-WND-TEST-001'&&Number(row.total_amount)===0){
    notRequired.push({code:row.order_code,reason:'Commessa tecnica del configuratore, senza valore economico.'});continue;
  }
  for(const key of ['customer_id','quote_id','work_start_date','work_end_date'])if(!row[key])issues.push({code:row.order_code,reason:`Manca ${key}`});
  if(row.work_start_date&&row.work_end_date&&row.work_end_date<row.work_start_date)issues.push({code:row.order_code,reason:'Fine lavori precedente all’inizio.'});
  if(!row.phases||(!row.employees&&!row.teams)||!row.purchase_orders)issues.push({code:row.order_code,reason:'Mancano fasi, squadra o acquisti collegati.'});
  if(!row.reports){
    if(Number(row.percentuale_avanzamento)>0||row.advanced_phases)issues.push({code:row.order_code,reason:'Lavori avanzati senza rapportini.'});
    else{
      notRequired.push({code:row.order_code,reason:'Nessuna fase avanzata: non simulare lavori eseguiti o ore consuntive.'});
      if(row.work_end_date&&row.work_end_date<today)warnings.push({code:row.order_code,reason:'Pianificazione scaduta ma nessun lavoro avviato; mantenuta come scenario di ritardo da riprogrammare.'});
    }
  }
  if(Number(row.percentuale_avanzamento)>=100&&!row.acceptance)issues.push({code:row.order_code,reason:'Lavori completi senza collaudo.'});
}
for(const [name,count]of Object.entries(integrity.data))if(Number(count))issues.push({code:'integrity',reason:name,count});
const result={company:C,checkedAt:new Date().toISOString(),readOnly:true,jobs:rows.length,
  financialJobs:rows.filter(r=>Number(r.total_amount)>0).length,issues,warnings,notRequired,
  tenantAndPhaseIntegrity:integrity.data,rows};
save('tenant-wide-coverage-verified',result);
console.log({jobs:result.jobs,financialJobs:result.financialJobs,issues:issues.length,
  planningWarnings:warnings.length,notRequired: notRequired.length,tenantAndPhaseIntegrity:integrity.data});
if(issues.length){console.error(issues);process.exitCode=1;}
