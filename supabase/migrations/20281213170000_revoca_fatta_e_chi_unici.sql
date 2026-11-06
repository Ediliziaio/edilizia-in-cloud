-- Correzioni della revisione del 05/11/2026 alle 20281213150000 e 20281213160000. Idempotente, nessuna riga riscritta
-- (le uniche fotografie esistenti sono della simulazione su Demo Azienda 2).
--  · Revoca di un rapportino che ha portato avanti una sottofase E l'ha segnata fatta: prima la fotografia diceva «dopo = 60»,
--    il segno di fatta la portava a 100 e la revoca la scambiava per una rettifica a mano: finiva a 0 con la quantità ancora
--    piena. Ora anche il segno di fatta entra nella fotografia, e la revoca torna al «prima» (non riapre se un altro
--    rapportino approvato la dice finita).
--  · La revoca blocca prima le fasi e poi le sottofasi, come l'approvazione: niente stallo fra le due.
--  · Chi fa la sottofase: due vincoli unici semplici al posto dell'indice su espressione, così il programma può ignorare i
--    doppioni (on conflict do nothing) e un'aggiunta in blocco non fallisce tutta per una riga già presente.
--  · Lettura con lo stesso controllo dell'assegnazione della scrittura; created_by non si sceglie dal programma.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.sottofasi_dal_rapportino add column if not exists fatta_dal_rapportino boolean not null default false;

drop function if exists public.sottofase_revoca_avanzata(uuid);
create or replace function public.sottofase_revoca_avanzata(p_rapportino uuid, p_order uuid)
returns uuid[] language plpgsql security definer set search_path to 'public'
as $function$
declare
  x record;
  v_gestite uuid[] := '{}';
begin
  for x in
    select a.*, s.percentuale, s.quantita_fatta, s.fatta
      from public.sottofasi_dal_rapportino a
      join public.order_work_subphases s on s.id = a.subphase_id
      join public.order_work_phases fp on fp.id = s.phase_id and fp.order_id = p_order
     where a.rapportino_id = p_rapportino
     order by a.subphase_id
     for update of s
  loop
    v_gestite := v_gestite || x.subphase_id;
    -- Rettificata a mano dopo l'approvazione: vince la rettifica.
    if (case when x.fatta then 100 else x.percentuale end) <> x.percentuale_dopo
       or x.quantita_fatta is distinct from x.quantita_dopo then
      continue;
    end if;
    -- Un altro rapportino approvato la dice finita: resta finita.
    if x.fatta_dal_rapportino and exists (
         select 1 from public.campo_rapportini r, jsonb_array_elements(r.fasi_lavorate) e
          where r.id <> p_rapportino and r.stato = 'approvato' and r.order_id = p_order and jsonb_typeof(r.fasi_lavorate) = 'array'
            and coalesce(e->'sottofasi_fatte','[]'::jsonb) ? x.subphase_id::text) then
      continue;
    end if;
    -- Cambiare la percentuale sotto 100 toglie anche il segno di fatta (sottofase_avanzamento_coerente).
    update public.order_work_subphases
       set fatta = false, percentuale = x.percentuale_prima, quantita_fatta = x.quantita_prima
     where id = x.subphase_id;
  end loop;
  delete from public.sottofasi_dal_rapportino where rapportino_id = p_rapportino;
  return v_gestite;
end;
$function$;
revoke all on function public.sottofase_revoca_avanzata(uuid, uuid) from public, anon, authenticated;

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
  v_gestite uuid[] := '{}';
begin
  -- Revoca: si torna indietro solo per i rapportini giornalieri, e solo sulle sottofasi della loro commessa.
  if old.stato = 'approvato' and new.stato is distinct from 'approvato' then
    if coalesce(old.lavoro_completato, false) or nullif(btrim(old.firma_cliente_url), '') is not null then
      return new;
    end if;
    -- Stesso ordine dei lock dell'approvazione: prima le fasi (per id), poi le sottofasi.
    perform 1 from public.order_work_phases fp
     where fp.order_id = old.order_id and jsonb_typeof(old.fasi_lavorate) = 'array'
       and fp.id::text in (select e->>'phase_id' from jsonb_array_elements(old.fasi_lavorate) e)
     order by fp.id for update;
    v_gestite := public.sottofase_revoca_avanzata(old.id, old.order_id);
    if jsonb_typeof(old.fasi_lavorate) = 'array' then
      for v in select value from jsonb_array_elements(old.fasi_lavorate) loop
        if jsonb_typeof(v->'sottofasi_fatte') = 'array' then
          -- Solo se nessun altro rapportino approvato dice che è finita, e nessuno l'ha segnata a mano.
          update public.order_work_subphases s set fatta = false
            from public.order_work_phases fp
           where fp.id = s.phase_id and fp.order_id = old.order_id
             and s.phase_id = nullif(v->>'phase_id','')::uuid and s.fatta
             and not (s.id = any(v_gestite))
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
        -- Com'era prima di essere segnata fatta: alla revoca torna lì (se c'era già la fotografia delle quantità, resta il suo «prima»).
        insert into public.sottofasi_dal_rapportino (rapportino_id, subphase_id, percentuale_prima, quantita_prima, percentuale_dopo, quantita_dopo, fatta_dal_rapportino)
        select new.id, s.id, s.percentuale, s.quantita_fatta, 100, s.quantita_fatta, true
          from public.order_work_subphases s
         where s.phase_id=f.id and not s.fatta
           and s.id::text in (select lower(value) from jsonb_array_elements_text(v->'sottofasi_fatte'))
        on conflict (rapportino_id, subphase_id) do update
          set percentuale_dopo = 100, fatta_dal_rapportino = true;
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


-- Chi fa la sottofase: vincoli semplici (i NULL non si scontrano), usabili da on conflict.
drop index if exists public.order_work_subphase_chi_unico;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_work_subphase_chi_persona_unica') then
    alter table public.order_work_subphase_chi add constraint order_work_subphase_chi_persona_unica unique (subphase_id, employee_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_work_subphase_chi_ditta_unica') then
    alter table public.order_work_subphase_chi add constraint order_work_subphase_chi_ditta_unica unique (subphase_id, external_team_id);
  end if;
end $$;

revoke insert on table public.order_work_subphase_chi from authenticated;
grant insert (order_id, subphase_id, employee_id, external_team_id) on table public.order_work_subphase_chi to authenticated;

drop policy if exists sottofase_chi_lettura on public.order_work_subphase_chi;
create policy sottofase_chi_lettura on public.order_work_subphase_chi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', public.get_order_company_id(order_id))
         and public._order_visible_under_rls(order_id, true));
