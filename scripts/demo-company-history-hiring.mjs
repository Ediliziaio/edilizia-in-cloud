/** Demo-only correction of a pre-existing synthetic hiring date inconsistent with history. */
import {C,YEAR,MARK,uid,q,sql,guard,read,save,plan} from './demo-company-history.mjs';
guard();if(YEAR!==2026)throw Error('Current demo employee only');
const employee='79f39ffb-d6ca-4936-875b-445f8c568d26',profile='fc66286f-b904-44d4-8e1a-bc8dea23c14c';
const before=sql(`select to_jsonb(e) employee,to_jsonb(h) profile from employees e join hr_profili h on h.employee_id=e.id and h.company_id=e.company_id where e.company_id=${q(C)} and e.id=${q(employee)} and h.id=${q(profile)}`);
if(before.length!==1||before[0].employee.data_assunzione!=='2026-09-01')throw Error('Synthetic employee changed, stop for review');save('hiring-before',before,true);
plan('hiring',[[`do $$begin if not exists(select 1 from employees where company_id=${q(C)} and id=${q(employee)} and data_assunzione='2026-09-01' and first_name='Luca' and last_name='Bianchi') then raise exception 'Demo hiring state changed';end if;end $$;`,
 `update employees set data_assunzione='2024-01-08' where company_id=${q(C)} and id=${q(employee)} and data_assunzione='2026-09-01';`,
 `update hr_profili set data_assunzione='2024-01-08' where company_id=${q(C)} and id=${q(profile)} and employee_id=${q(employee)};`]],{company:C,year:YEAR,employee,profile,reason:'Synthetic hire corrected to predate already simulated employment; no wage/cost/payments changed',backup:'hiring-before'});
