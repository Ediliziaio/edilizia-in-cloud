// Transactional schema/RLS audit. No persisted data, no notifications or signatures.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const migration = readFileSync(
  "supabase/migrations/20260930161708_order_acceptance_reports.sql",
  "utf8",
);
const company = "d2000000-0000-4000-a000-000000000002",
  order = "d1d16e2e-437a-42eb-a7a0-60c38c22dfbe",
  actor = "e592255e-0c82-86cd-7f7b-d3046317f9cd",
  id = "faa00000-0000-4000-a000-000000000001";
const sql = `begin;
${process.argv.includes("--existing") ? "" : migration}
insert into public.order_acceptance_reports(id,company_id,order_id,created_by,content) values ('${id}','${company}','${order}','${actor}','{}');
do $$ begin
  begin
    insert into public.order_acceptance_reports(company_id,order_id,created_by,content)
    select company_id,'${order}','${actor}','{}' from orders where company_id<>'${company}' limit 1;
    raise exception 'TEST FAILED: tenant mismatch accepted';
  exception when others then if sqlerrm like 'TEST FAILED%' then raise; end if; end;
end $$;
insert into public.order_acceptance_reports(company_id,order_id,created_by,content)
select company_id,id,'${actor}','{}' from orders where company_id<>'${company}' limit 1;
select set_config('request.jwt.claim.sub','${actor}',true);
select set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.order_acceptance_reports where id='${id}')<>1 then raise exception 'TEST FAILED: own report hidden';end if;
  if exists(select 1 from public.order_acceptance_reports where company_id<>'${company}') then raise exception 'TEST FAILED: cross tenant leak';end if;
  begin update public.order_acceptance_reports set content='{"x":1}' where id='${id}';raise exception 'TEST FAILED: direct write allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.order_acceptance_reports set pdf_path='${company}/${order}/${id}/test.pdf',document_hash=repeat('a',64) where id='${id}';
update public.order_acceptance_reports set content='{"scope":"updated"}' where id='${id}';
do $$ begin
  if exists(select 1 from public.order_acceptance_reports where id='${id}' and (pdf_path is not null or document_hash is not null or version<>3)) then raise exception 'TEST FAILED: stale PDF or version';end if;
  update public.order_acceptance_reports set content='{"stale":true}' where id='${id}' and version=1;
  if found then raise exception 'TEST FAILED: stale version updated';end if;
end $$;
update public.order_acceptance_reports set pdf_path='${company}/${order}/${id}/test2.pdf',document_hash=repeat('b',64) where id='${id}';
update public.order_acceptance_reports set status='finalized',finalized_at=now() where id='${id}';
do $$ begin
  begin update public.order_acceptance_reports set content='{}' where id='${id}';raise exception 'TEST FAILED: finalized changed';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
  begin delete from public.order_acceptance_reports where id='${id}';raise exception 'TEST FAILED: finalized deleted';exception when others then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
end $$;
select 'PASS: tenant binding, tenant isolation, own read, direct write denied, PDF invalidation, stale update, freeze immutable, freeze deletion denied; all rolled back' result;
rollback;`;
console.log(
  execFileSync("supabase", ["db", "query", "--linked", "-o", "json", sql], {
    encoding: "utf8",
  }),
);
