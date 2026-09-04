-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.1 — parte 3 di 3: scrivere il cedolino e darlo alla stampa
-- ════════════════════════════════════════════════════════════════════════════
--
-- silvio_tool_genera_cedolino_dipendente inseriva un segnaposto vuoto e
-- rimandava tutto a «edge function genera-cedolino-pdf-async», che in
-- supabase/functions non esiste. Nessuno riempiva quel segnaposto: hr_cedolini
-- aveva zero righe da sempre, su 2.039 timbrature registrate.
-- In più inseriva stato='draft', che il vincolo hr_cedolini_stato_check non
-- ammette (bozza / emesso / pagato): anche il segnaposto sarebbe stato rifiutato.

CREATE OR REPLACE FUNCTION public.cedolino_genera(
  p_employee_id uuid,
  p_anno        integer,
  p_mese        integer,
  p_rigenera    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calc jsonb; v_company uuid; v_id uuid; v_esistente record;
BEGIN
  SELECT e.company_id INTO v_company FROM public.employees e WHERE e.id = p_employee_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dipendente non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF public.cedolino_visibile_a_chi_chiede(p_employee_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_permesso('can_edit_settings_people', 'generare un cedolino');

  SELECT id, stato INTO v_esistente
    FROM public.hr_cedolini
   WHERE employee_id = p_employee_id AND anno = p_anno AND mese = p_mese;

  -- Un cedolino già emesso o pagato non si riscrive di nascosto.
  IF v_esistente.id IS NOT NULL AND v_esistente.stato <> 'bozza' THEN
    RETURN jsonb_build_object('ok', false, 'cedolino_id', v_esistente.id,
      'motivo', format('il cedolino %s/%s è già in stato %s: non si riscrive',
                       p_mese, p_anno, v_esistente.stato));
  END IF;
  IF v_esistente.id IS NOT NULL AND NOT p_rigenera THEN
    RETURN jsonb_build_object('ok', true, 'cedolino_id', v_esistente.id, 'gia_presente', true,
      'motivo', format('cedolino %s/%s già in bozza: passa p_rigenera per rifarlo', p_mese, p_anno));
  END IF;

  v_calc := public.cedolino_calcola(p_employee_id, p_anno, p_mese);
  IF (v_calc ->> 'calcolabile') <> 'true' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_calc ->> 'motivo',
      'dato_mancante', v_calc ->> 'dato_mancante');
  END IF;

  INSERT INTO public.hr_cedolini (
    company_id, employee_id, anno, mese,
    lordo, contributi_dipendente, ritenute_irpef, netto,
    ore_lavorate, ore_ordinarie,
    ore_straordinario, ore_straordinario_25, ore_straordinario_50, ore_straordinario_100,
    ore_assenza_giustificate, ore_assenza_non_giustificate,
    stato, generation_method, validation_warnings, note
  ) VALUES (
    v_company, p_employee_id, p_anno, p_mese,
    (v_calc->>'lordo')::numeric,
    (v_calc->>'contributi_dipendente')::numeric,
    (v_calc->>'ritenute_irpef')::numeric,
    (v_calc->>'netto')::numeric,
    (v_calc->'ore'->>'ore_ordinarie')::numeric + (v_calc->'ore'->>'ore_straordinario_totali')::numeric,
    (v_calc->'ore'->>'ore_ordinarie')::numeric,
    (v_calc->'ore'->>'ore_straordinario_totali')::numeric,
    (v_calc->'ore'->>'ore_straordinario_25')::numeric,
    (v_calc->'ore'->>'ore_straordinario_50')::numeric,
    (v_calc->'ore'->>'ore_straordinario_100')::numeric,
    (v_calc->'ore'->>'ore_assenza_giustificate')::numeric,
    (v_calc->>'ore_non_giustificate')::numeric,
    'bozza', 'auto_ai',
    jsonb_build_object('avvisi', v_calc->'avvisi', 'ipotesi', v_calc->'ipotesi'),
    'Calcolato dalle timbrature del periodo. Da rivedere prima dell''emissione.'
  )
  ON CONFLICT (employee_id, anno, mese) DO UPDATE SET
    lordo = EXCLUDED.lordo,
    contributi_dipendente = EXCLUDED.contributi_dipendente,
    ritenute_irpef = EXCLUDED.ritenute_irpef,
    netto = EXCLUDED.netto,
    ore_lavorate = EXCLUDED.ore_lavorate,
    ore_ordinarie = EXCLUDED.ore_ordinarie,
    ore_straordinario = EXCLUDED.ore_straordinario,
    ore_straordinario_25 = EXCLUDED.ore_straordinario_25,
    ore_straordinario_50 = EXCLUDED.ore_straordinario_50,
    ore_straordinario_100 = EXCLUDED.ore_straordinario_100,
    ore_assenza_giustificate = EXCLUDED.ore_assenza_giustificate,
    ore_assenza_non_giustificate = EXCLUDED.ore_assenza_non_giustificate,
    validation_warnings = EXCLUDED.validation_warnings,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'cedolino_id', v_id,
                            'rigenerato', v_esistente.id IS NOT NULL, 'calcolo', v_calc);
END $function$;

-- ── I due ingressi storici delegano, invece di fare finta ────────────────────
-- Restano con la stessa firma perché sono strumenti dell'assistente AI e
-- qualcuno potrebbe chiamarli. Dentro, però, ora c'è il conto vero.

CREATE OR REPLACE FUNCTION public.silvio_tool_calcola_ore_mese_dipendente(
  p_company_id uuid, p_user_id uuid, p_employee_id uuid, p_year integer, p_month integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.cedolino_ore_periodo(p_employee_id, p_year, p_month);
END $function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_genera_cedolino_dipendente(
  p_company_id uuid, p_user_id uuid, p_employee_id uuid, p_year integer, p_month integer,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.cedolino_genera(p_employee_id, p_year, p_month, p_force_regenerate);
END $function$;

-- ── Tutto quello che serve per stampare, già calcolato ───────────────────────
-- La stampante non deve avere una sua copia delle aliquote: chiede qui.
-- Legge indifferentemente le due tabelle cedolini che convivono nel prodotto:
-- `cedolini`, compilata a mano dalla scheda Personale e stampata dal PDF, e
-- `hr_cedolini`, prodotta dalle timbrature e letta dal portale di campo.
CREATE OR REPLACE FUNCTION public.cedolino_per_stampa(p_cedolino_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE c record; h record; v_calc jsonb; v_nome text;
BEGIN
  SELECT * INTO c FROM public.cedolini WHERE id = p_cedolino_id;
  IF c.id IS NOT NULL THEN
    IF public.cedolino_visibile_a_chi_chiede(c.employee_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
    END IF;
    IF coalesce(c.lordo, 0) <= 0 THEN
      RETURN jsonb_build_object('stampabile', false,
        'motivo', 'la riga non ha un lordo: non c''è un cedolino da stampare, solo un segnaposto');
    END IF;
    RETURN jsonb_build_object('stampabile', true, 'origine', 'cedolini',
      'id', c.id, 'employee_name', c.employee_name, 'anno', c.anno, 'mese', c.mese,
      'stato', coalesce(c.stato, 'bozza'), 'note', c.note, 'lordo', c.lordo,
      'contributi_dipendente', coalesce(c.contributi_dipendente, round(c.lordo * 0.0959, 2)),
      'contributi_datore',     coalesce(c.contributi_datore,     round(c.lordo * 0.3435, 2)),
      'cassa_edile_dipendente', round(c.lordo * 0.0040, 2),
      'cassa_edile_datore',     round(c.lordo * 0.0165, 2),
      'ritenute_irpef', c.ritenute_irpef, 'netto', c.netto,
      'costo_azienda', c.lordo + coalesce(c.contributi_datore, round(c.lordo * 0.3435, 2)));
  END IF;

  SELECT * INTO h FROM public.hr_cedolini WHERE id = p_cedolino_id;
  IF h.id IS NULL THEN
    RETURN jsonb_build_object('stampabile', false, 'motivo', 'cedolino non trovato');
  END IF;
  IF public.cedolino_visibile_a_chi_chiede(h.employee_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT e.first_name || ' ' || e.last_name INTO v_nome
    FROM public.employees e WHERE e.id = h.employee_id;

  IF coalesce(h.lordo, 0) <= 0 THEN
    -- Riga ancora vuota: si ricalcola dalle timbrature invece di stampare zeri.
    v_calc := public.cedolino_calcola(h.employee_id, h.anno, h.mese);
    IF (v_calc ->> 'calcolabile') <> 'true' THEN
      RETURN jsonb_build_object('stampabile', false, 'motivo', v_calc ->> 'motivo');
    END IF;
    RETURN jsonb_build_object('stampabile', true, 'origine', 'hr_cedolini (ricalcolato)',
      'id', h.id, 'employee_name', coalesce(v_nome, 'Dipendente'),
      'anno', h.anno, 'mese', h.mese, 'stato', coalesce(h.stato, 'bozza'), 'note', h.note,
      'lordo', (v_calc->>'lordo')::numeric,
      'contributi_dipendente', (v_calc->>'contributi_dipendente')::numeric,
      'contributi_datore', (v_calc->>'contributi_datore')::numeric,
      'cassa_edile_dipendente', (v_calc->>'cassa_edile_dipendente')::numeric,
      'cassa_edile_datore', (v_calc->>'cassa_edile_datore')::numeric,
      'ritenute_irpef', (v_calc->>'ritenute_irpef')::numeric,
      'netto', (v_calc->>'netto')::numeric,
      'costo_azienda', (v_calc->>'costo_azienda')::numeric,
      'avvisi', v_calc->'avvisi', 'ipotesi', v_calc->'ipotesi');
  END IF;

  RETURN jsonb_build_object('stampabile', true, 'origine', 'hr_cedolini',
    'id', h.id, 'employee_name', coalesce(v_nome, 'Dipendente'),
    'anno', h.anno, 'mese', h.mese, 'stato', coalesce(h.stato, 'bozza'), 'note', h.note,
    'lordo', h.lordo,
    'contributi_dipendente', coalesce(h.contributi_dipendente, round(h.lordo * 0.0959, 2)),
    'contributi_datore', round(h.lordo * 0.3435, 2),
    'cassa_edile_dipendente', round(h.lordo * 0.0040, 2),
    'cassa_edile_datore', round(h.lordo * 0.0165, 2),
    'ritenute_irpef', h.ritenute_irpef, 'netto', h.netto,
    'costo_azienda', h.lordo + round(h.lordo * 0.3435, 2),
    'ore_ordinarie', h.ore_ordinarie, 'ore_straordinario', h.ore_straordinario,
    'avvisi', h.validation_warnings->'avvisi', 'ipotesi', h.validation_warnings->'ipotesi');
END $function$;

REVOKE ALL ON FUNCTION public.cedolino_genera(uuid, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cedolino_per_stampa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cedolino_genera(uuid, integer, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cedolino_per_stampa(uuid) TO authenticated, service_role;
