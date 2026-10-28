-- Collaudo schema reale con account DEMO esistenti, senza credenziali o nuovi accessi.
-- Tutte le fixture, le notifiche e gli effetti dei trigger sono annullati dalla sottotransazione.
set local lock_timeout='3s';
set local statement_timeout='60s';
do $collaudo$
declare
 c uuid:='d2000000-0000-4000-a000-000000000002';
 admin_uid uuid:='e592255e-0c82-86cd-7f7b-d3046317f9cd';
 actors uuid[]:=array['f1a86184-73aa-7342-fb8d-5d41deff0197','ef724933-95c6-5f6e-316a-54950729a325','1dbe6ceb-6b04-4d43-a617-8a709cb22f07','5ab35f75-a3f6-018c-7f76-8720d1ec5627']::uuid[];
 labels text[]:=array['operaio','caposquadra','capocantiere','subappaltatore'];
 outsider uuid:='e89d4dee-7696-4cd8-a291-5325901f8184';
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); pw uuid:=gen_random_uuid();
 s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();
 team uuid:=gen_random_uuid(); hp uuid:=gen_random_uuid(); hp_op uuid:=gen_random_uuid();
 report_ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 outreport uuid:=gen_random_uuid(); i int; n int; n2 int; ok boolean; msg text; ruolo jsonb; val numeric; report jsonb:='[]'; completed boolean:=false;
 ct_staff uuid:=gen_random_uuid(); sal_staff uuid:=gen_random_uuid(); ct uuid:=gen_random_uuid(); sal_test uuid:=gen_random_uuid(); sub_test uuid; finance_before int[]; table_name text; oldclaims text:=current_setting('request.jwt.claims',true);
begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
  if not exists(select 1 from public.orders where company_id=c and order_code like 'DEMO%' and deleted_at is null) then raise exception 'Azienda non DEMO'; end if;
  if (select count(distinct p.id) from public.profiles p join auth.users au on au.id=p.id where p.id=any(actors) and p.company_id=c and not coalesce(p.is_blocked,false))<>4 then raise exception 'Account DEMO non verificati'; end if;
  insert into public.orders(id,company_id,order_code,description,status,weekly_report_enabled,giornale_auto_enabled) values
   (a,c,'DEMO-COLLAUDO-CAMPO-A-2810','COLLAUDO RLS TEMPORANEO A','confermato',false,false),
   (b,c,'DEMO-COLLAUDO-CAMPO-B-2810','COLLAUDO RLS TEMPORANEO B','confermato',false,false);
  insert into public.order_campo_assignments(company_id,order_id,user_id,role_type,is_capocantiere,data_inizio,data_fine_prevista)
   select c,a,actors[j],case when j=4 then 'subcontractor' else 'employee' end,j=3,current_date-1,current_date+1 from generate_series(1,4)j;
  insert into public.order_campo_assignments(company_id,order_id,user_id,role_type) values(c,b,outsider,'subcontractor');
  insert into public.hr_profili(id,company_id,user_id,nome,cognome,lavora_in_cantiere) values
   (hp,c,actors[2],'COLLAUDO','CAPOSQUADRA',true),(hp_op,c,actors[1],'COLLAUDO','OPERAIO',true);
  insert into public.external_teams(id,company_id,name,kind,responsabile_hr_profilo_id) values(team,c,'COLLAUDO TEMP SQUADRA 2810','interna',hp);
  insert into public.squadre_componenti(company_id,squadra_id,hr_profilo_id) values(c,team,hp),(c,team,hp_op);
  insert into public.squadre_commesse(company_id,squadra_id,order_id,dal,al) values(c,team,a,current_date-1,current_date+1);
  insert into public.order_work_phases(id,company_id,order_id,name,position) values(p,c,a,'COLLAUDO TEMP FASE LIBERA',0),(p2,c,b,'COLLAUDO TEMP FASE ESTRANEA',0);
  insert into public.campo_rapportini(id,company_id,order_id,user_id,role_type,data_lavoro,descrizione_lavori,stato,ore_lavorate) values(outreport,c,b,outsider,'subcontractor',current_date,'COLLAUDO rapporto estraneo','bozza',0);
  update public.company_fasi_settings set chi_spunta='capi' where company_id=c;
  report:=report||jsonb_build_object('prova','ufficio legittimo mantiene il permesso','ok',public.has_permission_for_company(actors[2],'can_edit_orders',c));
  select array[(select count(*)::int from public.contratti_subappalto where company_id=c),(select count(*)::int from public.sal_subappaltatori where company_id=c),(select count(*)::int from public.ritenute_garanzia where company_id=c)] into finance_before;
  if 0=any(finance_before) then raise exception 'Controllo finanziario senza dati DEMO'; end if;
  execute 'set local role authenticated';
  select count(*) into n from public.sal_subappaltatori where company_id=c;
  report:=report||jsonb_build_object('prova','amministratore mantiene lettura SAL','ok',n=finance_before[2]);
  execute 'reset role';
  -- Anche lo staff qualificato, abilitato ai due permessi, deve conservare la lettura.
  update public.staff_permissions set can_view_costs=true,can_view_subappaltatori_amministrazione=true where user_id=actors[2] and company_id=c;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actors[2],'role','authenticated')::text,true);
  execute 'set local role authenticated';
  foreach table_name in array array['contratti_subappalto','sal_subappaltatori','ritenute_garanzia'] loop
   execute format('select count(*) from public.%I where company_id=$1',table_name) into n using c;
   report:=report||jsonb_build_object('prova','staff qualificato mantiene lettura '||table_name,'ok',n=finance_before[array_position(array['contratti_subappalto','sal_subappaltatori','ritenute_garanzia'],table_name)]);
  end loop;

  select id into sub_test from public.subappaltatori_sicurezza where company_id=c order by id limit 1;
  insert into public.contratti_subappalto(id,company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale,ritenuta_garanzia_pct,stato)
  values(ct_staff,c,sub_test,a,'COLLAUDO TEMP STAFF FINANZA 2810','COLLAUDO transazionale staff',1000,0,'bozza');
  perform public.sal_sub_registra_con_garanzia(c,ct_staff,sal_staff,1,current_date,100,0,'ricevuto','COLLAUDO transazionale staff');
  select count(*) into n from public.sal_subappaltatori where id=sal_staff and importo_netto=100;
  select count(*) into n2 from public.ritenute_garanzia where sal_id=sal_staff and importo=5;
  report:=report||jsonb_build_object('prova','staff abilitato registra SAL senza operazione fiscale','ok',n=1 and n2=0);
  ok:=false;
  begin
   perform public.sal_sub_registra_con_garanzia(c,ct_staff,gen_random_uuid(),2,current_date,100,5,'ricevuto','COLLAUDO limite fiscale staff');
  exception when insufficient_privilege then ok:=true;end;
  select count(*) into n from public.sal_subappaltatori where contratto_id=ct_staff;
  report:=report||jsonb_build_object('prova','garanzia fiscale resta riservata ad amministratore senza SAL parziale','ok',ok and n=1);

  execute 'reset role';

  -- Solo nella sottotransazione: isola il ruolo employee dell'account DEMO a doppio ruolo.
  -- Il ruolo staff e i suoi permessi reali vengono ripristinati dal rollback finale.
  delete from public.user_roles where user_id=actors[2] and role='company_staff';
  report:=report||jsonb_build_object('prova','riga staff residua non abilita operaio e subappaltatore','ok',not public.has_permission_for_company(actors[2],'can_edit_orders',c) and not public.has_permission_for_company(actors[4],'can_edit_orders',c));

  for i in 1..4 loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actors[i],'role','authenticated')::text,true);
   execute 'set local role authenticated';
   ruolo:=public.campo_mio_ruolo(a);
   select count(*) into n from public.orders where id=a;
   select count(*) into n2 from public.orders where id=b;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','commessa assegnata / estranea','ok',n=1 and n2=0,'visibili',jsonb_build_array(n,n2),'dettagli_ruolo',ruolo);
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','flag del ruolo operativo','ok',coalesce((ruolo->>'capocantiere')::boolean,false)=(i=3) and coalesce((ruolo->>'caposquadra')::boolean,false)=(i=2));
   select count(*) into n from public.order_work_phases where id=p;
   select count(*) into n2 from public.order_work_phases where id=p2;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','fasi assegnate / estranee','ok',n=1 and n2=0);
   select count(*) into n from public.sal_subappaltatori where company_id=c;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','contabilità subappalti riservata all’ufficio','ok',n=0);
   foreach table_name in array array['contratti_subappalto','sal_subappaltatori','ritenute_garanzia'] loop
    execute format('select count(*) from public.%I where company_id=$1',table_name) into n using c;
    report:=report||jsonb_build_object('ruolo',labels[i],'prova','lettura economica negata '||table_name,'ok',n=0);
    ok:=false;
    begin
     execute format('update public.%I set id=id where company_id=$1',table_name) using c;
     get diagnostics n=row_count;ok:=n=0;
    exception when insufficient_privilege then ok:=true;end;
    report:=report||jsonb_build_object('ruolo',labels[i],'prova','scrittura economica negata '||table_name,'ok',ok);
   end loop;

   insert into public.campo_rapportini(id,company_id,order_id,user_id,role_type,data_lavoro,descrizione_lavori,stato,ore_lavorate,fasi_lavorate)
    values(report_ids[i],c,a,actors[i],case when i=4 then 'subcontractor' else 'employee' end,current_date,'COLLAUDO DEMO transazionale: nessuna esecuzione reale','bozza',0,jsonb_build_array(jsonb_build_object('phase_id',p,'percentuale',60)));
   update public.campo_rapportini set stato='inviato' where id=report_ids[i];
   select count(*) into n from public.campo_rapportini where id=report_ids[i] and stato='inviato';
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','invio del proprio rapportino','ok',n=1);
   ok:=false;msg:=null;
   begin
    update public.campo_rapportini set stato='approvato',approvato=true,approvato_da=actors[i],approvato_at=now() where id=report_ids[i];
    get diagnostics n=row_count;ok:=n=0;
   exception when insufficient_privilege then ok:=true;msg:=sqlerrm;end;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','autoapprovazione negata','ok',ok,'messaggio',msg);
   ok:=false;
   begin
    insert into public.campo_rapportini(company_id,order_id,user_id,role_type,data_lavoro,descrizione_lavori,stato) values(c,b,actors[i],case when i=4 then 'subcontractor' else 'employee' end,current_date,'COLLAUDO tentativo fuori ambito','bozza');
   exception when insufficient_privilege then ok:=true;end;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','invio su commessa estranea negato','ok',ok);
   ok:=false;
   begin
    update public.order_work_phases set status='completata',percentuale=100 where id=p;
    get diagnostics n=row_count;ok:=(i=3 and n=1) or (i<>3 and n=0);
   exception when insufficient_privilege then ok:=i<>3;end;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','regola capi sulle fasi','ok',ok);
   execute 'reset role';
   -- Ripristino del progresso della sola fixture tra gli attori.
   update public.order_work_phases set status='da_iniziare',percentuale=0,completata_il=null,completata_da=null where id=p;
  end loop;

  for i in 1..4 loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',actors[i],'role','authenticated')::text,true);
   execute 'set local role authenticated';
   select count(*) into n from public.campo_rapportini where id=any(report_ids);
   select count(*) into n2 from public.campo_rapportini where id=outreport;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','visibilità rapportini secondo il ruolo','ok',n=case when i=3 then 4 else 1 end and n2=0,'rapportini_visibili',n);
   ok:=false;
   begin
    update public.campo_rapportini set note='COLLAUDO tentativo modifica altrui' where id=report_ids[case when i=1 then 2 else 1 end];
    get diagnostics n=row_count;ok:=n=0;
   exception when insufficient_privilege then ok:=true;end;
   report:=report||jsonb_build_object('ruolo',labels[i],'prova','modifica rapportino altrui negata','ok',ok);
   execute 'reset role';
  end loop;
  select percentuale into val from public.order_work_phases where id=p;
  report:=report||jsonb_build_object('prova','proposta inviata non applicata prima della verifica','ok',val=0,'percentuale_fase',val);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update public.campo_rapportini set stato='approvato',approvato=true,approvato_da=admin_uid,approvato_at=now() where id=report_ids[1];
  get diagnostics n=row_count;
  select percentuale into val from public.order_work_phases where id=p;
  report:=report||jsonb_build_object('prova','approvazione ufficio aggiorna la fase','ok',n=1 and val=60,'percentuale_fase',val);
  select percentuale_avanzamento into val from public.orders where id=a;
  report:=report||jsonb_build_object('prova','avanzamento aggiornato nella commessa','ok',val=60,'percentuale_commessa',val);
  -- Retry senza cambiare proposta o stato: non applica ulteriori effetti.
  update public.campo_rapportini set stato='approvato' where id=report_ids[1];
  select percentuale into val from public.order_work_phases where id=p;
  report:=report||jsonb_build_object('prova','retry approvazione non duplica avanzamento','ok',val=60);
  -- Una fase estranea non lascia il rapporto approvato a metà.
  update public.campo_rapportini set fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',p2,'percentuale',100)) where id=report_ids[2];
  ok:=false;
  begin
   update public.campo_rapportini set stato='approvato',approvato=true,approvato_da=admin_uid,approvato_at=now() where id=report_ids[2];
  exception when check_violation then ok:=true;end;
  select count(*) into n from public.campo_rapportini where id=report_ids[2] and stato='inviato';
  report:=report||jsonb_build_object('prova','fase estranea rifiutata senza approvazione parziale','ok',ok and n=1);
  insert into public.order_work_phases(id,company_id,order_id,name,position) values(pw,c,a,'COLLAUDO TEMP PESI',1);
  insert into public.order_work_subphases(id,phase_id,name,peso) values(s1,pw,'COLLAUDO TEMP PESO 1',1),(s2,pw,'COLLAUDO TEMP PESO 3',3);
  update public.campo_rapportini set fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',pw,'percentuale',99,'sottofasi_fatte',jsonb_build_array(s1))) where id=report_ids[2];
  update public.campo_rapportini set stato='approvato',approvato=true,approvato_da=admin_uid,approvato_at=now() where id=report_ids[2];
  select percentuale into val from public.order_work_phases where id=pw;
  report:=report||jsonb_build_object('prova','approvazione rispetta pesi sottofasi e non il 99 dichiarato','ok',val=25,'percentuale_fase',val);

  -- Verifica positiva della scrittura contabile autorizzata, sempre annullata.
  select id into sub_test from public.subappaltatori_sicurezza where company_id=c order by id limit 1;
  insert into public.contratti_subappalto(id,company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale,ritenuta_garanzia_pct,stato)
  values(ct,c,sub_test,a,'COLLAUDO TEMP FINANZA 2810','COLLAUDO DEMO senza esecuzione reale',1000,5,'bozza');
  perform public.sal_sub_registra_con_garanzia(c,ct,sal_test,1,current_date,100,5,'ricevuto','COLLAUDO transazionale');
  select count(*) into n from public.sal_subappaltatori where id=sal_test and importo_netto=95;
  select count(*) into n2 from public.ritenute_garanzia where sal_id=sal_test and importo=5;
  report:=report||jsonb_build_object('prova','ufficio registra SAL e ritenuta coerenti','ok',n=1 and n2=1);
  execute 'reset role';
  completed:=true;
  raise exception using errcode='PZ001',message='ROLLBACK intenzionale delle fixture';
 exception when sqlstate 'PZ001' then null;
 end;
 if not completed then raise exception 'Collaudo non concluso'; end if;
 if exists(select 1 from jsonb_array_elements(report) e where not coalesce((e->>'ok')::boolean,false)) then raise exception 'Collaudo ruoli fallito: %',report; end if;
 perform set_config('request.jwt.claims',coalesce(oldclaims,''),true);
 perform set_config('app.campo_demo_report',report::text,true);
end $collaudo$;
select current_setting('app.campo_demo_report')::jsonb as risultati;
