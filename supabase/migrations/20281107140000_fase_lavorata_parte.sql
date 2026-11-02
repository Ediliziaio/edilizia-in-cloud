-- Una fase su cui si è lavorato, a rapportino approvato, non resta «da iniziare»: l'operaio segna dove ha lavorato ma la
-- percentuale la dichiara il capo, quindi spesso la voce arriva a zero. La percentuale non cambia, cambia solo lo stato.
-- Il resto è identico alla versione in produzione.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_rapportino_avanzamento_approvato()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v jsonb;
  f public.order_work_phases%rowtype;
  p numeric;
  nuova integer;
  v_fatte uuid[];
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
        with fatte as (
          update public.order_work_subphases s set fatta=true
           where s.phase_id=f.id and not s.fatta
             and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'))
          returning s.id
        ) select coalesce(array_agg(id), '{}') into v_fatte from fatte;
        -- Finita il giorno del lavoro, non quello dell'approvazione (31/10/2026).
        if new.data_lavoro is not null and cardinality(v_fatte) > 0 then
          update public.order_work_subphases
             set fatta_il = ((new.data_lavoro::timestamp + interval '12 hours') at time zone 'Europe/Rome'),
                 fatta_da = coalesce(new.user_id, fatta_da)
           where id = any(v_fatte);
          update public.order_work_phases fp
             set completata_il = (select max(s.fatta_il) from public.order_work_subphases s where s.phase_id = f.id)
           where fp.id = f.id and fp.status = 'completata'
             and fp.completata_il > (select max(s.fatta_il) from public.order_work_subphases s where s.phase_id = f.id);
        end if;
      end if;
      -- Le sottofasi su cui si è lavorato quel giorno (le finite comprese): primo giorno e giorni di lavoro.
      if new.data_lavoro is not null then
        update public.order_work_subphases s
           set iniziata_il = least(coalesce(s.iniziata_il, new.data_lavoro), new.data_lavoro),
               giorni_lavorati = s.giorni_lavorati + 1
         where s.phase_id = f.id
           and s.id::text in (
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_lavorate') = 'array' then v->'sottofasi_lavorate' else '[]'::jsonb end)
             union
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_fatte') = 'array' then v->'sottofasi_fatte' else '[]'::jsonb end));
      end if;
      -- La percentuale viene esclusivamente dalle sottofasi, mai dal valore aggregato del rapporto.
      update public.order_work_phases set status='in_corso', updated_at=now() where id=f.id and status='da_iniziare';
      continue;
    end if;
    -- Sottofasi rimosse nel frattempo: la fase ora libera usa la percentuale dichiarata, come l'anteprima.
    p:=coalesce(nullif(v->>'percentuale','')::numeric,0);
    if p::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Percentuale dichiarata non valida' using errcode='22023';
    end if;
    nuova:=greatest(case when f.status='completata' then 100 else coalesce(f.percentuale,0) end,least(100,greatest(0,round(p)))::integer);
    if nuova is distinct from f.percentuale or (nuova>=100 and f.status<>'completata') or (nuova>0 and f.status not in ('in_corso','completata'))
       or f.status='da_iniziare' then
      update public.order_work_phases
         set percentuale=nuova,
             status=case when nuova>=100 then 'completata' when nuova>0 or f.status='da_iniziare' then 'in_corso' else status end,
             completata_il=case when nuova>=100 then coalesce(completata_il,new.approvato_at,now()) else completata_il end,
             completata_da=case when nuova>=100 then coalesce(completata_da,new.approvato_da,new.user_id) else completata_da end,
             updated_at=now()
       where id=f.id;
    end if;
  end loop;
  return new;
end $function$;
