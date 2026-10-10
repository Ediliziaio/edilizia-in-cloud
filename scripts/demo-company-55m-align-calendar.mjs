/** Expand four legacy demo planning periods to include existing executed days. Never move evidence. */
import { C,q,read,save,sql,guard,context } from './demo-company-55m.mjs';
const mode=process.argv[2]??'prepare';
guard();
const financialSql=`select jsonb_build_object(
 'fiscal',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from documenti_fiscali r where company_id=${q(C)}),
 'cash',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from prima_nota_entries r where company_id=${q(C)}),
 'dues',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from scadenze r where company_id=${q(C)}),
 'rates',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from order_installments r join orders o on o.id=r.order_id where o.company_id=${q(C)}),
 'reports',(select md5(jsonb_agg(to_jsonb(r) order by r.id)::text) from campo_rapportini r where company_id=${q(C)}),
 'margins',(select md5(jsonb_agg(jsonb_build_object('id',id,'consuntivo',consuntivo) order by id)::text) from v_ordine_marginalita where company_id=${q(C)})
 ) data`;
if(mode==='prepare'){
  const before=read('calendar-jobs-before');
  const codes=['ORD-2026-005','ORD-2026-026','ORD-DEM-SR04','ORD-DEM-SR05'];
  if(before.length!==4||before.some(r=>r.company_id!==C||!codes.includes(r.order_code)))throw Error('Exact demo targets required');
  const jobs=sql(`select o.id,o.order_code,least(o.work_start_date,min(r.data_lavoro)) start,greatest(o.work_end_date,max(r.data_lavoro)) finish
    from orders o join campo_rapportini r on r.order_id=o.id and r.company_id=o.company_id
    where o.company_id=${q(C)} and o.id in(${before.map(r=>q(r.id)).join(',')}) and o.deleted_at is null group by o.id`);
  const statements=[];
  for(const job of jobs){
    const old=before.find(r=>r.id===job.id);
    statements.push(`do $$begin if not exists(select 1 from orders where company_id=${q(C)} and id=${q(job.id)} and version=${q(old.version)} and updated_at=${q(old.updated_at)} and deleted_at is null) then raise exception 'Calendar target changed';end if;end $$;`,
      `update orders set work_start_date=${q(job.start)},work_end_date=${q(job.finish)},internal_notes=concat_ws(E'\n',nullif(internal_notes,''),'[DEMO CALENDAR 2026-10-10] Periodo allineato alle giornate dei rapportini esistenti. Nessuna ora o evidenza spostata; scadenza promessa conservata.') where id=${q(job.id)} and company_id=${q(C)};`);
  }
  save('calendar-alignment-plan',{company:C,jobs,statements,financial:sql(financialSql)[0].data});
  console.table(jobs);
}else if(mode==='dry'||mode==='apply'){
  const plan=read('calendar-alignment-plan');
  if(plan.company!==C)throw Error('Tenant changed');
  if(JSON.stringify(sql(financialSql)[0].data)!==JSON.stringify(plan.financial))throw Error('Financial/evidence baseline changed');
  const [result]=sql(`begin;${context}${plan.statements.join('\n')}
    do $$begin if exists(select 1 from campo_rapportini r join orders o on o.id=r.order_id where o.company_id=${q(C)} and o.id in(${plan.jobs.map(r=>q(r.id)).join(',')}) and (r.data_lavoro<o.work_start_date or r.data_lavoro>o.work_end_date)) then raise exception 'Evidence still outside job';end if;end $$;
    create temporary table alignment_fingerprint as ${financialSql};
    do $$begin if (select data from alignment_fingerprint) is distinct from ${q(JSON.stringify(plan.financial))}::jsonb then raise exception 'Financial or report data changed';end if;end $$;
    delete from automation_trigger_events where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
    delete from wa_notifiche_event_queue where company_id=${q(C)} and created_at>=transaction_timestamp() and xmin=(pg_current_xact_id()::text)::xid;
    ${mode==='dry'?'rollback':'commit'};`);
  save('calendar-alignment-'+mode,{company:C,jobs:plan.jobs.length,financialUnchanged:true,at:new Date().toISOString()});
  console.log({mode,jobs:plan.jobs.length,financialUnchanged:true,evidenceDatesMoved:0});
}else throw Error('prepare | dry | apply');
