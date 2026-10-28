-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Safety patch only: no historical payroll values are recalculated.
-- Sources and limitations: docs/paghe-benefit-piano-20261026.md
-- Missing imported employer contributions remain unknown, not an artificial zero.
alter table public.hr_cedolini alter column contributi_datore drop not null, alter column contributi_datore drop default;
CREATE OR REPLACE FUNCTION public.cedolino_calcola_base(p_employee_id uuid, p_anno integer, p_mese integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k_inps_dip    constant numeric := 0.0919;
  k_inps_dat    constant numeric := 0.2870;
  k_inail_dat   constant numeric := 0.0380;
  k_ce_dip      constant numeric := 0.0040;
  k_ce_dat      constant numeric := 0.0165;
  k_cometa_dat  constant numeric := 0.0020;
  v_emp record; v_ore jsonb; v_avvisi jsonb := '[]'::jsonb;
  v_paga_oraria numeric; v_ore_ord numeric; v_ore_ass numeric; v_ore_mancanti numeric;
  v_lordo_strd numeric; v_lordo numeric; v_contr_dip numeric; v_contr_dat numeric;
  v_imponibile numeric; v_imp_annuo numeric; v_irpef_lorda numeric; v_detrazione numeric;
  v_irpef_annua numeric; v_aliquota numeric; v_irpef_mese numeric;
BEGIN
  IF p_anno IS NULL OR p_anno NOT BETWEEN 2024 AND 2026 OR p_mese IS NULL OR p_mese NOT BETWEEN 1 AND 12 THEN
    RETURN jsonb_build_object('calcolabile',false,'motivo','Anno non coperto dalle regole indicative: serve verifica del consulente','dato_mancante','regole_anno');
  END IF;
  SELECT e.id, e.company_id, e.first_name, e.last_name, e.gross_salary,
         e.monthly_hours, e.is_active
    INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'dipendente non trovato' USING ERRCODE='P0002'; END IF;
  IF public.cedolino_visibile_a_chi_chiede(p_employee_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;
  IF v_emp.gross_salary IS NULL OR v_emp.gross_salary <= 0 OR v_emp.gross_salary>1000000000 THEN
    RETURN jsonb_build_object('calcolabile', false,
      'motivo', format('%s %s non ha una retribuzione lorda mensile in anagrafica',
                       v_emp.first_name, v_emp.last_name),
      'dato_mancante', 'employees.gross_salary',
      'employee_id', p_employee_id, 'anno', p_anno, 'mese', p_mese);
  END IF;
  IF v_emp.monthly_hours IS NULL OR v_emp.monthly_hours <= 0 OR v_emp.monthly_hours>744 THEN
    RETURN jsonb_build_object('calcolabile', false,
      'motivo', format('%s %s non ha le ore mensili contrattuali in anagrafica',
                       v_emp.first_name, v_emp.last_name),
      'dato_mancante', 'employees.monthly_hours',
      'employee_id', p_employee_id, 'anno', p_anno, 'mese', p_mese);
  END IF;

  v_ore := public.cedolino_ore_periodo(p_employee_id, p_anno, p_mese);
  IF (v_ore ->> 'calcolabile') IS DISTINCT FROM 'true' THEN RETURN v_ore; END IF;

  v_paga_oraria := v_emp.gross_salary / v_emp.monthly_hours;
  v_ore_ord := (v_ore ->> 'ore_ordinarie')::numeric;
  v_ore_ass := (v_ore ->> 'ore_assenza_giustificate')::numeric;
  v_ore_mancanti := greatest(v_emp.monthly_hours - v_ore_ord - v_ore_ass, 0);
  IF v_ore_ord IS NULL OR v_ore_ass IS NULL OR v_ore_ord<0 OR v_ore_ass<0 OR jsonb_array_length(coalesce(v_ore->'anomalie','[]'::jsonb)) > 0 OR v_ore_mancanti > 0.01 OR v_ore_ord + v_ore_ass <= 0 THEN
    RETURN jsonb_build_object('calcolabile',false,'motivo','Registro ore incompleto o con anomalie: nessuna trattenuta automatica sul lordo. Verifica con HR e consulente.',
      'dato_mancante','registro_ore_verificato','ore_da_verificare',v_ore_mancanti,'anomalie',v_ore->'anomalie','da_rivedere_da_un_consulente',true);
  END IF;
  v_lordo_strd :=
      (v_ore ->> 'ore_straordinario_25')::numeric  * v_paga_oraria * 1.25
    + (v_ore ->> 'ore_straordinario_50')::numeric  * v_paga_oraria * 1.50
    + (v_ore ->> 'ore_straordinario_100')::numeric * v_paga_oraria * 2.00;
  v_lordo := round(v_emp.gross_salary + v_lordo_strd, 2);

  IF jsonb_array_length(v_ore -> 'anomalie') > 0 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','timbrature_incomplete',
      'testo', format('%s giornate hanno timbrature spaiate e non sono state conteggiate',
                      jsonb_array_length(v_ore -> 'anomalie')),
      'dettaglio', v_ore -> 'anomalie');
  END IF;
  IF v_ore_ord + v_ore_ass = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','nessuna_ora',
      'testo','nessuna ora lavorata né assenza approvata nel periodo: il lordo risulta azzerato dalle trattenute');
  ELSIF v_ore_ord + v_ore_ass < v_emp.monthly_hours * 0.5 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','ore_sotto_meta',
      'testo', format('ore retribuite (%s) sotto la metà delle ore contrattuali (%s)',
                      round(v_ore_ord + v_ore_ass, 2), v_emp.monthly_hours));
  END IF;
  IF v_emp.is_active IS NOT TRUE THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','dipendente_non_attivo',
      'testo','il dipendente non risulta attivo in anagrafica');
  END IF;

  v_contr_dip := round(v_lordo * (k_inps_dip + k_ce_dip), 2);
  v_contr_dat := round(v_lordo * (k_inps_dat + k_inail_dat + k_ce_dat + k_cometa_dat), 2);
  v_imponibile := v_lordo - v_contr_dip;
  v_imp_annuo := (v_emp.gross_salary * 12) * (1 - k_inps_dip - k_ce_dip);

  IF    v_imp_annuo <= 28000 THEN v_irpef_lorda := v_imp_annuo * 0.23;
  ELSIF v_imp_annuo <= 50000 THEN v_irpef_lorda := 6440 + (v_imp_annuo - 28000) * CASE WHEN p_anno=2026 THEN 0.33 ELSE 0.35 END;
  ELSE                            v_irpef_lorda := CASE WHEN p_anno=2026 THEN 13700 ELSE 14140 END + (v_imp_annuo - 50000) * 0.43;
  END IF;
  IF    v_imp_annuo <= 15000 THEN v_detrazione := 1955;
  ELSIF v_imp_annuo <= 28000 THEN v_detrazione := 1910 + 1190 * ((28000 - v_imp_annuo) / 13000);
  ELSIF v_imp_annuo <= 50000 THEN v_detrazione := 1910 * ((50000 - v_imp_annuo) / 22000);
  ELSE                            v_detrazione := 0;
  END IF;
  v_irpef_annua := greatest(v_irpef_lorda - v_detrazione, 0);
  v_aliquota    := CASE WHEN v_imp_annuo > 0 THEN v_irpef_annua / v_imp_annuo ELSE 0 END;
  v_irpef_mese  := round(greatest(v_imponibile, 0) * v_aliquota, 2);

  RETURN jsonb_build_object(
    'calcolabile', true, 'tipo_risultato','stima_non_validata','versione_regole','indicativa-2026-10','anno_regole',p_anno, 'employee_id', p_employee_id,
    'dipendente', v_emp.first_name || ' ' || v_emp.last_name,
    'company_id', v_emp.company_id, 'anno', p_anno, 'mese', p_mese,
    'paga_oraria', round(v_paga_oraria, 4), 'ore', v_ore - 'giorni',
    'ore_non_giustificate', 0,
    'lordo_contratto', v_emp.gross_salary,
    'trattenuta_ore_mancanti', 0,
    'competenze_straordinario', round(v_lordo_strd, 2),
    'lordo', v_lordo,
    'contributi_dipendente', v_contr_dip, 'contributi_datore', v_contr_dat,
    'imponibile_fiscale', round(v_imponibile, 2), 'ritenute_irpef', v_irpef_mese,
    'aliquota_media_applicata', round(v_aliquota * 100, 2),
    'netto', round(v_lordo - v_contr_dip - v_irpef_mese, 2),
    'costo_azienda', round(v_lordo + v_contr_dat, 2),
    'avvisi', v_avvisi,
    'ipotesi', jsonb_build_array(
      'Parametri contributivi storici fissi, NON validati per CCNL/territorio/persona: comprendono anche un vecchio parametro fondo da verificare. Non usare per liquidare paghe',
      CASE WHEN p_anno=2026 THEN 'Stima IRPEF 2026: 23/33/43%; non comprende tutte le misure e i conguagli' ELSE 'Stima IRPEF 2024-2025: 23/35/43%; non comprende tutti i conguagli' END,
      'detrazione lavoro dipendente art. 13 TUIR calcolata sul reddito annuo da contratto',
      'straordinario maggiorato 25% feriale, 50% sabato, 100% domenica e festivi nazionali',
      'Nessuna trattenuta per ore mancanti: incongruenze del registro bloccano la stima',
      'nessuna tredicesima, TFR, addizionali regionali o comunali, trasferta o premio: vanno aggiunti a mano'),
    'da_rivedere_da_un_consulente', true);
END $function$;

revoke all on function public.cedolino_calcola_base(uuid,integer,integer) from public,anon;

-- A formatted estimate must never replace the original payslip.
create or replace function public.cedolino_per_stampa(p_cedolino_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare c record;
begin
  select employee_id into c from public.hr_cedolini where id=p_cedolino_id;
  if not found then return jsonb_build_object('stampabile',false,'motivo','Documento non accessibile'); end if;
  if public.cedolino_visibile_a_chi_chiede(c.employee_id) is distinct from true then raise exception 'Accesso negato' using errcode='42501'; end if;
  return jsonb_build_object('stampabile',false,'motivo','Il prospetto interno non è una busta paga. Carica e apri il PDF originale validato dal consulente: non vengono ricostruiti contributi o fondi mancanti.');
end $$;
revoke all on function public.cedolino_per_stampa(uuid) from public,anon;
grant execute on function public.cedolino_per_stampa(uuid) to authenticated;

create schema if not exists private;
create function private.hr_paghe_richiede_originale()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;
begin
  select * into c from public.hr_cedolini where id=new.id;
  if not found or c.stato='bozza' then return null; end if;
  if not exists(select 1 from public.hr_paghe_documenti d where d.company_id=c.company_id
    and d.employee_id=c.employee_id and d.anno=c.anno and d.mese=c.mese and d.tipo='cedolino'
    and d.sostituito_da is null and nullif(d.file_path,'') is not null
    and (d.cedolino_id=c.id or c.documento_id=d.id)) then
    raise exception 'Il prospetto non può diventare emesso o pagato senza il PDF originale del consulente collegato allo stesso dipendente e periodo';
  end if;
  return null;
end $$;
revoke all on function private.hr_paghe_richiede_originale() from public,anon,authenticated;
create constraint trigger hr_paghe_originale_confermato after insert or update on public.hr_cedolini
  deferrable initially deferred for each row execute function private.hr_paghe_richiede_originale();

CREATE OR REPLACE FUNCTION public.paghe_scrivi_cedolino(p_doc uuid, p_pubblica boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  v_esistente uuid;
  v_stato text;
  v_ced uuid;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into v from public.hr_paghe_documenti where id = p_doc;
  if v.tipo <> 'cedolino' or not v.per_dipendente or v.employee_id is null or v.anno is null or v.mese is null then
    return null;
  end if;
  select id, stato into v_esistente, v_stato from public.hr_cedolini
   where employee_id = v.employee_id and anno = v.anno and mese = v.mese;
  if not p_pubblica and v_esistente is not null and v_stato <> 'bozza' then
    return null;
  end if;

  insert into public.hr_cedolini (
    company_id, employee_id, anno, mese, lordo, netto, contributi_dipendente, ritenute_irpef,
    stato, generation_method, documento_id, data_emissione)
  values (
    v.company_id, v.employee_id, v.anno, v.mese,
    (v.dati->>'lordo')::numeric, (v.dati->>'netto')::numeric,
    (v.dati->>'contributi_dipendente')::numeric, (v.dati->>'ritenute_irpef')::numeric,
    case when p_pubblica then 'emesso' else 'bozza' end, 'imported', p_doc,
    case when p_pubblica then v_oggi end)
  on conflict (employee_id, anno, mese) do update set
    lordo = (v.dati->>'lordo')::numeric,
    netto = (v.dati->>'netto')::numeric,
    contributi_dipendente = (v.dati->>'contributi_dipendente')::numeric,
    ritenute_irpef = (v.dati->>'ritenute_irpef')::numeric,
    contributi_datore = null,
    stato = case when hr_cedolini.stato = 'pagato' then 'pagato' when p_pubblica then 'emesso' else 'bozza' end,
    generation_method = 'imported',
    documento_id = p_doc,
    data_emissione = case when p_pubblica then coalesce(hr_cedolini.data_emissione, v_oggi) else hr_cedolini.data_emissione end
  returning id into v_ced;

  update public.hr_paghe_documenti set cedolino_id = v_ced where id = p_doc;
  return v_ced;
end;
$function$;
revoke all on function public.paghe_scrivi_cedolino(uuid,boolean) from public,anon,authenticated;
