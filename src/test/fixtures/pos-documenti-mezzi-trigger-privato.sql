-- Runtime EXECUTE privileges for trigger callbacks are distinct from direct RPC access.
-- Temporary relation only: this does not bypass or prove canonical-table RLS policies.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';
create temporary table v_trigger_test(company_id uuid,mezzo_id uuid);
grant select,insert,update,delete on v_trigger_test to authenticated;
create trigger verifica_lock_privato before insert or update or delete on v_trigger_test for each row execute function public.pos_documenti_mezzo_blocca();
set local role authenticated;
insert into v_trigger_test values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
update v_trigger_test set mezzo_id='33333333-3333-4333-8333-333333333333';
delete from v_trigger_test;
select case when count(*)=0 then 'PASS DML autenticato: trigger privato eseguito su INSERT/UPDATE/DELETE, rollback' else 'FAIL' end as risultato from v_trigger_test;
rollback;
