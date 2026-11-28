-- Verifica degli effetti di pagamento. Eseguire DOPO l'applicazione delle due migrazioni
-- (20290702100000, 20290702100100). Tutto in una transazione annullata.
-- Azienda: Demo Azienda 2 (d2000000-0000-4000-a000-000000000002). Gli utenti si cercano
-- con query (nessun id utente nel repository).
begin;
do $t$
declare
  co constant uuid := 'd2000000-0000-4000-a000-000000000002';
  v_att uuid; v_staff uuid; v_super uuid; v_altro uuid;
  v_sc uuid; v_sc2 uuid; v_sc3 uuid; v_costo_rate uuid; v_rata uuid; v_r jsonb; v_j json;
  v_e uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_rata2 uuid; v_pn_x uuid; v_n int; v_pn uuid; v_ok boolean; v_msg text;
begin
  -- utenti
  select p.id into v_att from public.profiles p join public.user_roles r on r.user_id = p.id
   where p.company_id = co and r.role::text = 'company_admin' and not coalesce(p.is_blocked,false) limit 1;
  select p.id into v_staff from public.profiles p join public.user_roles r on r.user_id = p.id
    join public.staff_permissions sp on sp.user_id = p.id and sp.company_id = co
   where p.company_id = co and r.role::text = 'company_staff' and not coalesce(p.is_blocked,false)
     and not exists (select 1 from public.user_roles r2 where r2.user_id = p.id and r2.role::text in ('company_admin','super_admin')) limit 1;
  select r.user_id into v_super from public.user_roles r join public.profiles p on p.id = r.user_id
   where r.role::text = 'super_admin' and not coalesce(p.is_blocked,false) limit 1;
  select p.id into v_altro from public.profiles p join public.user_roles r on r.user_id = p.id
   where p.company_id is not null and p.company_id <> co and r.role::text = 'company_admin' and not coalesce(p.is_blocked,false) limit 1;
  assert v_att is not null, 'nessun amministratore in Demo 2';

  -- dati di prova (come proprietario; direction di scadenze è generata dal tipo)
  insert into public.scadenze(company_id,tipo,description,amount,due_date,status,paid_amount)
    values (co,'costo_aziendale','TEST effetti',1000,current_date+10,'da_pagare',0) returning id into v_sc;
  insert into public.scadenze(company_id,tipo,description,amount,due_date,status,paid_amount)
    values (co,'costo_aziendale','TEST effetti saldata a mano',300,current_date+10,'da_pagare',0) returning id into v_sc2;
  insert into public.scadenze(company_id,tipo,description,amount,due_date,status,paid_amount)
    values (co,'costo_aziendale','TEST effetti libera',1000,current_date+10,'da_pagare',0) returning id into v_sc3;
  insert into public.company_costs(company_id,name,amount,vat_rate,due_date)
    values (co,'TEST costo a rate',500,0,current_date+10) returning id into v_costo_rate;
  insert into public.rate_fornitori(company_id,company_cost_id,numero,scadenza,importo,stato,origine)
    values (co,v_costo_rate,1,current_date+10,500,'da_pagare','costo') returning id into v_rata;

  perform set_config('request.jwt.claims', json_build_object('sub',v_att,'role','authenticated')::text, true);
  set local role authenticated;

  -- 1. effetto futuro: nessuna prima nota, coperto giusto
  v_r := public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','123','Banca X',400,current_date,current_date+5,null);
  v_e := (v_r->>'id')::uuid;
  assert (v_r->>'coperto')::numeric=400 and (v_r->>'residuo_libero')::numeric=600, 'coperto/residuo errati: '||v_r;
  select count(*) into v_n from public.prima_nota_entries where scadenza_id=v_sc;
  assert v_n=0, 'prima nota creata troppo presto';

  -- 2. superamento del residuo libero
  v_ok := false;
  begin perform public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','124','B',700,current_date,current_date+5,null);
  exception when raise_exception then v_ok := true; end;
  assert v_ok, 'superamento del residuo non rifiutato';

  -- 3. costo con rate senza rata
  v_ok := false;
  begin perform public.registra_effetto('costo',v_costo_rate,null,'assegno','emesso','1','B',100,current_date,current_date+5,null);
  exception when raise_exception then v_ok := true; end;
  assert v_ok, 'rata mancante non rifiutata';

  -- 3b. con la rata si registra, ma la chiusura «pagato» è rifiutata (nessuna RPC per rata)
  v_r := public.registra_effetto('costo',v_costo_rate,v_rata,'assegno','emesso','2','B',100,current_date,current_date+5,null);
  v_e3 := (v_r->>'id')::uuid;
  v_ok := false;
  begin perform public.chiudi_effetto(v_e3,'pagato',current_date,'33333333-3333-4333-8333-333333333333');
  exception when raise_exception then v_ok := sqlerrm like 'Paga questa rata%'; end;
  assert v_ok, 'chiusura pagato di un effetto con rata non rifiutata';
  perform public.chiudi_effetto(v_e3,'annullato',null,'44444444-4444-4444-8444-444444444444');

  -- 3c. la rata viene cancellata e ricreata (rilettura della fattura): l'effetto perde la rata,
  --     ma il costo ha ancora rate -> «pagato» resta rifiutato
  v_r := public.registra_effetto('costo',v_costo_rate,v_rata,'assegno','emesso','3','B',100,current_date,current_date+5,null);
  v_e4 := (v_r->>'id')::uuid;
  reset role;
  delete from public.rate_fornitori where id = v_rata;
  insert into public.rate_fornitori(company_id,company_cost_id,numero,scadenza,importo,stato,origine)
    values (co,v_costo_rate,1,current_date+10,500,'da_pagare','costo') returning id into v_rata2;
  assert (select rata_fornitore_id from public.effetti_pagamento where id=v_e4) is null, 'la rata doveva risultare azzerata';
  perform set_config('request.jwt.claims', json_build_object('sub',v_att,'role','authenticated')::text, true);
  set local role authenticated;
  v_ok := false;
  begin perform public.chiudi_effetto(v_e4,'pagato',current_date,'99999999-9999-4999-8999-999999999999');
  exception when raise_exception then v_ok := sqlerrm like 'Paga questa rata%'; end;
  assert v_ok, 'chiusura pagato accettata dopo che la rata e'' stata ricreata';
  perform public.chiudi_effetto(v_e4,'annullato',null,'99999999-9999-4999-8999-999999999998');

  -- 4. annullamento della fonte bloccato
  v_ok := false;
  begin update public.scadenze set status='annullata' where id=v_sc;
  exception when raise_exception then v_ok := sqlerrm like '%Annulla prima l''assegno%'; end;
  assert v_ok, 'annullo della scadenza non bloccato';

  -- 5. chiusura pagato: UNA prima nota, entry_date = p_data; doppia chiamata senza doppioni
  v_r := public.chiudi_effetto(v_e,'pagato',current_date,'11111111-1111-4111-8111-111111111111');
  v_pn := (v_r->>'prima_nota_entry_id')::uuid;
  assert v_r->>'stato'='pagato' and (v_r->>'gia_chiuso')::boolean=false, 'chiusura errata '||v_r;
  assert (select entry_date from public.prima_nota_entries where id=v_pn)=current_date, 'entry_date errata';
  assert (select paid_amount from public.scadenze where id=v_sc)=400, 'paid_amount della scadenza non aggiornato';
  v_r := public.chiudi_effetto(v_e,'pagato',current_date,'11111111-1111-4111-8111-111111111111');
  assert (v_r->>'gia_chiuso')::boolean, 'doppia chiamata non riconosciuta';
  select count(*) into v_n from public.prima_nota_entries where scadenza_id=v_sc;
  assert v_n=1, 'prima nota doppia: '||v_n;

  -- 5b. effetto_segna_esito non accetta una prima nota di UN'ALTRA FONTE, anche se di pari importo
  --     (v_e2: 400 su v_sc; la prima nota da 400 e' di v_sc3, pagata a mano alla stessa data)
  v_r := public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','126','B',400,current_date,current_date+5,null);
  v_e2 := (v_r->>'id')::uuid;
  v_j := public.mark_scadenza_paid_con_richiesta(v_sc3,400,'bonifico',current_date,'altra fonte','banca','abababab-abab-4bab-8bab-abababababab');
  v_pn_x := (v_j->>'prima_nota_entry_id')::uuid;
  v_ok := false;
  begin perform public.effetto_segna_esito(v_e2,'pagato',current_date,'abababab-abab-4bab-8bab-abababababab',v_pn_x);
  exception when raise_exception then v_ok := sqlerrm like 'Prima nota del pagamento non trovata%'; end;
  assert v_ok, 'effetto_segna_esito ha accettato la prima nota di un''altra fonte';
  -- 5c. prima nota gia' legata a un altro effetto (v_pn e' di v_e, stessa fonte, stesso importo, stessa richiesta)
  v_ok := false;
  begin perform public.effetto_segna_esito(v_e2,'pagato',current_date,'11111111-1111-4111-8111-111111111111',v_pn);
  exception when raise_exception then v_ok := sqlerrm like 'Prima nota del pagamento non trovata%'; end;
  assert v_ok, 'effetto_segna_esito ha accettato una prima nota gia'' legata a un altro effetto';
  v_ok := false;
  begin perform public.effetto_segna_esito(v_e2,'pagato',current_date,'55555555-5555-4555-8555-555555555555',null);
  exception when raise_exception then v_ok := true; end;
  assert v_ok, 'effetto_segna_esito ha accettato pn nullo';
  assert (select stato from public.effetti_pagamento where id=v_e2)='in_attesa', 'effetto marcato pagato per errore';
  perform public.chiudi_effetto(v_e2,'annullato',null,'66666666-6666-4666-8666-666666666666');

  v_r := public.registra_effetto('scadenza',v_sc,null,'riba','emesso','R1','B',600,current_date,current_date+7,null);
  v_e2 := (v_r->>'id')::uuid;
  assert (v_r->>'residuo_libero')::numeric=0, 'residuo non azzerato';
  v_r := public.chiudi_effetto(v_e2,'insoluto',null,'22222222-2222-4222-8222-222222222222');
  assert v_r->>'stato'='insoluto' and v_r->>'prima_nota_entry_id' is null, 'insoluto errato';
  v_r := public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','125','B',600,current_date,current_date+5,null);
  assert (v_r->>'residuo_libero')::numeric=0, 'residuo non riaperto dopo insoluto';

  -- 7. fonte saldata a mano nel frattempo -> FONTE_GIA_PAGATA
  v_r := public.registra_effetto('scadenza',v_sc2,null,'assegno','emesso','200','B',300,current_date,current_date+5,null);
  v_e := (v_r->>'id')::uuid;
  -- 7b. pagamento a mano normale: continua a funzionare (gli effetti non lo bloccano)
  v_j := public.mark_scadenza_paid_con_richiesta(v_sc2,300,'bonifico',current_date,'a mano','banca','77777777-7777-4777-8777-777777777777');
  assert v_j->>'error' is null, 'pagamento a mano rifiutato: '||v_j::text;
  v_ok := false;
  begin perform public.chiudi_effetto(v_e,'pagato',current_date,'88888888-8888-4888-8888-888888888888');
  exception when raise_exception then v_ok := sqlerrm like 'FONTE_GIA_PAGATA%'; v_msg := sqlerrm; end;
  assert v_ok, 'FONTE_GIA_PAGATA non sollevato: '||coalesce(v_msg,'nessun errore');
  assert (select stato from public.effetti_pagamento where id=v_e)='in_attesa', 'effetto chiuso nonostante l''errore';

  -- 8. elenco e totali girano
  assert (select count(*) from public.effetti_elenco(co,'{in_attesa}'))>=1, 'elenco vuoto';
  assert (public.scadenzario_totali(co,null,null,true,false,null)->'coperto_effetti'->'uscita'->>'n') is not null, 'coperto_effetti assente';

  reset role;

  -- 9. altra azienda: 42501
  if v_altro is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',v_altro,'role','authenticated')::text, true);
    set local role authenticated; v_ok := false;
    begin perform public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','9','B',10,current_date,current_date+5,null);
    exception when sqlstate '42501' then v_ok := true; end;
    assert v_ok, 'utente di altra azienda non rifiutato'; reset role;
  else raise exception 'SALTATO: nessun amministratore di altra azienda'; end if;

  -- 10. sola lettura: lo si costruisce sulla riga permessi di un utente staff di Demo 2
  if v_staff is not null then
    update public.staff_permissions set sola_lettura = true where user_id = v_staff and company_id = co;
    perform set_config('request.jwt.claims', json_build_object('sub',v_staff,'role','authenticated')::text, true);
    set local role authenticated; v_ok := false;
    begin perform public.registra_effetto('scadenza',v_sc,null,'assegno','emesso','9','B',10,current_date,current_date+5,null);
    exception when sqlstate '42501' then v_ok := true; end;
    assert v_ok, 'utente in sola lettura non rifiutato'; reset role;
  else raise exception 'SALTATO: nessun utente staff in Demo 2'; end if;

  -- 11. super admin: deve continuare a poter operare
  if v_super is not null then
    perform set_config('request.jwt.claims', json_build_object('sub',v_super,'role','authenticated')::text, true);
    set local role authenticated;
    v_r := public.registra_effetto('scadenza',v_sc3,null,'assegno','emesso','S1','B',1,current_date,current_date+5,null);
    assert (v_r->>'id') is not null, 'super admin non puo'' registrare'; reset role;
  else raise exception 'SALTATO: nessun super admin'; end if;

  -- 12. service role: deve continuare a poter operare
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
  v_r := public.registra_effetto('scadenza',v_sc3,null,'assegno','emesso','SR1','B',1,current_date,current_date+5,null);
  assert (v_r->>'id') is not null, 'service role non puo'' registrare'; reset role;

  raise notice 'effetti_pagamento_verifica: TUTTO OK';
end $t$;
rollback;
