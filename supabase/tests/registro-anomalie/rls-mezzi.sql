-- Solo branch di collaudo con tutte le migrazioni e BUG-54 applicate.
-- Dati sintetici transazionali: nessun commit e nessun account utilizzabile per login.
begin;
set local statement_timeout = '45s';
-- Setup amministrativo delle fixture; le prove usano poi authenticated e JWT utente.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('test.company', gen_random_uuid()::text, true);
select set_config('test.other_company', gen_random_uuid()::text, true);
select set_config('test.user', gen_random_uuid()::text, true);
select set_config('test.order', gen_random_uuid()::text, true);
select set_config('test.other_order', gen_random_uuid()::text, true);
select set_config('test.supplier', gen_random_uuid()::text, true);
select set_config('test.other_supplier', gen_random_uuid()::text, true);
select set_config('test.item', gen_random_uuid()::text, true);
insert into public.companies(id,name,email) values
 (current_setting('test.company')::uuid,'TEST rollback azienda A','qa-a@example.invalid'),
 (current_setting('test.other_company')::uuid,'TEST rollback azienda B','qa-b@example.invalid');
insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 values(current_setting('test.user')::uuid,'qa-admin@example.invalid','{}','{}');
insert into public.profiles(id,company_id,first_name,last_name,email)
 values(current_setting('test.user')::uuid,current_setting('test.company')::uuid,'Test','Rollback','qa-admin@example.invalid');
insert into public.user_roles(user_id,role) values(current_setting('test.user')::uuid,'company_admin');
insert into public.orders(id,company_id,description,total_amount,vat_rate) values
 (current_setting('test.order')::uuid,current_setting('test.company')::uuid,'TEST transazionale A',100,22),
 (current_setting('test.other_order')::uuid,current_setting('test.other_company')::uuid,'TEST transazionale B',100,22);
insert into public.suppliers(id,company_id,name) values
 (current_setting('test.supplier')::uuid,current_setting('test.company')::uuid,'Fornitore test A'),
 (current_setting('test.other_supplier')::uuid,current_setting('test.other_company')::uuid,'Fornitore test B');
insert into public.order_items(id,order_id,supplier_id,name,quantity,purchase_price,vat_rate,status,unita_misura)
 values(current_setting('test.item')::uuid,current_setting('test.order')::uuid,current_setting('test.supplier')::uuid,'Materiale test',2,10,0,'da_ordinare','pz');
select set_config('test.mezzo',gen_random_uuid()::text,true);
select set_config('test.piano',gen_random_uuid()::text,true);
insert into public.mezzi(id,company_id,nome,gestione,assegnato_order_id)
values(current_setting('test.mezzo')::uuid,current_setting('test.company')::uuid,'Mezzo rollback','singola',current_setting('test.order')::uuid);
insert into public.mezzi_piani_cantiere(id,company_id,order_id,mezzo_id,dal,quantita)
values(current_setting('test.piano')::uuid,current_setting('test.company')::uuid,current_setting('test.order')::uuid,current_setting('test.mezzo')::uuid,(now() at time zone 'Europe/Rome')::date,1);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare closed_at timestamptz;
begin
 perform public.rientra_piano_mezzo(current_setting('test.piano')::uuid,null);
 if exists(select from public.mezzi where id=current_setting('test.mezzo')::uuid and assegnato_order_id is not null) then
  raise exception 'Mezzo ancora assegnato'; end if;
 select rientrato_il into closed_at from public.mezzi_piani_cantiere
  where id=current_setting('test.piano')::uuid and al=dal and annullato=false;
 if closed_at is null then raise exception 'Periodo non conservato o rientro assente'; end if;
 perform public.rientra_piano_mezzo(current_setting('test.piano')::uuid,null);
 if (select rientrato_il from public.mezzi_piani_cantiere where id=current_setting('test.piano')::uuid) is distinct from closed_at then
  raise exception 'Secondo rientro non idempotente'; end if;
end $test$;
set constraints all immediate;
select 'PASS: rientro effettivo, periodo conservato, doppio clic idempotente, trigger reali; rollback' result;
rollback;
