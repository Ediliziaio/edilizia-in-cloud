-- Un solo automatismo per l'avanzamento riconosciuto all'approvazione.
-- Non ricalcola lo storico, non crea SAL, costi o pagamenti.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_rapportino_avanzamento_approvato()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
  f public.order_work_phases%rowtype;
  p numeric;
  nuova integer;
begin
  if not (new.stato = 'approvato' and old.stato is distinct from 'approvato') then
    return new;
  end if;
  -- La conferma cliente resta distinta dal giornaliero operativo.
  if coalesce(new.lavoro_completato, false) or nullif(btrim(new.firma_cliente_url), '') is not null then
    return new;
  end if;
  if not exists(select 1 from public.orders where id=new.order_id and company_id=new.company_id) then
    raise exception 'Commessa e azienda del rapportino non corrispondono' using errcode='23514';
  end if;
  if new.fasi_lavorate is not null and jsonb_typeof(new.fasi_lavorate) <> 'array' then
    raise exception 'Le fasi dichiarate non sono leggibili: correggi il rapportino prima di approvarlo' using errcode='22023';
  end if;
  if coalesce(jsonb_array_length(new.fasi_lavorate),0) = 0 then
    update public.orders
       set percentuale_avanzamento=greatest(coalesce(percentuale_avanzamento,0),least(100,greatest(0,coalesce(new.percentuale_avanzamento,0))))
     where id=new.order_id and company_id=new.company_id;
    return new;
  end if;

  -- Ordinamento stabile e lock: due approvazioni concorrenti non abbassano il progresso.
  for v in select value from jsonb_array_elements(new.fasi_lavorate) order by value->>'phase_id' loop
    select * into f from public.order_work_phases
     where id=nullif(v->>'phase_id','')::uuid and order_id=new.order_id and company_id=new.company_id
     for update;
    if not found then
      raise exception 'Una fase dichiarata non appartiene alla commessa: aggiorna il rapportino prima di approvarlo' using errcode='23514';
    end if;
    if exists(select 1 from public.order_work_subphases where phase_id=f.id) then
      if jsonb_typeof(v->'sottofasi_fatte')='array' then
        update public.order_work_subphases s set fatta=true
         where s.phase_id=f.id and not s.fatta
           and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'));
      end if;
      -- La percentuale viene esclusivamente dalle sottofasi, mai dal valore aggregato del rapporto.
      continue;
    end if;
    -- Sottofasi rimosse nel frattempo: la fase ora libera usa la percentuale dichiarata, come l'anteprima.
    p:=coalesce(nullif(v->>'percentuale','')::numeric,0);
    if p::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Percentuale dichiarata non valida' using errcode='22023';
    end if;
    nuova:=greatest(case when f.status='completata' then 100 else coalesce(f.percentuale,0) end,least(100,greatest(0,round(p)))::integer);
    if nuova is distinct from f.percentuale or (nuova>=100 and f.status<>'completata') or (nuova>0 and f.status not in ('in_corso','completata')) then
      update public.order_work_phases
         set percentuale=nuova,
             status=case when nuova>=100 then 'completata' when nuova>0 then 'in_corso' else status end,
             completata_il=case when nuova>=100 then coalesce(completata_il,new.approvato_at,now()) else completata_il end,
             completata_da=case when nuova>=100 then coalesce(completata_da,new.approvato_da,new.user_id) else completata_da end,
             updated_at=now()
       where id=f.id;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.campo_rapportino_avanzamento_approvato() from public, anon, authenticated;

-- Il vecchio trigger applicava una seconda regola (incluso il salto silenzioso degli errori).
drop trigger if exists trg_rapportino_applica_avanzamento on public.campo_rapportini;
drop function if exists public.fn_rapportino_applica_avanzamento();
drop trigger if exists trg_campo_rapportino_avanzamento_approvato on public.campo_rapportini;
create trigger trg_campo_rapportino_avanzamento_approvato
  after update of stato on public.campo_rapportini
  for each row execute function public.campo_rapportino_avanzamento_approvato();
-- Collaudo transazionale: tutte le fixture e gli effetti dei trigger sono annullati
-- da una sotto-transazione. Restano solo funzione/trigger della migrazione.
do $$
declare
  o record;
  fase uuid:=gen_random_uuid(); libera uuid:=gen_random_uuid();
  s1 uuid:=gen_random_uuid(); s2 uuid:=gen_random_uuid();
  r uuid:=gen_random_uuid(); ok boolean:=false; valore integer;
begin
  select id,company_id into o from public.orders where order_code like 'DEMO%' and deleted_at is null order by id limit 1;
  if not found then raise exception 'Collaudo avanzamento: serve una commessa DEMO esistente'; end if;
  begin
    create temporary table collaudo_rapportino_unico (
      id uuid,company_id uuid,order_id uuid,user_id uuid,stato text,
      lavoro_completato boolean,firma_cliente_url text,fasi_lavorate jsonb,
      percentuale_avanzamento integer,approvato_at timestamptz,approvato_da uuid
    ) on commit drop;
    create trigger collaudo_avanzamento after update of stato on collaudo_rapportino_unico
      for each row execute function public.campo_rapportino_avanzamento_approvato();
    insert into public.order_work_phases(id,company_id,order_id,name) values
      (fase,o.company_id,o.id,'COLLAUDO TEMP sottofasi'),(libera,o.company_id,o.id,'COLLAUDO TEMP libera');
    insert into public.order_work_subphases(id,phase_id,name,peso) values
      (s1,fase,'COLLAUDO TEMP 1',1),(s2,fase,'COLLAUDO TEMP 2',3);
    insert into collaudo_rapportino_unico(id,company_id,order_id,stato,fasi_lavorate)
      values(r,o.company_id,o.id,'inviato',jsonb_build_array(jsonb_build_object('phase_id',fase,'percentuale',99,'sottofasi_fatte',jsonb_build_array(s1))));
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    select percentuale into valore from public.order_work_phases where id=fase;
    if valore<>25 then raise exception 'Spunte pesate: atteso 25, ottenuto %',valore; end if;
    if (select fatta from public.order_work_subphases where id=s2) then raise exception 'Spunta estranea applicata'; end if;
    -- Un aggiornamento già approvato non applica una seconda proposta.
    update collaudo_rapportino_unico set stato='approvato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',fase,'sottofasi_fatte',jsonb_build_array(s2))) where id=r;
    if (select fatta from public.order_work_subphases where id=s2) then raise exception 'Approvazione ripetuta applicata'; end if;
    -- Un vecchio rapporto percentuale non scavalca le sottofasi.
    update collaudo_rapportino_unico set stato='inviato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',fase,'percentuale',100)) where id=r;
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    if (select percentuale from public.order_work_phases where id=fase)<>25 then raise exception 'Percentuale ha scavalcato sottofasi'; end if;
    -- Tutte le sottofasi chiudono e lasciano la data di completamento.
    update collaudo_rapportino_unico set stato='inviato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',fase,'sottofasi_fatte',jsonb_build_array(s1,s2))) where id=r;
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    if not exists(select 1 from public.order_work_phases where id=fase and percentuale=100 and status='completata' and completata_il is not null) then raise exception 'Chiusura sottofasi incoerente'; end if;
    -- Sottofasi non più presenti: la fase libera usa il 60 dichiarato.
    update collaudo_rapportino_unico set stato='inviato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',libera,'percentuale',60,'sottofasi_fatte',jsonb_build_array(gen_random_uuid()))) where id=r;
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    if (select percentuale from public.order_work_phases where id=libera)<>60 then raise exception 'Fase libera non avanzata'; end if;
    update collaudo_rapportino_unico set stato='inviato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',libera,'percentuale',20)) where id=r;
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    if (select percentuale from public.order_work_phases where id=libera)<>60 then raise exception 'Avanzamento diminuito'; end if;
    -- Un errore non lascia il rapporto approvato o una fase parzialmente aggiornata.
    update collaudo_rapportino_unico set stato='inviato',fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',libera,'percentuale','errore')) where id=r;
    begin
      update collaudo_rapportino_unico set stato='approvato' where id=r;
      raise exception 'Percentuale invalida accettata';
    exception when invalid_text_representation then null; end;
    if (select stato from collaudo_rapportino_unico where id=r)<>'inviato' then raise exception 'Approvazione parziale'; end if;
    update collaudo_rapportino_unico set fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',gen_random_uuid(),'percentuale',100)) where id=r;
    begin
      update collaudo_rapportino_unico set stato='approvato' where id=r;
      raise exception 'Fase non appartenente accettata';
    exception when check_violation then null; end;
    -- La conferma cliente non muove fasi neppure se un dato storico le riporta.
    update collaudo_rapportino_unico set lavoro_completato=true,fasi_lavorate=jsonb_build_array(jsonb_build_object('phase_id',libera,'percentuale',100)) where id=r;
    update collaudo_rapportino_unico set stato='approvato' where id=r;
    if (select percentuale from public.order_work_phases where id=libera)<>60 then raise exception 'Conferma cliente ha cambiato avanzamento'; end if;
    -- Segnale intenzionale: annulla fixture, automazioni e aggregati nella sotto-transazione.
    ok:=true;
    raise exception using errcode='PZ001',message='Collaudo concluso: rollback fixture';
  exception when sqlstate 'PZ001' then null;
  end;
  if not ok then raise exception 'Collaudo avanzamento incompleto'; end if;
end $$;
