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
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare payload jsonb; result jsonb; rejected boolean := false; n integer;
begin
 if current_user <> 'authenticated' or auth.uid() <> current_setting('test.user')::uuid then
  raise exception 'Identità test non applicata';
 end if;
 if exists(select 1 from public.orders where id=current_setting('test.other_order')::uuid) then
  raise exception 'RLS espone la commessa di altra azienda';
 end if;
 payload := jsonb_build_array(jsonb_build_object('order_item_id',current_setting('test.item'),'description','Materiale test',
  'quantity',2,'unit_price',10,'vat_rate',0,'discount_percent',0,'unit_of_measure','pz'));
 begin
  perform public.crea_oda_materiali_atomica(current_setting('test.other_company')::uuid,
   current_setting('test.other_order')::uuid,current_setting('test.other_supplier')::uuid,payload);
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'RPC ha consentito accesso ad altra azienda'; end if;
 result := public.crea_oda_materiali_atomica(current_setting('test.company')::uuid,
  current_setting('test.order')::uuid,current_setting('test.supplier')::uuid,payload);
 if result->>'poId' is null then raise exception 'Nessun OdA restituito'; end if;
 select count(*) into n from public.purchase_order_items where purchase_order_id=(result->>'poId')::uuid and quantity=2 and vat_rate=0;
 if n<>1 then raise exception 'Righe o IVA zero non conservate'; end if;
 rejected:=false;
 begin
  perform public.crea_oda_materiali_atomica(current_setting('test.company')::uuid,
   current_setting('test.order')::uuid,current_setting('test.supplier')::uuid,payload);
 exception when others then
  if sqlerrm not like 'Quantità o coperture cambiate%' then raise; end if;
  rejected:=true;
 end;
 if not rejected then raise exception 'Tentativo ripetuto non bloccato'; end if;
 select count(*) into n from public.purchase_orders where order_id=current_setting('test.order')::uuid;
 if n<>1 then raise exception 'OdA duplicato'; end if;
end $test$;
-- Esegue anche i constraint trigger differiti prima del rollback.
set constraints all immediate;
select 'PASS: RLS due aziende, creazione OdA, IVA zero, ripetizione senza duplicati; rollback seguente' as result;
rollback;
