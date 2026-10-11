/** Correct only demo tasks falsely completed after the operating reference date. */
import {C,YEAR,AS_OF,MARK,q,guard,read,save,has} from './demo-company-2026.mjs';
guard();if(has('timeline-applied'))throw Error('Applied timeline plan immutable');
const d=read('before'),ids=read('flow-audit').futureActual.task_completate.map(r=>r.id);
const tasks=d.tasks.filter(t=>ids.includes(t.id));
if(tasks.some(t=>!t.notes?.includes('[DEMO 5.5M 2025 v1]')||t.status!=='completata'||!t.completed_at||t.completed_at.slice(0,10)<=AS_OF))throw Error('Only known synthetic future tasks can be reopened');
const statements=tasks.map(t=>`do $$begin
  if not exists(select 1 from tasks where id=${q(t.id)} and company_id=${q(C)} and updated_at=${q(t.updated_at)}::timestamptz and completed_at=${q(t.completed_at)}::timestamptz) then raise exception 'Task changed since backup';end if;
  update tasks set status='da_fare',completed_at=null,actual_hours=0,notes=${q(t.notes+' '+MARK+' Correzione temporale: attività futura pianificata, non ancora eseguita.')} where id=${q(t.id)} and company_id=${q(C)};
end $$;`);
save('timeline-plan',{company:C,year:YEAR,asOf:AS_OF,marker:MARK,batches:[statements]});
save('timeline-manifest',{company:C,year:YEAR,asOf:AS_OF,taskIds:ids});console.log(JSON.stringify({futureTasksToReopen:tasks.length}));
