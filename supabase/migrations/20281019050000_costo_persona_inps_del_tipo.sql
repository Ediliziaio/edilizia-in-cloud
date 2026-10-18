-- Scheda Personale → «Costo per le commesse» (19/10/2026).
-- L'INPS vuoto resta vuoto: vale quello del tipo di dipendente (costo_personale_parametri,
-- oppure i valori edili). Prima la lettura mostrava 28 e il salvataggio lo scriveva sulla
-- persona, che così scavalcava per sempre il valore del suo tipo (per un apprendista 11,61%).
-- La lettura dice anche il tipo e l'INPS che vale, per scriverlo nella schermata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.personale_costo(p_profilo_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_h public.hr_profili;
  v_e public.employees;
  v_tipo text;
  v_inps numeric;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found or not public.has_permission_for_company(auth.uid(), 'can_view_persone', v_h.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi vedere il costo di questa persona.';
  end if;
  select * into v_e from public.employees where id = v_h.employee_id;
  v_tipo := public.profilo_costo_dipendente(v_e.profilo_costo, v_e.role_type, v_e.qualifica, v_e.area);
  select coalesce(c.inps, d.inps) into v_inps
    from public.costo_personale_preset(v_tipo) d
    left join public.costo_personale_parametri c on c.company_id = v_h.company_id and c.profilo = v_tipo;
  return jsonb_build_object(
    'ha_scheda_costo', v_h.employee_id is not null,
    'costo_orario', public.manodopera_costo_orario(v_h.employee_id),
    'costo_orario_scritto', case when coalesce(v_e.costo_orario, 0) > 0 then v_e.costo_orario end,
    'stipendio_lordo', v_e.gross_salary,
    'ore_mese', v_e.monthly_hours,
    'contributi_percento', v_e.inps_rate,
    'tipo', v_tipo,
    'inps_del_tipo', v_inps
  );
end;
$$;
revoke all on function public.personale_costo(uuid) from public, anon;
grant execute on function public.personale_costo(uuid) to authenticated;

create or replace function public.personale_salva_costo(p_profilo_id uuid, p_dati jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_h public.hr_profili;
  v_emp uuid;
  v_num numeric;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found or not public.has_permission_for_company(auth.uid(), 'can_view_persone', v_h.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi modificare il costo di questa persona.';
  end if;

  v_emp := v_h.employee_id;
  if v_emp is null then
    perform set_config('manodopera.crea_da_scheda', 'on', true);
    insert into public.employees (company_id, first_name, last_name, email, phone, user_id, is_active, role_type, area, data_assunzione, qualifica)
    values (v_h.company_id, v_h.nome, v_h.cognome, nullif(trim(v_h.email), ''), v_h.telefono,
            case when v_h.user_id is not null
                      and not exists (select 1 from public.employees x where x.company_id = v_h.company_id and x.user_id = v_h.user_id)
                 then v_h.user_id end,
            coalesce(v_h.attivo, true),
            case when v_h.lavora_in_cantiere then 'operaio' else 'staff_interno' end,
            case when v_h.lavora_in_cantiere then 'cantiere' else 'amministrazione' end,
            v_h.data_assunzione, v_h.mansione)
    returning id into v_emp;
    perform set_config('manodopera.crea_da_scheda', '', true);
    update public.hr_profili set employee_id = v_emp where id = v_h.id;
  end if;

  if p_dati ? 'costo_orario' then
    v_num := public.numero_italiano(p_dati->>'costo_orario');
    if v_num is not null and v_num < 0 then
      raise exception using errcode = '22023', message = 'Il costo orario non può essere negativo.';
    end if;
    update public.employees set costo_orario = nullif(v_num, 0) where id = v_emp;
  end if;
  if p_dati ? 'stipendio_lordo' then
    update public.employees
       set gross_salary = public.numero_italiano(p_dati->>'stipendio_lordo')
     where id = v_emp;
  end if;
  if p_dati ? 'ore_mese' then
    update public.employees
       set monthly_hours = round(public.numero_italiano(p_dati->>'ore_mese'))::int
     where id = v_emp;
  end if;
  if p_dati ? 'contributi_percento' then
    -- Vuoto = vale l'INPS del tipo di dipendente.
    update public.employees
       set inps_rate = public.numero_italiano(p_dati->>'contributi_percento')
     where id = v_emp;
  end if;
end;
$$;
revoke all on function public.personale_salva_costo(uuid, jsonb) from public, anon;
grant execute on function public.personale_salva_costo(uuid, jsonb) to authenticated;
