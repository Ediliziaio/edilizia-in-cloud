begin;set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table esiti_banca_atomica(prova text,ok boolean);grant all on esiti_banca_atomica to authenticated,service_role;
do $$
declare azienda uuid:='d2000000-0000-4000-a000-000000000002'; c uuid; sc uuid; tx uuid; conto uuid; rec uuid; generica uuid; tg uuid; r jsonb; negato boolean;
begin
 select id into conto from public.bank_accounts where company_id=azienda limit 1;
 insert into public.company_costs(company_id,name,amount,vat_rate,recurrence,cost_type,due_date) values(azienda,'COLLAUDO banca atomica',20,0,'once','variable',current_date) returning id into c;
 insert into public.scadenze(company_id,tipo,description,amount,due_date,cost_id) values(azienda,'pagamento_fornitore','COLLAUDO atomico temporaneo',20,current_date,c) returning id into sc;
 insert into public.scadenze(company_id,tipo,description,amount,due_date) values(azienda,'pagamento_fornitore','COLLAUDO cron temporaneo',30,current_date) returning id into generica;
 insert into public.bank_transactions(company_id,account_id,external_transaction_id,amount,booking_date) values(azienda,conto,'COLLAUDO-A-'||gen_random_uuid(),-20,current_date) returning id into tx;
 insert into public.bank_transactions(company_id,account_id,external_transaction_id,amount,booking_date) values(azienda,conto,'COLLAUDO-B-'||gen_random_uuid(),-30,current_date) returning id into tg;
 perform set_config('request.jwt.claims','{"sub":"e592255e-0c82-86cd-7f7b-d3046317f9cd","role":"authenticated"}',true);execute 'set local role authenticated';
 r:=public.riconcilia_uscita_scadenza(tx,sc);
 insert into esiti_banca_atomica values('Abbinamento uscita: costo, scadenza e cassa insieme',(select is_paid from public.company_costs where id=c) and (select paid_amount=20 from public.scadenze where id=sc) and (select count(*)=1 and sum(amount)=20 from public.prima_nota_entries where cost_id=c and bank_transaction_id=tx));
 perform public.riconcilia_uscita_scadenza(tx,sc);
 insert into esiti_banca_atomica values('Ripetere abbinamento non registra un altro pagamento',(select count(*)=1 from public.prima_nota_entries where cost_id=c));
 select id into rec from public.bank_reconciliations where transaction_id=tx and unmatched_at is null;
 perform public.scollega_uscita_scadenza(rec);
 insert into esiti_banca_atomica values('Scollegare banca conserva pagamento e scadenza',(select is_paid from public.company_costs where id=c) and (select paid_amount=20 from public.scadenze where id=sc) and (select reconciliation_status='pending' from public.bank_transactions where id=tx));
 negato:=false;begin perform public.riconcilia_uscita_scadenza(tx,sc);exception when others then negato:=true;end;
 insert into esiti_banca_atomica values('Pagamento già registrato non viene ripetuto da auto-match',negato);
 execute 'reset role';perform set_config('request.jwt.claims','{"role":"service_role"}',true);execute 'set local role service_role';
 perform public.riconcilia_uscita_scadenza(tg,generica,'auto',100);
 insert into esiti_banca_atomica values('Cron service_role crea Prima Nota nella stessa transazione',(select paid_amount=30 from public.scadenze where id=generica) and (select count(*)=1 from public.prima_nota_entries where scadenza_id=generica and bank_transaction_id=tg));
end $$;
select * from esiti_banca_atomica;
do $$begin if exists(select 1 from esiti_banca_atomica where not ok) then raise exception 'Collaudo banca atomica fallito';end if;end $$;
rollback;
