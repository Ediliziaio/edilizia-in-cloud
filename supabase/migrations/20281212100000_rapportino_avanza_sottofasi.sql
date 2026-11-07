-- Il rapportino dice anche quanto è stato fatto, non solo «ci ho lavorato» e «finita».
--  · sottofasi_avanzate: [{id, quantita?, percentuale?}] all'approvazione porta avanti quantità e percentuale;
--  · revocare un'approvazione toglie quello che quel rapportino aveva portato (prima restava);
--  · giorni_lavorati conta i GIORNI dei rapportini approvati: due persone lo stesso giorno sono un giorno;
--  · campo_quantita_sottofasi: quantità e unità senza i costi, per chi è in cantiere;
--  · campo_mie_fasi: la squadra data a tutta la commessa vale su ogni fase.
-- Idempotente. Nessuna riga riscritta: i giorni si correggono alla prossima approvazione della sottofase.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.sottofase_lavoro_dai_rapportini(p_ids uuid[])
returns void language sql security definer set search_path to 'public'
as $function$
  update public.order_work_subphases s
     set iniziata_il = x.primo, giorni_lavorati = coalesce(x.giorni, 0)
    from (
      select i.id,
             (select min(r.data_lavoro) from public.campo_rapportini r
               join public.order_work_phases f on f.order_id = r.order_id
               join public.order_work_subphases su on su.phase_id = f.id and su.id = i.id
              where r.stato = 'approvato' and jsonb_typeof(r.fasi_lavorate) = 'array'
                and exists (select 1 from jsonb_array_elements(r.fasi_lavorate) e
                             where e->>'phase_id' = f.id::text
                               and (coalesce(e->'sottofasi_fatte','[]'::jsonb) ? i.id::text or coalesce(e->'sottofasi_lavorate','[]'::jsonb) ? i.id::text))) primo,
             (select count(distinct r.data_lavoro) from public.campo_rapportini r
               join public.order_work_phases f on f.order_id = r.order_id
               join public.order_work_subphases su on su.phase_id = f.id and su.id = i.id
              where r.stato = 'approvato' and jsonb_typeof(r.fasi_lavorate) = 'array'
                and exists (select 1 from jsonb_array_elements(r.fasi_lavorate) e
                             where e->>'phase_id' = f.id::text
                               and (coalesce(e->'sottofasi_fatte','[]'::jsonb) ? i.id::text or coalesce(e->'sottofasi_lavorate','[]'::jsonb) ? i.id::text))) giorni
        from unnest(p_ids) i(id)
    ) x
   where s.id = x.id;
$function$;
revoke all on function public.sottofase_lavoro_dai_rapportini(uuid[]) from public, anon, authenticated;

-- Quanto ha portato un rapportino su una sottofase: si applica con segno + all'approvazione e - alla revoca.
create or replace function public.sottofase_applica_avanzata(p_id uuid, p_quantita numeric, p_percentuale numeric, p_segno integer)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  s public.order_work_subphases;
  v_tot numeric;
  v_q numeric;
  v_pct integer;
begin
  select * into s from public.order_work_subphases where id = p_id for update;
  if not found then return; end if;
  select sum(v.quantita) into v_tot from public.order_work_phase_voci v where v.subphase_id = p_id;
  v_pct := case when s.fatta then 100 else s.percentuale end;
  v_q := s.quantita_fatta;
  if coalesce(p_quantita, 0) > 0 then
    v_q := greatest(0, coalesce(s.quantita_fatta, case when v_tot > 0 then v_tot * v_pct / 100 else 0 end) + p_segno * p_quantita);
    if v_tot > 0 then
      v_pct := case when v_q >= v_tot then 100 when v_q <= 0 then 0 else greatest(1, least(99, round(100 * v_q / v_tot)))::integer end;
    end if;
  elsif coalesce(p_percentuale, 0) > 0 and p_segno > 0 then
    v_pct := greatest(v_pct, least(99, round(p_percentuale))::integer);
  elsif coalesce(p_percentuale, 0) > 0 then
    -- Revoca: si torna al massimo dichiarato dagli altri rapportini approvati.
    select coalesce(max((a->>'percentuale')::numeric), 0)::integer into v_pct
      from public.campo_rapportini r, jsonb_array_elements(r.fasi_lavorate) e, jsonb_array_elements(e->'sottofasi_avanzate') a
     where r.stato = 'approvato' and jsonb_typeof(r.fasi_lavorate) = 'array' and jsonb_typeof(e->'sottofasi_avanzate') = 'array'
       and a->>'id' = p_id::text and a ? 'percentuale';
  end if;
  update public.order_work_subphases set percentuale = v_pct, quantita_fatta = v_q where id = p_id;
end;
$function$;
revoke all on function public.sottofase_applica_avanzata(uuid, numeric, numeric, integer) from public, anon, authenticated;

create or replace function public.campo_rapportino_avanzamento_approvato()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v jsonb;
  a jsonb;
  f public.order_work_phases%rowtype;
  p numeric;
  nuova integer;
  v_fatte uuid[];
  v_toccate uuid[] := '{}';
begin
  -- Revoca: quello che questo rapportino aveva portato sulle sottofasi torna indietro. Le fasi senza sottofasi restano:
  -- la loro percentuale può essere stata rettificata a mano, e non si sa più di chi è.
  if old.stato = 'approvato' and new.stato is distinct from 'approvato' then
    if jsonb_typeof(old.fasi_lavorate) = 'array' then
      for v in select value from jsonb_array_elements(old.fasi_lavorate) loop
        if jsonb_typeof(v->'sottofasi_avanzate') = 'array' then
          for a in select value from jsonb_array_elements(v->'sottofasi_avanzate') loop
            perform public.sottofase_applica_avanzata((a->>'id')::uuid, (a->>'quantita')::numeric, (a->>'percentuale')::numeric, -1);
          end loop;
        end if;
        if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
          -- Solo se nessun altro rapportino approvato dice che è finita, e nessuno l'ha segnata a mano.
          update public.order_work_subphases s set fatta = false
           where s.phase_id = nullif(v->>'phase_id','')::uuid and s.fatta
             and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'))
             and s.fatta_il = ((old.data_lavoro::timestamp + interval '12 hours') at time zone 'Europe/Rome')
             and not exists (select 1 from public.campo_rapportini r, jsonb_array_elements(r.fasi_lavorate) e
                              where r.id <> old.id and r.stato = 'approvato' and r.order_id = old.order_id and jsonb_typeof(r.fasi_lavorate) = 'array'
                                and coalesce(e->'sottofasi_fatte','[]'::jsonb) ? s.id::text);
        end if;
        select v_toccate || coalesce(array_agg(x.value::uuid), '{}') into v_toccate
          from (select value from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_fatte') = 'array' then v->'sottofasi_fatte' else '[]'::jsonb end)
                union select value from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_lavorate') = 'array' then v->'sottofasi_lavorate' else '[]'::jsonb end)) x;
      end loop;
      perform public.sottofase_lavoro_dai_rapportini(v_toccate);
    end if;
    return new;
  end if;
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
      if jsonb_typeof(v->'sottofasi_avanzate')='array' then
        for a in select value from jsonb_array_elements(v->'sottofasi_avanzate') loop
          if exists (select 1 from public.order_work_subphases where id = (a->>'id')::uuid and phase_id = f.id) then
            perform public.sottofase_applica_avanzata((a->>'id')::uuid, (a->>'quantita')::numeric, (a->>'percentuale')::numeric, 1);
          end if;
        end loop;
      end if;
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
      -- Le sottofasi su cui si è lavorato (le finite comprese): primo giorno e GIORNI di lavoro, dai rapportini approvati.
      if new.data_lavoro is not null then
        select coalesce(array_agg(s.id), '{}') into v_toccate from public.order_work_subphases s
         where s.phase_id = f.id and s.id::text in (
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_lavorate') = 'array' then v->'sottofasi_lavorate' else '[]'::jsonb end)
             union
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_fatte') = 'array' then v->'sottofasi_fatte' else '[]'::jsonb end));
        perform public.sottofase_lavoro_dai_rapportini(v_toccate);
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

create or replace function public.campo_quantita_sottofasi(p_order_id uuid)
returns table(subphase_id uuid, quantita numeric, unita text)
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_uid is null or v_company is null or not (
    public.user_assigned_to_order(p_order_id)
    or exists (select 1 from public.order_employees oe join public.employees e on e.id = oe.employee_id
                where oe.order_id = p_order_id and e.user_id = v_uid)
    or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
  ) then
    return;
  end if;
  return query
    select v.subphase_id, sum(v.quantita)::numeric, min(v.unita)
      from public.order_work_phase_voci v
     where v.order_id = p_order_id and v.subphase_id is not null and coalesce(v.quantita, 0) > 0
     group by v.subphase_id;
end;
$function$;
revoke all on function public.campo_quantita_sottofasi(uuid) from public, anon;
grant execute on function public.campo_quantita_sottofasi(uuid) to authenticated, service_role;

create or replace function public.campo_mie_fasi(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id;
  if v_uid is null or v_company is null then
    return '[]'::jsonb;
  end if;
  if not (
    public.user_assigned_to_order(p_order_id)
    or exists (select 1 from public.order_employees oe
                 join public.employees e on e.id = oe.employee_id
                where oe.order_id = p_order_id and e.user_id = v_uid)
    or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', f.id,
             'nome', f.name,
             'dal', f.start_date,
             'al', f.end_date,
             'tu', exists (select 1 from public.order_employees oe
                             join public.employees e on e.id = oe.employee_id
                            where oe.phase_id = f.id and e.user_id = v_uid)
                   or exists (select 1 from public.order_external_teams ot
                                join public.external_teams t on t.id = ot.external_team_id
                                left join public.subappaltatori s on s.id = t.subappaltatore_id
                               where ot.phase_id = f.id and v_uid in (t.leader_user_id, s.user_id)),
             -- Una squadra senza fase è su tutta la commessa, come la mostra l'ufficio.
             'squadra', (select t.name
                           from public.squadre_commesse sc
                           join public.external_teams t on t.id = sc.squadra_id and t.is_active
                           join public.hr_profili h on h.user_id = v_uid and h.company_id = sc.company_id
                          where (sc.phase_id = f.id or (sc.phase_id is null and sc.order_id = f.order_id))
                            and (h.id = t.responsabile_hr_profilo_id
                                 or exists (select 1 from public.squadre_componenti c
                                             where c.squadra_id = t.id and c.hr_profilo_id = h.id))
                          order by sc.phase_id nulls last, t.name
                          limit 1))
           order by f.position, f.created_at)
      from public.order_work_phases f
     where f.order_id = p_order_id), '[]'::jsonb);
end;
$function$;
