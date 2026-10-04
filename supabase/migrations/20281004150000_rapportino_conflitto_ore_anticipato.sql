-- ============================================================================
-- «Le ore si contano una volta sola»: l'ufficio lo vede PRIMA di premere Approva
-- ============================================================================
-- La migrazione 20281004140000 ferma al database l'approvazione che conterebbe due
-- volte le ore di una persona. Qui lo stesso controllo diventa visibile prima: la
-- schermata di approvazione chiede al database «se approvo questo, che succede?»
-- e mostra la stessa frase, senza ricopiare le regole nel browser (due copie
-- della stessa regola prima o poi divergono).
--
--   · campo_presenze_effettive(rapportino): UNA sola definizione di «chi e quante
--     ore registra questo rapportino» — presenze del giorno, oppure le ore
--     personali dell'autore. La usano il trigger di costo e l'anteprima.
--   · campo_rapportino_conflitto_ore(id): null se tutto torna, altrimenti la frase.
--     Solo per l'ufficio dell'azienda; non scrive nulla. Chi non è ufficio riceve
--     null: il controllo vero resta quello del trigger, che non si salta.
--
-- Idempotente. Cambia solo funzioni: nessuna riga esistente viene modificata.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_presenze_effettive(p_rapportino public.campo_rapportini)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_pres jsonb;
begin
  if jsonb_typeof(p_rapportino.presenze) = 'array' and jsonb_array_length(p_rapportino.presenze) > 0 then
    return p_rapportino.presenze;
  end if;
  -- rapportino personale del singolo operaio: le sue ore, la sua scheda
  select jsonb_build_array(jsonb_build_object(
           'employee_id', e.id,
           'ore', coalesce(p_rapportino.ore_lavorate, 0) + coalesce(p_rapportino.ore_straordinario, 0)))
    into v_pres
    from public.employees e
   where e.company_id = p_rapportino.company_id and e.user_id = p_rapportino.user_id
   limit 1;
  return coalesce(v_pres, '[]'::jsonb);
end;
$$;
revoke all on function public.campo_presenze_effettive(public.campo_rapportini) from public, anon, authenticated;

create or replace function public.campo_rapportino_conflitto_ore(p_rapportino_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  r public.campo_rapportini;
  v_item jsonb;
  v_emp uuid;
  v_ore numeric;
begin
  select * into r from public.campo_rapportini where id = p_rapportino_id;
  if not found or auth.uid() is null or not public.campo_e_ufficio(r.company_id) then
    return null;
  end if;

  for v_item in select * from jsonb_array_elements(public.campo_presenze_effettive(r)) loop
    if v_item->>'employee_id' is null then continue; end if;
    v_emp := (v_item->>'employee_id')::uuid;
    if not exists (select 1 from public.employees where id = v_emp and company_id = r.company_id) then continue; end if;
    v_ore := coalesce((v_item->>'ore')::numeric, 0);
    if v_ore <= 0 then continue; end if;
    begin
      perform public.campo_controlla_ore_persona(r.company_id, r.order_id, v_emp, r.data_lavoro, v_ore, r.id);
    exception when raise_exception then
      return sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function public.campo_rapportino_conflitto_ore(uuid) from public, anon;
grant execute on function public.campo_rapportino_conflitto_ore(uuid) to authenticated;

-- Il trigger di costo usa la definizione unica delle presenze; il resto è identico
create or replace function public.fn_rapportino_costo_manodopera()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fase uuid;
  v_pres jsonb;
  v_item jsonb;
  v_emp record;
  v_tariffa numeric;
  v_ore numeric;
  v_costo numeric;
  v_totale numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_row_id uuid;
begin
  -- ── APPROVAZIONE ─────────────────────────────────────────────────────────
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    -- Fase: attribuzione solo se il rapportino ne dichiara UNA
    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    v_pres := public.campo_presenze_effettive(new);

    for v_item in select * from jsonb_array_elements(v_pres) loop
      -- Subappaltatore presente: registrato, ma niente costo orario
      if v_item->>'employee_id' is null then continue; end if;

      select id into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      if v_ore <= 0 then continue; end if;

      -- Le ore di una persona si contano una volta sola (vedi 20281004140000)
      perform public.campo_controlla_ore_persona(new.company_id, new.order_id, v_emp.id, new.data_lavoro, v_ore, new.id);

      -- Senza costo orario in scheda le ore si registrano comunque, a 0 €
      v_tariffa := coalesce(public.costo_orario_dipendente(v_emp.id), 0);
      v_costo := round(v_ore * v_tariffa, 2);

      select id into v_row_id
        from order_employees
       where order_id = new.order_id and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;
      if v_row_id is not null then
        -- tariffa come media ponderata: hourly_rate × ore deve tornare col total_cost
        update order_employees
           set hours_worked = hours_worked + v_ore,
               total_cost   = total_cost + v_costo,
               hourly_rate  = case when (hours_worked + v_ore) > 0
                                   then round((total_cost + v_costo) / (hours_worked + v_ore), 2)
                                   else v_tariffa end
         where id = v_row_id;
      else
        insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
        values (new.order_id, v_emp.id, v_fase, v_tariffa, v_ore, v_costo);
      end if;

      v_totale := v_totale + v_costo;
      v_snapshot := v_snapshot || jsonb_build_object(
        'employee_id', v_emp.id, 'ore', v_ore, 'costo', v_costo,
        'phase_id', v_fase);
    end loop;

    new.costo_manodopera := v_totale;
    new.presenze_registrate := v_snapshot;
    new.costo_registrato_at := now();
    return new;
  end if;

  -- ── REVOCA: storno esatto dallo snapshot ─────────────────────────────────
  if old.stato = 'approvato' and new.stato is distinct from 'approvato'
     and old.costo_registrato_at is not null then

    if jsonb_typeof(old.presenze_registrate) = 'array' then
      for v_item in select * from jsonb_array_elements(old.presenze_registrate) loop
        update order_employees
           set hours_worked = greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)),
               total_cost   = greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)),
               hourly_rate = case
                 when greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)) > 0
                 then round(
                   greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)) /
                   greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)), 2)
                 else 0
               end
         where id = (
           select id from order_employees
            where order_id = new.order_id
              and employee_id = (v_item->>'employee_id')::uuid
              and phase_id is not distinct from nullif(v_item->>'phase_id','')::uuid
            limit 1
         );
      end loop;
    end if;

    new.costo_manodopera := null;
    new.presenze_registrate := null;
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $function$;
