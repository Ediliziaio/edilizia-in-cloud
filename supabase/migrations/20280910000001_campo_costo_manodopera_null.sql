-- Approvazione rapportino: costo orario assente → tariffa 0, non errore.
-- (fn_rapportino_costo_manodopera: unica riga cambiata, vedi commento nel corpo)
CREATE OR REPLACE FUNCTION public.fn_rapportino_costo_manodopera()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Le presenze del giorno; se assenti, fallback sull'autore (rapportino
    -- personale del singolo operaio: le sue ore, la sua scheda).
    if jsonb_typeof(new.presenze) = 'array' and jsonb_array_length(new.presenze) > 0 then
      v_pres := new.presenze;
    else
      select jsonb_build_array(jsonb_build_object(
               'employee_id', e.id,
               'ore', coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0)))
        into v_pres
        from employees e
       where e.company_id = new.company_id and e.user_id = new.user_id
       limit 1;
      v_pres := coalesce(v_pres, '[]'::jsonb);
    end if;

    for v_item in select * from jsonb_array_elements(v_pres) loop
      -- Subappaltatore presente: registrato, ma niente costo orario
      if v_item->>'employee_id' is null then continue; end if;

      select id into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      if v_ore <= 0 then continue; end if;

      -- Senza costo orario in scheda (dipendente appena creato) la riga di
      -- order_employees nasceva con hourly_rate NULL e l'approvazione saltava
      -- con «violates not-null constraint». Le ore si registrano comunque, a 0 €.
      v_tariffa := coalesce(public.costo_orario_dipendente(v_emp.id), 0);
      v_costo := round(v_ore * v_tariffa, 2);

      -- Niente `if v_costo > 0`: le ore lavorate vanno registrate comunque.
      select id into v_row_id
        from order_employees
       where order_id = new.order_id and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;
      if v_row_id is not null then
        -- La tariffa si ricalcola come media ponderata: sulla riga esistente
        -- restava quella del primo rapportino, quindi hourly_rate × ore non
        -- tornava più col total_cost e chi leggeva la commessa non capiva.
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
               total_cost   = greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0))
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
end $function$
;
