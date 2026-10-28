-- Solo DEMO, transazione interamente annullata. Nessun bonifico o documento fiscale inviato.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table esiti_pagamenti(prova text,ok boolean);
grant all on esiti_pagamenti to authenticated;
do $$
declare good uuid:='0a281028-0000-4000-a000-000000000001'; bad uuid:='fa281028-0000-4000-a000-000000000001'; azienda uuid:='d2000000-0000-4000-a000-000000000002'; c uuid; d uuid; contratto uuid; sid uuid:=gen_random_uuid(); r jsonb; k uuid:=gen_random_uuid(); negato boolean;
begin
 insert into public.company_costs(company_id,name,amount,vat_rate,recurrence,cost_type,due_date,order_id)
 values(azienda,'COLLAUDO PAGAMENTI ROLLBACK',1000,22,'once','variable',current_date,'ec5bff4e-c812-4c77-b94a-940eb3a213b1') returning id into c;
 insert into public.scadenze(company_id,tipo,description,amount,due_date,cost_id) values(azienda,'pagamento_fornitore','COLLAUDO ROLLBACK',1220,current_date,c) returning id into d;
 insert into public.contratti_subappalto(company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale)
 values(azienda,'6339745b-8cde-4872-a4a2-f874125c14bb','ec5bff4e-c812-4c77-b94a-940eb3a213b1','COLLAUDO ROLLBACK','Prova transazionale, nessun lavoro reale',2000) returning id into contratto;
 perform set_config('request.jwt.claims','{"sub":"e592255e-0c82-86cd-7f7b-d3046317f9cd","role":"authenticated"}',true);
 insert into public.company_costs(id,company_id,name,amount,vat_rate,recurrence,cost_type,due_date,is_paid) values(good,azienda,'COLLAUDO bulk valido',10,0,'once','variable',current_date,false),(bad,azienda,'COLLAUDO storico ambiguo',10,0,'once','variable',current_date,true);
 execute 'set local role authenticated';
 negato:=false;begin perform public.registra_pagamenti_costi(array[good,bad],current_date);exception when others then negato:=true;end;
 insert into esiti_pagamenti values('Errore secondo costo annulla tutto il lotto',negato and not exists(select 1 from public.prima_nota_entries where cost_id=good) and not (select is_paid from public.company_costs where id=good));
 perform public.mark_scadenza_paid_con_richiesta(d,400,'bonifico',current_date,null,'banca',k);
 perform public.mark_scadenza_paid_con_richiesta(d,400,'bonifico',current_date,null,'banca',k);
 insert into esiti_pagamenti values('Retry scadenza: una sola uscita',(select count(*)=1 from public.prima_nota_entries where cost_id=c));
 r:=public.dettaglio_pagamento_costo(c);
 insert into esiti_pagamenti values('Acconto: residuo 820 e non pagato',(r->>'residuo')::numeric=820 and not (select is_paid from public.company_costs where id=c));
 negato:=false;begin perform public.mark_scadenza_paid_con_richiesta(d,401,'bonifico',current_date,null,'banca',k);exception when others then negato:=true;end;
 insert into esiti_pagamenti values('Stessa chiave con dati differenti respinta',negato);
 negato:=false;begin perform public.registra_pagamento_costo(c,gen_random_uuid(),821,current_date);exception when others then negato:=true;end;
 insert into esiti_pagamenti values('Superamento residuo respinto',negato);
 perform public.registra_pagamento_costo(c,gen_random_uuid(),820,current_date);
 insert into esiti_pagamenti values('Saldo: costo e scadenza pagati',(select is_paid from public.company_costs where id=c) and (select paid_amount=1220 and status='pagata' from public.scadenze where id=d));
 perform public.registra_pagamento_costo(c,gen_random_uuid());
 insert into esiti_pagamenti values('Ripetere saldo non crea una terza uscita',(select count(*)=2 from public.prima_nota_entries where cost_id=c));
 -- La prima uscita nasce dallo scadenzario: lo storno deve comprendere entrambe.
 perform public.storna_pagamenti_costo(c);
 insert into esiti_pagamenti values('Storno preserva storico e riapre residuo',(select count(*)=4 from public.prima_nota_entries where cost_id=c) and not (select is_paid from public.company_costs where id=c));
 perform public.sal_sub_registra_con_garanzia(azienda,contratto,sid,1,current_date,1000,5,'verificato');
 k:=gen_random_uuid();r:=public.registra_pagamento_sal_sub(sid,k,400,current_date);
 perform public.registra_pagamento_sal_sub(sid,k,400,current_date);
 insert into esiti_pagamenti values('SAL: acconto idempotente e garanzia invariata',(select pagato_registrato=400 and stato='verificato' from public.sal_subappaltatori where id=sid) and (select importo=50 and stato='trattenuta' from public.ritenute_garanzia where sal_id=sid));
 perform public.registra_pagamento_sal_sub(sid,gen_random_uuid(),550,current_date);
 insert into esiti_pagamenti values('SAL: saldo 950 e due sole operazioni',(select pagato_registrato=950 and stato='pagato' from public.sal_subappaltatori where id=sid) and (select count(*)=2 from public.sal_sub_pagamenti where sal_id=sid));
 negato:=false;begin perform public.registra_pagamento_sal_sub(sid,gen_random_uuid(),1,current_date);exception when others then negato:=true;end;
 insert into esiti_pagamenti values('SAL: ulteriore pagamento respinto',negato);
 perform set_config('request.jwt.claims','{"sub":"1dbe6ceb-6b04-4d43-a617-8a709cb22f07","role":"authenticated"}',true);
 negato:=false;begin perform public.registra_pagamento_costo(c,gen_random_uuid(),1,current_date);exception when others then negato:=true;end;
 execute 'reset role';insert into esiti_pagamenti values('Operaio non autorizzato ai pagamenti',negato);
end $$;
select * from esiti_pagamenti;
do $$ begin if exists(select 1 from esiti_pagamenti where not ok) then raise exception 'Collaudo pagamenti fallito'; end if;end $$;
rollback;
