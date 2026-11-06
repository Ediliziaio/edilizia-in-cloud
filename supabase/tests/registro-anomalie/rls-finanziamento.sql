-- Solo branch di collaudo con tutte le migrazioni e CHECK-71 applicate.
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

update public.orders set total_amount=10000,vat_rate=0,payment_type='financing',financing_cost=300,financing_amount=6000
 where id=current_setting('test.order')::uuid;
insert into public.order_installments(order_id,type,position,amount) values
 (current_setting('test.order')::uuid,'deposit',0,2000),
 (current_setting('test.order')::uuid,'financing',1,6000),
 (current_setting('test.order')::uuid,'balance',2,0);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare mode text; balance numeric; financing numeric; rejected boolean:=false;
begin
 foreach mode in array array['trattenuto','separato'] loop
  perform public.commessa_salva(current_setting('test.order')::uuid,jsonb_build_object('financing_cost_mode',mode));
  select r.amount into balance from public.cruscotto_rate_da_incassare(current_setting('test.company')::uuid) r
   join public.order_installments i on i.id::text=r.id
   where r.order_id=current_setting('test.order')::uuid and i.type='balance';
  select r.amount into financing from public.cruscotto_rate_da_incassare(current_setting('test.company')::uuid) r
   join public.order_installments i on i.id::text=r.id
   where r.order_id=current_setting('test.order')::uuid and i.type='financing';
  if balance is distinct from 2000::numeric then raise exception 'Saldo cliente errato: %',balance; end if;
  if financing is distinct from (case when mode='trattenuto' then 5700::numeric else 6000::numeric end) then
   raise exception 'Erogazione errata per modalità %: %',mode,financing;
  end if;
 end loop;
 begin
  perform public.commessa_salva(current_setting('test.other_order')::uuid,'{"financing_cost_mode":"separato"}'::jsonb);
 exception when others then
  if sqlstate not in ('42501','P0001') then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Modifica commessa altra azienda non negata'; end if;
end $test$;
-- Esegue anche i constraint trigger differiti prima del rollback.
set constraints all immediate;
select 'PASS: costo trattenuto/separato, saldo cliente 2000, RLS altra azienda; rollback seguente' as result;
rollback;
