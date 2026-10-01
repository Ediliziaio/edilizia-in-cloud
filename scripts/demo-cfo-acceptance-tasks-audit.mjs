// Real authenticated-role tests, entirely rolled back, including automation queues.
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const migration=readFileSync('supabase/migrations/20260930164535_acceptance_reserve_tasks.sql','utf8');
const company='d2000000-0000-4000-a000-000000000002',order='d1d16e2e-437a-42eb-a7a0-60c38c22dfbe',actor='e592255e-0c82-86cd-7f7b-d3046317f9cd';
const report='fab00000-0000-4000-a000-000000000001',draft='fab00000-0000-4000-a000-000000000002',other='fab00000-0000-4000-a000-000000000003',bad='fab00000-0000-4000-a000-000000000004';
const base={title:'DEMO QA riserve',actions:[{work:'Ripristino sigillatura DEMO',owner:'Impresa esterna DEMO',due:'2026-10-05'}]};
const insert=(id,content,status='draft')=>`insert into public.order_acceptance_reports(id,company_id,order_id,created_by,content,status,pdf_path,document_hash,finalized_at) values ('${id}','${company}','${order}','${actor}','${JSON.stringify(content)}','${status}',${status==='finalized'?`'${company}/${order}/${id}/test.pdf',repeat('a',64),now()`:'null,null,null'});`;
const sql=`begin;
${process.argv.includes('--existing')?'':migration}
${insert(report,base,'finalized')}
${insert(draft,base)}
${insert(bad,{...base,actions:[...base.actions,{work:'Non valido',owner:'Demo',due:''}]},'finalized')}
insert into public.order_acceptance_reports(id,company_id,order_id,created_by,content)
select '${other}',company_id,id,'${actor}','{}' from orders where company_id<>'${company}' limit 1;
create temporary table acceptance_before as select content,document_hash,version from public.order_acceptance_reports where id='${report}';
create temporary table margin_before as select total_amount from public.orders where id='${order}';
select set_config('request.jwt.claim.sub','${actor}',true);
select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true);
set local role authenticated;
do $$ declare n integer; t public.tasks%rowtype; begin
  n:=public.create_acceptance_tasks('${report}');if n<>1 then raise exception 'TEST FAILED: expected one task, got %',n;end if;
  n:=public.create_acceptance_tasks('${report}');if n<>0 then raise exception 'TEST FAILED: duplicate';end if;
  select * into t from public.tasks where acceptance_report_id='${report}';
  if t.order_id<>'${order}' or t.company_id<>'${company}' or t.assigned_to<>'${actor}' or t.due_date<>'2026-10-05'::date or t.notes not like '%Impresa esterna DEMO%' then raise exception 'TEST FAILED: incomplete task';end if;
  update public.tasks set status='completata',completed_at=now() where id=t.id;
  n:=public.create_acceptance_tasks('${report}');if n<>0 then raise exception 'TEST FAILED: recreated completed task';end if;
  if not exists(select 1 from tasks where id=t.id and status='completata') then raise exception 'TEST FAILED: reopened task';end if;
  begin update public.tasks set acceptance_report_id=null,acceptance_action_index=null where id=t.id;raise exception 'TEST FAILED: detached source';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  begin update public.tasks set order_id='1778464d-0839-4011-a3f8-d267f7c9120f' where id=t.id;raise exception 'TEST FAILED: moved order';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  begin perform public.create_acceptance_tasks('${draft}');raise exception 'TEST FAILED: draft allowed';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  begin perform public.create_acceptance_tasks('${other}');raise exception 'TEST FAILED: foreign company allowed';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  begin perform public.create_acceptance_tasks('${bad}');raise exception 'TEST FAILED: malformed second action allowed';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  if exists(select 1 from tasks where acceptance_report_id='${bad}') then raise exception 'TEST FAILED: partial insert';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.order_acceptance_reports r,acceptance_before b where r.id='${report}' and (r.content,r.document_hash,r.version) is distinct from (b.content,b.document_hash,b.version)) then raise exception 'TEST FAILED: report changed';end if;
 if (select total_amount from public.orders where id='${order}') is distinct from (select total_amount from margin_before) then raise exception 'TEST FAILED: order amount changed';end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.create_acceptance_tasks('${report}');raise exception 'TEST FAILED: anonymous access';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: creates once; owner/date/order preserved; completed stays completed; immutable source/order; draft/cross-company/anonymous denied; atomic rollback; report/hash/version and revenue unchanged. All rolled back.' result;
rollback;`;
console.log(execFileSync('supabase',['db','query','--linked','-o','json',sql],{encoding:'utf8'}));
