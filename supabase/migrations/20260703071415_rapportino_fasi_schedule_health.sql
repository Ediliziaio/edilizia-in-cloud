-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Fase C rapportini: dichiarazione per fasi + semaforo tempi.

-- Fasi su cui l'operaio dichiara di aver lavorato: [{phase_id, percentuale}]
ALTER TABLE public.campo_rapportini
  ADD COLUMN IF NOT EXISTS fasi_lavorate jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Avanzamento per fase (0-100), aggiornato dai rapportini
ALTER TABLE public.order_work_phases
  ADD COLUMN IF NOT EXISTS percentuale integer NOT NULL DEFAULT 0
  CHECK (percentuale >= 0 AND percentuale <= 100);

-- Semaforo tempi commessa: confronta avanzamento atteso (interpolazione
-- lineare start_date→end_date a oggi) con quello reale, fase per fase.
-- SECURITY INVOKER: rispetta la RLS di order_work_phases del chiamante.
CREATE OR REPLACE FUNCTION public.order_schedule_health(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_fasi jsonb := '[]'::jsonb;
  v_worst numeric := NULL;
  v_worst_name text := NULL;
  v_worst_days numeric := NULL;
  r record;
  v_expected numeric;
  v_actual numeric;
  v_delta numeric;
  v_days numeric;
  v_stato text;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT id, name, status, start_date, end_date, percentuale
    FROM public.order_work_phases
    WHERE order_id = p_order_id AND start_date IS NOT NULL AND end_date IS NOT NULL
      AND end_date >= start_date
    ORDER BY position
  LOOP
    v_n := v_n + 1;
    v_actual := CASE WHEN r.status = 'completata' THEN 100 ELSE COALESCE(r.percentuale, 0) END;
    IF CURRENT_DATE <= r.start_date THEN v_expected := 0;
    ELSIF CURRENT_DATE >= r.end_date THEN v_expected := 100;
    ELSE v_expected := round(100.0 * (CURRENT_DATE - r.start_date) / GREATEST(1, r.end_date - r.start_date));
    END IF;
    v_delta := v_actual - v_expected;
    -- scarto in giorni: delta% applicato alla durata della fase
    v_days := round(v_delta / 100.0 * GREATEST(1, r.end_date - r.start_date), 1);

    v_fasi := v_fasi || jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status,
      'expected_pct', v_expected, 'actual_pct', v_actual,
      'delta_pct', v_delta, 'giorni_scarto', v_days
    );

    -- La fase peggiore guida il semaforo (ignora fasi completate: non sono un rischio)
    IF r.status <> 'completata' AND (v_worst IS NULL OR v_delta < v_worst) THEN
      v_worst := v_delta;
      v_worst_name := r.name;
      v_worst_days := v_days;
    END IF;
  END LOOP;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('stato', 'non_configurato', 'fasi', '[]'::jsonb, 'n_fasi_datate', 0);
  END IF;

  v_stato := CASE
    WHEN v_worst IS NULL THEN 'in_linea'          -- tutte completate
    WHEN v_worst <= -10 THEN 'in_ritardo'
    WHEN v_worst >= 5 THEN 'in_anticipo'
    ELSE 'in_linea'
  END;

  RETURN jsonb_build_object(
    'stato', v_stato,
    'delta_pct', v_worst,
    'giorni_scarto', v_worst_days,
    'fase_critica', v_worst_name,
    'fasi', v_fasi,
    'n_fasi_datate', v_n
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.order_schedule_health(uuid) TO authenticated;
