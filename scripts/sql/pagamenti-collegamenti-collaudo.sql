begin;set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table esiti_collegamenti(prova text,ok boolean);grant all on esiti_collegamenti to authenticated;
do $$
declare azienda uuid:='d2000000-0000-4000-a000-000000000002'; c uuid; tx uuid; conto uuid; co uuid; s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid(); r jsonb; pn uuid; k uuid; negato boolean; prima numeric; dopo numeric;
begin
 perform set_config('request.jwt.claims','{"sub":"e592255e-0c82-86cd-7f7b-d3046317f9cd","role":"authenticated"}',true);
 select id into conto from public.bank_accounts where company_id=azienda limit 1;
 insert into public.company_costs(company_id,name,amount,vat_rate,recurrence,cost_type,due_date,order_id)
 values(azienda,'COLLAUDO COLLEGAMENTI ROLLBACK',1000,0,'once','variable',current_date,'ec5bff4e-c812-4c77-b94a-940eb3a213b1') returning id into c;
 insert into public.bank_transactions(company_id,account_id,external_transaction_id,amount,booking_date,description)
 values(azienda,conto,'COLLAUDO-ROLLBACK-'||gen_random_uuid(),-400,current_date,'COLLAUDO DEMO, nessun movimento reale') returning id into tx;
 insert into public.contratti_subappalto(company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale)
 values(azienda,'6339745b-8cde-4872-a4a2-f874125c14bb','ec5bff4e-c812-4c77-b94a-940eb3a213b1','COLLAUDO COLLEGAMENTI','Solo prova temporanea',1000) returning id into co;
 execute 'set local role authenticated';
 r:=public.registra_pagamento_costo(c,gen_random_uuid(),400,current_date);pn:=(r->>'prima_nota_id')::uuid;
 r:=public.pagamento_costo_banca_candidati(c,pn);
 insert into esiti_collegamenti values('Movimento compatibile proposto',exists(select 1 from jsonb_array_elements(r) x where (x->>'id')::uuid=tx));
 perform public.registra_pagamento_costo(c,gen_random_uuid(),null,current_date,'bonifico',null,tx,pn);
 insert into esiti_collegamenti values('Banca su pagamento esistente: nessuna seconda uscita',(select count(*)=1 from public.prima_nota_entries where cost_id=c) and (select bank_transaction_id=tx from public.prima_nota_entries where id=pn));
 perform public.registra_pagamento_costo(c,gen_random_uuid(),null,current_date,'bonifico',null,tx,pn);
 insert into esiti_collegamenti values('Ripetere abbinamento banca resta una sola uscita',(select count(*)=1 from public.prima_nota_entries where cost_id=c));
 perform public.sal_sub_registra_con_garanzia(azienda,co,s1,1,current_date,400,0,'verificato');
 r:=public.registra_pagamento_sal_sub(s1,gen_random_uuid(),400,current_date);pn:=(r->>'prima_nota_id')::uuid;
 -- Fattura successiva al pagamento SAL: deve utilizzare il movimento già esistente.
 execute 'reset role';
 insert into public.fatture_ricevute(company_id,cedente_ragione_sociale,numero_fattura,data_fattura,totale_documento,imponibile_totale,company_cost_id,contratto_subappalto_id,aggancio_oda_manuale)
 values(azienda,'COLLAUDO DEMO','COLLAUDO-'||gen_random_uuid(),current_date,1000,1000,c,co,true);
 execute 'set local role authenticated';
 r:=public.pagamento_costo_sal_da_collegare(c);
 insert into esiti_collegamenti values('Fattura propone il SAL già pagato',exists(select 1 from jsonb_array_elements(r) x where (x->>'id')::uuid=pn));
 select consuntivo into prima from public.v_ordine_marginalita where id='ec5bff4e-c812-4c77-b94a-940eb3a213b1';
 perform public.collega_pagamento_sal_fattura(pn,c);
 perform public.collega_pagamento_sal_fattura(pn,c);
 select consuntivo into dopo from public.v_ordine_marginalita where id='ec5bff4e-c812-4c77-b94a-940eb3a213b1';
 r:=public.dettaglio_pagamento_costo(c);
 insert into esiti_collegamenti values('SAL collegato alla fattura: pagato 800 e costo invariato',(r->>'pagato')::numeric=800 and (r->>'residuo')::numeric=200 and prima=dopo);
 perform public.sal_sub_registra_con_garanzia(azienda,co,s2,2,current_date,200,0,'verificato');
 r:=public.registra_pagamento_costo(c,gen_random_uuid(),200,current_date);pn:=(r->>'prima_nota_id')::uuid;
 k:=gen_random_uuid();perform public.registra_pagamento_sal_sub(s2,k,100,current_date,'bonifico',null,null,pn);
 perform public.registra_pagamento_sal_sub(s2,k,100,current_date,'bonifico',null,null,pn);
 perform public.registra_pagamento_sal_sub(s2,gen_random_uuid(),100,current_date,'bonifico',null,null,pn);
 insert into esiti_collegamenti values('Fattura pagata attribuita al SAL senza nuova uscita',(select count(*)=3 from public.prima_nota_entries where cost_id=c) and (select pagato_registrato=200 and stato='pagato' from public.sal_subappaltatori where id=s2));
 negato:=false;begin perform public.registra_pagamento_sal_sub(s2,gen_random_uuid(),1,current_date,'bonifico',null,null,pn);exception when others then negato:=true;end;
 insert into esiti_collegamenti values('Quota pagamento non riutilizzabile oltre disponibilità',negato);
end $$;
select * from esiti_collegamenti;
do $$begin if exists(select 1 from esiti_collegamenti where not ok) then raise exception 'Collaudo collegamenti fallito';end if;end $$;
rollback;
