/** Repair two copied, cross-company phase references in Demo 2 only. */
import { existsSync } from 'node:fs';
import { C, DIR, q, j, read, save, sql, guard } from './demo-company-55m.mjs';
guard();
if(existsSync(DIR+'/employee-phase-reconcile-plan.json'))throw Error('Preserve the reviewed reconciliation plan');
const rows=read('employee-phase-mismatch-before');
const expected=new Set(['099afc56-b727-4a3a-8fa9-a27e36297a02','ea64f4c8-eab9-444b-a921-6a558e6f1a9a']);
if(rows.length!==2||rows.some(r=>!expected.has(r.assignment.id)))throw Error('Unexpected repair scope');
const economic=`select jsonb_build_object(
  'orders',(select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'[]')) from orders o where company_id=${q(C)}),
  'margins',(select md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'cost',consuntivo,'margin',margine) order by id)::text,'[]')) from v_ordine_marginalita where company_id=${q(C)}),
  'cash',(select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from prima_nota_entries p where company_id=${q(C)}),
  'fiscal',(select md5(coalesce(jsonb_agg(to_jsonb(d) order by id)::text,'[]')) from documenti_fiscali d where company_id=${q(C)}),
  'costs',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'[]')) from company_costs c where company_id=${q(C)})
  ) data`;
const baseline=sql(economic)[0].data;
save('employee-phase-reconcile-economic-before',baseline);
const unchanged=`do $$begin if (${economic.replace(/ data$/,'')}) is distinct from ${j(baseline)} then raise exception 'Concurrent change or financial/workflow values changed';end if;end $$;`;
const statements=[unchanged];
for(const row of rows){
  const a=row.assignment,candidates=row.target_phases.filter(p=>p.name===row.source_phase&&p.order_id===a.order_id&&p.company_id===C);
  if(candidates.length!==1||a.hours_worked!==0||a.total_cost!==0||a.notes!==null||row.source_company===C)throw Error('Ambiguous phase or changed assignment');
  const target=candidates[0];
  statements.push(`do $$begin
    if not exists(select 1 from order_work_phases p join orders o on o.id=p.order_id where p.id=${q(target.id)} and p.company_id=${q(C)} and o.company_id=${q(C)} and o.id=${q(a.order_id)} and p.name=${q(row.source_phase)}) then raise exception 'Target phase changed';end if;
    update order_employees e set phase_id=${q(target.id)},notes=${q('[DEMO · riconciliazione fase] Collegata alla fase omonima della propria commessa; riferimento copiato precedente: '+a.phase_id+'. Ore e costi invariati.')}
    from orders o where o.id=e.order_id and o.company_id=${q(C)} and e.id=${q(a.id)} and to_jsonb(e)=${j(a)};
    if not found then raise exception 'Assignment changed since audit';end if;
  end $$;`);
}
statements.push(unchanged);
save('employee-phase-reconcile-plan',{company:C,batches:[statements]});
console.log({assignments:rows.length,tenant:C,financialChanges:0,workflowChanges:0});
