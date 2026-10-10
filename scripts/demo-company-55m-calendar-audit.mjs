/** Read-only calendar and operational completeness audit, including every month. */
import { C,q,sql,save,guard } from './demo-company-55m.mjs';
guard();
const annual = "o.order_code like 'DEMO-2025-%' and o.deleted_at is null";
const months=sql(`with months as (select d::date start,(d+interval '1 month')::date finish from generate_series('2025-01-01'::date,'2025-12-01'::date,interval '1 month')d)
select to_char(m.start,'YYYY-MM') as "month",
 (select count(*) from orders o where o.company_id=${q(C)} and ${annual} and o.work_start_date<m.finish and o.work_end_date>=m.start) active_jobs,
 (select count(*) from campo_rapportini r join orders o on o.id=r.order_id where r.company_id=${q(C)} and ${annual} and r.data_lavoro>=m.start and r.data_lavoro<m.finish) reports,
 (select count(*) from appointments a join orders o on o.id=a.order_id where a.company_id=${q(C)} and ${annual} and a.appointment_date>=m.start and a.appointment_date<m.finish) appointments,
 (select count(*) from documenti_fiscali d where d.company_id=${q(C)} and d.tipo='fattura' and d.deleted_at is null and d.stato not in ('bozza','annullata','stornata') and d.data_emissione>=m.start and d.data_emissione<m.finish) invoices,
 (select coalesce(sum(d.imponibile_totale),0) from documenti_fiscali d where d.company_id=${q(C)} and d.tipo='fattura' and d.deleted_at is null and d.stato not in ('bozza','annullata','stornata') and d.data_emissione>=m.start and d.data_emissione<m.finish) invoiced_net,
 (select count(*) from hr_cedolini h where h.company_id=${q(C)} and h.anno=2025 and h.mese=extract(month from m.start)) payrolls,
 (select count(*) from hr_timbrature h where h.company_id=${q(C)} and h.data_evento>=m.start and h.data_evento<m.finish) punches
 from months m order by m.start`);
const [integrity]=sql(`select jsonb_build_object(
 'annualJobs',(select count(*) from orders o where o.company_id=${q(C)} and ${annual}),
 'annualPhases',(select count(*) from order_work_phases p join orders o on o.id=p.order_id where o.company_id=${q(C)} and ${annual}),
 'annualReports',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and ${annual}),
 'annualDatesReversed',(select count(*) from orders o where o.company_id=${q(C)} and ${annual} and o.work_start_date>o.work_end_date),
 'phasesOutsideJob',(select count(*) from order_work_phases p join orders o on o.id=p.order_id where o.company_id=${q(C)} and o.deleted_at is null and (p.start_date<o.work_start_date or p.end_date>o.work_end_date or p.start_date>p.end_date)),
 'reportsOutsideJob',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and o.deleted_at is null and (r.data_lavoro<o.work_start_date or r.data_lavoro>o.work_end_date)),
 'annualReportsOutsidePhase',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id cross join lateral jsonb_array_elements(coalesce(r.fasi_lavorate,'[]'::jsonb))f join order_work_phases p on p.id::text=f->>'fase_id' where o.company_id=${q(C)} and ${annual} and (r.data_lavoro<p.start_date or r.data_lavoro>p.end_date)),
 'annualWeekendReports',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and ${annual} and extract(isodow from r.data_lavoro)>5),
 'annualHolidayReports',(select count(*) from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and ${annual} and r.data_lavoro in ('2025-01-01','2025-01-06','2025-04-21','2025-04-25','2025-05-01','2025-06-02','2025-08-15','2025-11-01','2025-12-08','2025-12-25','2025-12-26')),
 'ddtBeforeOrder',(select count(*) from ddt_ricezione d join purchase_orders p on p.id=d.purchase_order_id join orders o on o.id=p.order_id where o.company_id=${q(C)} and ${annual} and d.data_ricezione::date<p.issue_date),
 'activeOldPlanningTasks',(select count(*) from tasks t join orders o on o.id=t.order_id where o.company_id=${q(C)} and o.deleted_at is not null and t.status='da_fare'),
 'oldPendingAppointments',(select count(*) from appointments a join orders o on o.id=a.order_id where o.company_id=${q(C)} and o.deleted_at is not null and not a.is_completed and a.status not in ('annullato','cancelled'))
 ) data`);
const issues=[];
for(const key of ['annualDatesReversed','phasesOutsideJob','reportsOutsideJob','annualReportsOutsidePhase','annualWeekendReports','annualHolidayReports','ddtBeforeOrder'])if(Number(integrity.data[key]))issues.push({key,count:integrity.data[key]});
for(const m of months)for(const key of ['active_jobs','reports','appointments','invoices','payrolls','punches'])if(!Number(m[key]))issues.push({month:m.month,key,reason:'Month has no evidence'});
const result={company:C,checkedAt:new Date().toISOString(),exercise:2025,months,integrity:integrity.data,issues};
save('annual-calendar-verified',result);
console.table(months);console.log({integrity:result.integrity,issues});
if(issues.length)process.exitCode=1;
