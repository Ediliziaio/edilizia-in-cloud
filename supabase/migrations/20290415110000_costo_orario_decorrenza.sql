-- Decorrenza dell'aumento nella scheda dipendente (15/11/2026).
--
-- Fino a ieri un costo nuovo valeva dal giorno in cui lo si scriveva
-- (20290415100000_costo_orario_alla_data_del_lavoro). Un aumento «dal 1° del mese» scritto il 15
-- lasciava i primi 14 giorni col costo vecchio. Ora la scheda manda anche la data da cui vale:
--
-- - personale_salva_costo accetta `decorrenza` (AAAA-MM-GG, da un anno fa a oggi) e la passa al
--   trigger dello storico con una variabile della sola transazione (eic.costo_decorrenza);
-- - private.costo_orario_registra scrive il costo da quella data e toglie le righe successive,
--   che il nuovo costo sostituisce;
-- - personale_costo dice da quando vale il costo, quanto era prima e quanti rapportini GIÀ
--   APPROVATI dopo quella data hanno ancora il costo di prima. Quelli non si toccano: un
--   documento approvato non cambia senza un passaggio esplicito.
--
-- Nessuna scrittura sui dati esistenti.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.costo_orario_registra(
  p_company uuid, p_tipo text, p_risorsa uuid, p_prima numeric, p_dopo numeric, p_origine text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_dal date;
  v_valido numeric;
begin
  -- La decorrenza la mette solo personale_salva_costo, validata; altrove vale oggi.
  v_dal := least(coalesce(nullif(current_setting('eic.costo_decorrenza', true), '')::date, v_oggi), v_oggi);

  insert into public.costi_orari_storico (company_id, tipo, risorsa_id, valido_dal, costo_orario, origine)
  values (p_company, p_tipo, p_risorsa, '-infinity', p_prima, 'prima della storia')
  on conflict (tipo, risorsa_id, valido_dal) do nothing;

  -- Le righe dopo la decorrenza le sostituisce il costo nuovo.
  delete from public.costi_orari_storico s
   where s.tipo = p_tipo and s.risorsa_id = p_risorsa and s.valido_dal > v_dal and s.valido_dal <= v_oggi;

  select s.costo_orario into v_valido
    from public.costi_orari_storico s
   where s.tipo = p_tipo and s.risorsa_id = p_risorsa and s.valido_dal < v_dal
   order by s.valido_dal desc limit 1;

  if v_valido is not distinct from p_dopo then
    -- Uguale al costo di prima della decorrenza: la riga della decorrenza non serve.
    delete from public.costi_orari_storico s
     where s.tipo = p_tipo and s.risorsa_id = p_risorsa and s.valido_dal = v_dal;
    return;
  end if;

  insert into public.costi_orari_storico (company_id, tipo, risorsa_id, valido_dal, costo_orario, origine)
  values (p_company, p_tipo, p_risorsa, v_dal, p_dopo, p_origine)
  on conflict (tipo, risorsa_id, valido_dal) do update
    set costo_orario = excluded.costo_orario, origine = excluded.origine,
        registrato_da = auth.uid(), registrato_il = now();
end; $function$;

REVOKE ALL ON FUNCTION private.costo_orario_registra(uuid, text, uuid, numeric, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.personale_salva_costo(p_profilo_id uuid, p_dati jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_h public.hr_profili;
  v_emp uuid;
  v_num numeric;
  v_dal date;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into v_h from public.hr_profili where id = p_profilo_id;
  if not found or not public.has_permission_for_company(auth.uid(), 'can_view_persone', v_h.company_id) then
    raise exception using errcode = '42501', message = 'Non puoi modificare il costo di questa persona.';
  end if;

  -- Da quando vale il costo nuovo: vuoto = oggi; nel passato al massimo un anno; mai nel futuro.
  if nullif(trim(coalesce(p_dati->>'decorrenza', '')), '') is not null then
    if (p_dati->>'decorrenza') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = '22023', message = 'La data da cui vale il costo non è valida.';
    end if;
    v_dal := (p_dati->>'decorrenza')::date;
    if v_dal > v_oggi then
      raise exception using errcode = '22023', message = 'Il costo non può valere da una data futura: scrivilo quel giorno.';
    end if;
    if v_dal < v_oggi - 366 then
      raise exception using errcode = '22023', message = 'Il costo può valere al massimo da un anno fa.';
    end if;
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

  perform set_config('eic.costo_decorrenza', coalesce(v_dal::text, ''), true);

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

  perform set_config('eic.costo_decorrenza', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.personale_costo(p_profilo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_h public.hr_profili;
  v_e public.employees;
  v_tipo text;
  v_inps numeric;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_ora record;
  v_prima numeric;
  v_da_aggiornare integer;
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

  -- Il costo che vale oggi nello storico, da quando, e quello di prima.
  select s.valido_dal, s.costo_orario into v_ora
    from public.costi_orari_storico s
   where s.tipo = 'dipendente' and s.risorsa_id = v_e.id and s.valido_dal <= v_oggi and s.valido_dal > '-infinity'
   order by s.valido_dal desc limit 1;
  if v_ora.valido_dal is not null then
    select s.costo_orario into v_prima
      from public.costi_orari_storico s
     where s.tipo = 'dipendente' and s.risorsa_id = v_e.id and s.valido_dal < v_ora.valido_dal
     order by s.valido_dal desc limit 1;
    -- Rapportini approvati dalla decorrenza con un costo diverso da quello che vale adesso.
    select count(*) into v_da_aggiornare
      from public.campo_rapportini r
     where r.company_id = v_h.company_id and r.approvato and r.annullato_at is null
       and r.data_lavoro >= v_ora.valido_dal
       and exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(r.presenze_registrate) = 'array' then r.presenze_registrate else '[]'::jsonb end) p
          where p->>'employee_id' = v_e.id::text and coalesce((p->>'ore')::numeric, 0) > 0
            and abs(coalesce((p->>'costo')::numeric, 0) - round((p->>'ore')::numeric * coalesce(v_ora.costo_orario, 0), 2)) > 0.01);
  end if;

  return jsonb_build_object(
    'ha_scheda_costo', v_h.employee_id is not null,
    'costo_orario', public.manodopera_costo_orario(v_h.employee_id),
    'costo_orario_scritto', case when coalesce(v_e.costo_orario, 0) > 0 then v_e.costo_orario end,
    'stipendio_lordo', v_e.gross_salary,
    'ore_mese', v_e.monthly_hours,
    'contributi_percento', v_e.inps_rate,
    'tipo', v_tipo,
    'inps_del_tipo', v_inps,
    'valido_dal', v_ora.valido_dal,
    'costo_precedente', v_prima,
    'rapportini_col_costo_di_prima', coalesce(v_da_aggiornare, 0)
  );
end;
$function$;
