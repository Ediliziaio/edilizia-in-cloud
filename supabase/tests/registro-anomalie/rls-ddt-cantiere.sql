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
select set_config('test.warehouse',gen_random_uuid()::text,true);
select set_config('test.other_warehouse',gen_random_uuid()::text,true);
select set_config('test.po',gen_random_uuid()::text,true);
select set_config('test.ddt1',gen_random_uuid()::text,true);
select set_config('test.ddt2',gen_random_uuid()::text,true);
insert into public.warehouses(id,company_id,name) values
 (current_setting('test.warehouse')::uuid,current_setting('test.company')::uuid,'Test A'),
 (current_setting('test.other_warehouse')::uuid,current_setting('test.other_company')::uuid,'Test B');
insert into public.purchase_orders(id,company_id,supplier_id,order_id,oda_number,status) values
 (current_setting('test.po')::uuid,current_setting('test.company')::uuid,current_setting('test.supplier')::uuid,current_setting('test.order')::uuid,'','confermato');
insert into public.purchase_order_items(company_id,purchase_order_id,order_item_id,description,quantity,unit_price,vat_rate,unit_of_measure) values
 (current_setting('test.company')::uuid,current_setting('test.po')::uuid,current_setting('test.item')::uuid,'Materiale test',2,10,0,'pz');
insert into public.ddt_ricezione(id,company_id,purchase_order_id,numero_ddt,warehouse_id) values
 (current_setting('test.ddt1')::uuid,current_setting('test.company')::uuid,current_setting('test.po')::uuid,'TEST1',current_setting('test.warehouse')::uuid),
 (current_setting('test.ddt2')::uuid,current_setting('test.company')::uuid,current_setting('test.po')::uuid,'TEST2',current_setting('test.warehouse')::uuid);
select set_config('test.stock',gen_random_uuid()::text,true);
insert into public.warehouse_stock(id,company_id,name,quantity,warehouse_id) values
 (current_setting('test.stock')::uuid,current_setting('test.company')::uuid,'Materiale cantiere',0,current_setting('test.warehouse')::uuid);
update public.ddt_ricezione set destinazione='cantiere',order_id=current_setting('test.order')::uuid where id=current_setting('test.ddt1')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare result record; item uuid;
begin
 select id into item from public.purchase_order_items where purchase_order_id=current_setting('test.po')::uuid;
 select * into result from public.oda_registra_arrivo(current_setting('test.po')::uuid,
 jsonb_build_array(jsonb_build_object('item_id',item,'quantity',2,'stock_item_id',current_setting('test.stock'))),
 'TEST cantiere',current_date,current_setting('test.warehouse')::uuid,null,null,current_setting('test.ddt1')::uuid);
 if result.righe_registrate<>1 or result.quantita_totale<>2 or result.errori<>'[]'::jsonb then raise exception 'Arrivo fallito: %',row_to_json(result); end if;
 if (select quantity from public.warehouse_stock where id=current_setting('test.stock')::uuid) is distinct from 0::numeric then raise exception 'Giacenza aumentata per consegna cantiere'; end if;
 if exists(select from public.warehouse_movements where stock_item_id=current_setting('test.stock')::uuid) then raise exception 'Movimento magazzino creato per cantiere'; end if;
 if (select quantity_received from public.purchase_order_items where id=item) is distinct from 2::numeric then raise exception 'Ricezione ordine non aggiornata'; end if;
end $test$;
set constraints all immediate;
select 'PASS: consegna cantiere aggiorna OdA senza carico o giacenza magazzino, trigger reali; rollback' result;
rollback;
