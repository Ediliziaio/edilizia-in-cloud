-- Approvato senza tariffa, o con un operaio senza scheda: quando la tariffa o la scheda arrivano, il costo rientra da solo.
-- Solo per quello che era a zero o mancava: un costo gia' registrato non cambia. E un rapportino in un giornale firmato non si rifiuta.
set local lock_timeout = '3s';

create or replace function public.rapportino_costo_recupera(p_employee uuid) returns integer language plpgsql security definer set search_path to '' as $$
declare
  e public.employees; v_tariffa numeric; r record; v_entry jsonb; v_ore numeric; v_costo numeric; v_fase uuid; v_nuova boolean; v_snap jsonb; v_row uuid; n integer := 0;
begin
  select * into e from public.employees where id = p_employee;
  if e.id is null then return 0; end if;
  v_tariffa := coalesce(public.costo_orario_calcolato(e.id), 0);
  if v_tariffa <= 0 then return 0; end if;
  for r in
    select x.id, x.order_id, x.presenze_registrate, x.costo_manodopera, x.fasi_lavorate, x.ore_lavorate, x.ore_straordinario
      from public.campo_rapportini x
     where x.company_id = e.company_id and x.approvato and x.annullato_at is null and x.costo_registrato_at is not null
       and (x.presenze_registrate @> jsonb_build_array(jsonb_build_object('employee_id', e.id, 'costo', 0))
            or (e.user_id is not null and x.user_id = e.user_id
                and coalesce(jsonb_array_length(case when jsonb_typeof(x.presenze) = 'array' then x.presenze else '[]'::jsonb end), 0) = 0
                and coalesce(jsonb_array_length(case when jsonb_typeof(x.presenze_registrate) = 'array' then x.presenze_registrate else '[]'::jsonb end), 0) = 0
                and coalesce(x.ore_lavorate, 0) + coalesce(x.ore_straordinario, 0) > 0))
       for update
  loop
    v_entry := null;
    select s into v_entry from jsonb_array_elements(case when jsonb_typeof(r.presenze_registrate) = 'array' then r.presenze_registrate else '[]'::jsonb end) s
     where s->>'employee_id' = e.id::text limit 1;
    v_nuova := v_entry is null;
    v_ore := case when v_nuova then coalesce(r.ore_lavorate, 0) + coalesce(r.ore_straordinario, 0) else coalesce((v_entry->>'ore')::numeric, 0) end;
    if v_ore <= 0 then continue; end if;
    v_costo := round(v_ore * v_tariffa, 2);
    v_fase := case when not v_nuova then nullif(v_entry->>'phase_id', '')::uuid
                   when jsonb_typeof(r.fasi_lavorate) = 'array' and jsonb_array_length(r.fasi_lavorate) = 1 then (r.fasi_lavorate->0->>'phase_id')::uuid end;
    select id into v_row from public.order_employees where order_id = r.order_id and employee_id = e.id and phase_id is not distinct from v_fase limit 1;
    if v_row is null then
      insert into public.order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost) values (r.order_id, e.id, v_fase, v_tariffa, v_ore, v_costo);
    else
      update public.order_employees
         set hours_worked = hours_worked + case when v_nuova then v_ore else 0 end,
             total_cost = total_cost + v_costo,
             hourly_rate = case when (hours_worked + case when v_nuova then v_ore else 0 end) > 0
                                then round((total_cost + v_costo) / (hours_worked + case when v_nuova then v_ore else 0 end), 2) else v_tariffa end
       where id = v_row;
    end if;
    if v_nuova then
      v_snap := jsonb_build_array(jsonb_build_object('employee_id', e.id, 'ore', v_ore, 'costo', v_costo, 'phase_id', v_fase));
    else
      select jsonb_agg(case when s->>'employee_id' = e.id::text then s || jsonb_build_object('costo', v_costo) else s end) into v_snap from jsonb_array_elements(r.presenze_registrate) s;
    end if;
    -- Solo la riga dei costi: i controlli del cantiere non c'entrano, chi completa la scheda puo' non avere le commesse.
    set local session_replication_role = replica;
    update public.campo_rapportini set costo_manodopera = coalesce(r.costo_manodopera, 0) + v_costo, presenze_registrate = v_snap where id = r.id;
    set local session_replication_role = origin;
    n := n + 1;
  end loop;
  return n;
end; $$;
revoke all on function public.rapportino_costo_recupera(uuid) from public, anon, authenticated;

create or replace function public.employees_costo_recupera_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  perform public.rapportino_costo_recupera(new.id);
  return null;
end; $$;
revoke all on function public.employees_costo_recupera_trg() from public, anon, authenticated;
drop trigger if exists trg_employees_costo_recupera on public.employees;
create trigger trg_employees_costo_recupera after insert or update of costo_orario, gross_salary, monthly_hours, inps_rate, profilo_costo, user_id on public.employees
  for each row execute function public.employees_costo_recupera_trg();

do $$
declare v text; a constant text := E'begin\n  if old.annullato_at is not null and new.stato is distinct from old.stato then';
begin
  select pg_get_functiondef(oid) into v from pg_proc where pronamespace = 'public'::regnamespace and proname = 'campo_rapportino_ufficio_non_riapprova';
  if position('giornale_lavori' in v) > 0 then return; end if;
  if position(a in v) = 0 then raise exception 'testo non riconosciuto'; end if;
  execute replace(v, a, E'begin\n  if new.stato = ''rifiutato'' and old.stato is distinct from ''rifiutato'' and exists (select 1 from public.giornale_lavori g where g.order_id = new.order_id and g.stato = ''firmata'' and new.id = any(g.source_rapportini_ids)) then\n    raise exception ''Non si può rifiutare: è riportato in una pagina firmata del giornale dei lavori. Scrivi un''''annotazione sul giornale.'' using errcode = ''23514'';\n  end if;\n  if old.annullato_at is not null and new.stato is distinct from old.stato then');
end $$;
