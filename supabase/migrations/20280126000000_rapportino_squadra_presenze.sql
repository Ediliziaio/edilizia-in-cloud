-- ============================================================================
-- Rapportino di SQUADRA: le presenze del giorno, non solo l'autore
-- ============================================================================
-- Flusso reale (Florin): in cantiere ci sono più operai e più subappaltatori,
-- ma il rapportino con le foto lo fa UNO (capocantiere o chi segue i lavori).
-- Il costo va quindi calcolato per OGNI dipendente presente (ore sue × sua
-- tariffa), non per chi ha scritto il rapportino. I subappaltatori presenti
-- sono registrati ma non costano a ore: il loro costo è il contratto/SAL.

-- GIÀ APPLICATA sul live (08/08 via Management API). Testata E2E su Demo:
-- squadra 2 dipendenti (8h×28,50 + 6h×24 = 372,00 €) + 1 sub (presenza,
-- zero costo); revoca → storno esatto dallo snapshot presenze_registrate.
alter table public.campo_rapportini add column if not exists presenze jsonb;
-- Snapshot di ciò che è stato registrato all'approvazione: lo storno alla
-- revoca sottrae ESATTAMENTE questi importi, anche se nel frattempo le
-- tariffe sono cambiate.
alter table public.campo_rapportini add column if not exists presenze_registrate jsonb;

create or replace function public.fn_rapportino_costo_manodopera()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_fase uuid;
  v_pres jsonb;
  v_item jsonb;
  v_emp record;
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

      select id, costo_orario into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      v_costo := round(v_ore * coalesce(v_emp.costo_orario, 0), 2);
      if v_ore <= 0 then continue; end if;

      if v_costo > 0 then
        select id into v_row_id
          from order_employees
         where order_id = new.order_id and employee_id = v_emp.id
           and phase_id is not distinct from v_fase
         limit 1;
        if v_row_id is not null then
          update order_employees
             set hours_worked = hours_worked + v_ore,
                 total_cost   = total_cost + v_costo
           where id = v_row_id;
        else
          insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
          values (new.order_id, v_emp.id, v_fase, coalesce(v_emp.costo_orario, 0), v_ore, v_costo);
        end if;
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
end $$;
