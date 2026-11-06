-- Correzioni alla 20281212100000 dopo la revisione (05/11/2026). Nessuna riga riscritta, idempotente.
--  · La revoca non ricalcola più dai valori attuali: all'approvazione si annota com'era la sottofase prima e com'è
--    diventata (sottofasi_dal_rapportino). Alla revoca si torna al «prima» solo se nel frattempo nessuno l'ha cambiata;
--    se qualcuno l'ha rettificata a mano, vince la rettifica. Prima: una rettifica al 40% tornava a 0, e una sottofase
--    chiusa a mano dopo l'approvazione si riapriva.
--  · Una sottofase già fatta non viene riaperta da una quantità (all'approvazione restava sotto il totale e si riapriva).
--  · I rapportini di fine lavori (lavoro_completato o firma del cliente) non muovono le sottofasi: né all'approvazione
--    né alla revoca. Prima la revoca toglieva quantità mai aggiunte.
--  · Alla revoca la sottofase deve stare nella fase e nella commessa del rapportino, come all'approvazione.
--  · Quantità di voci con unità diverse non si sommano: senza un totale si dichiara la percentuale.
--  · Una sottofase finita per quantità prende come giorno quello del lavoro.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.sottofasi_dal_rapportino (
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  subphase_id uuid not null references public.order_work_subphases(id) on delete cascade,
  percentuale_prima integer not null,
  quantita_prima numeric,
  percentuale_dopo integer not null,
  quantita_dopo numeric,
  created_at timestamptz not null default now(),
  primary key (rapportino_id, subphase_id)
);
alter table public.sottofasi_dal_rapportino enable row level security;
revoke all on table public.sottofasi_dal_rapportino from public, anon, authenticated;

-- Il totale di una sottofase si somma solo se le sue voci hanno la stessa unità.
create or replace function public.sottofase_quantita_totale(p_id uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $function$
  select case when count(distinct lower(btrim(coalesce(v.unita, '')))) = 1 then sum(v.quantita) end
    from public.order_work_phase_voci v where v.subphase_id = p_id and coalesce(v.quantita, 0) > 0;
$function$;
revoke all on function public.sottofase_quantita_totale(uuid) from public, anon, authenticated;

-- Approvazione: porta avanti la sottofase e annota com'era. Una sottofase già fatta non si tocca.
create or replace function public.sottofase_applica_avanzata(p_rapportino uuid, p_id uuid, p_quantita numeric, p_percentuale numeric, p_giorno date)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  s public.order_work_subphases;
  v_tot numeric := public.sottofase_quantita_totale(p_id);
  v_q numeric;
  v_pct integer;
begin
  select * into s from public.order_work_subphases where id = p_id for update;
  if not found or s.fatta then return; end if;
  v_pct := s.percentuale;
  v_q := s.quantita_fatta;
  if coalesce(p_quantita, 0) > 0 and v_tot > 0 then
    v_q := coalesce(s.quantita_fatta, v_tot * s.percentuale / 100) + p_quantita;
    v_pct := case when v_q >= v_tot then 100 else greatest(1, least(99, round(100 * v_q / v_tot)))::integer end;
  elsif coalesce(p_percentuale, 0) > 0 then
    v_pct := greatest(s.percentuale, least(99, round(p_percentuale))::integer);
  else
    return;
  end if;
  if v_pct = s.percentuale and v_q is not distinct from s.quantita_fatta then return; end if;
  insert into public.sottofasi_dal_rapportino (rapportino_id, subphase_id, percentuale_prima, quantita_prima, percentuale_dopo, quantita_dopo)
  values (p_rapportino, p_id, s.percentuale, s.quantita_fatta, v_pct, v_q)
  on conflict (rapportino_id, subphase_id) do update
    set percentuale_prima = excluded.percentuale_prima, quantita_prima = excluded.quantita_prima,
        percentuale_dopo = excluded.percentuale_dopo, quantita_dopo = excluded.quantita_dopo, created_at = now();
  update public.order_work_subphases set percentuale = v_pct, quantita_fatta = v_q where id = p_id;
  if v_pct >= 100 and p_giorno is not null then
    update public.order_work_subphases
       set fatta_il = ((p_giorno::timestamp + interval '12 hours') at time zone 'Europe/Rome')
     where id = p_id and fatta;
  end if;
end;
$function$;
revoke all on function public.sottofase_applica_avanzata(uuid, uuid, numeric, numeric, date) from public, anon, authenticated;

-- Revoca: si torna a com'era, solo se è ancora come l'aveva lasciata questo rapportino.
create or replace function public.sottofase_revoca_avanzata(p_rapportino uuid)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  x record;
begin
  for x in
    select a.*, s.percentuale, s.quantita_fatta, s.fatta
      from public.sottofasi_dal_rapportino a
      join public.order_work_subphases s on s.id = a.subphase_id
     where a.rapportino_id = p_rapportino
     for update of s
  loop
    if (case when x.fatta then 100 else x.percentuale end) = x.percentuale_dopo
       and x.quantita_fatta is not distinct from x.quantita_dopo then
      update public.order_work_subphases set percentuale = x.percentuale_prima, quantita_fatta = x.quantita_prima
       where id = x.subphase_id;
    end if;
  end loop;
  delete from public.sottofasi_dal_rapportino where rapportino_id = p_rapportino;
end;
$function$;
revoke all on function public.sottofase_revoca_avanzata(uuid) from public, anon, authenticated;

drop function if exists public.sottofase_applica_avanzata(uuid, numeric, numeric, integer);

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
  -- Revoca: si torna indietro solo per i rapportini giornalieri, e solo sulle sottofasi della loro commessa.
  if old.stato = 'approvato' and new.stato is distinct from 'approvato' then
    if coalesce(old.lavoro_completato, false) or nullif(btrim(old.firma_cliente_url), '') is not null then
      return new;
    end if;
    perform public.sottofase_revoca_avanzata(old.id);
    if jsonb_typeof(old.fasi_lavorate) = 'array' then
      for v in select value from jsonb_array_elements(old.fasi_lavorate) loop
        if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
          -- Solo se nessun altro rapportino approvato dice che è finita, e nessuno l'ha segnata a mano.
          update public.order_work_subphases s set fatta = false
            from public.order_work_phases fp
           where fp.id = s.phase_id and fp.order_id = old.order_id
             and s.phase_id = nullif(v->>'phase_id','')::uuid and s.fatta
             and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'))
             and s.fatta_il = ((old.data_lavoro::timestamp + interval '12 hours') at time zone 'Europe/Rome')
             and not exists (select 1 from public.campo_rapportini r, jsonb_array_elements(r.fasi_lavorate) e
                              where r.id <> old.id and r.stato = 'approvato' and r.order_id = old.order_id and jsonb_typeof(r.fasi_lavorate) = 'array'
                                and coalesce(e->'sottofasi_fatte','[]'::jsonb) ? s.id::text);
        end if;
        select v_toccate || coalesce(array_agg(s.id), '{}') into v_toccate
          from public.order_work_subphases s join public.order_work_phases fp on fp.id = s.phase_id
         where fp.order_id = old.order_id and s.phase_id = nullif(v->>'phase_id','')::uuid
           and s.id::text in (
             select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_fatte') = 'array' then v->'sottofasi_fatte' else '[]'::jsonb end)
             union select lower(value) from jsonb_array_elements_text(case when jsonb_typeof(v->'sottofasi_lavorate') = 'array' then v->'sottofasi_lavorate' else '[]'::jsonb end));
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
            perform public.sottofase_applica_avanzata(new.id, (a->>'id')::uuid, (a->>'quantita')::numeric, (a->>'percentuale')::numeric, new.data_lavoro);
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

-- Quantità per il cantiere: solo dove le voci della sottofase hanno la stessa unità.
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
     group by v.subphase_id
    having count(distinct lower(btrim(coalesce(v.unita, '')))) = 1;
end;
$function$;
revoke all on function public.campo_quantita_sottofasi(uuid) from public, anon;
grant execute on function public.campo_quantita_sottofasi(uuid) to authenticated, service_role;
