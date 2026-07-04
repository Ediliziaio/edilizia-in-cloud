-- RPC auto-KPI per persona: presenza %, ore mese, task completati/totali.
-- Fonti reali: hr_giornate (data, ore_lavorate), hr_task (scadenza, stato).

CREATE OR REPLACE FUNCTION public.hr_persona_kpi_auto(p_profilo_id uuid, p_periodo text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start date := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  v_end date := (to_date(p_periodo || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
  v_ore numeric := 0;
  v_presenza numeric := 0;
  v_task_tot int := 0;
  v_task_done int := 0;
BEGIN
  SELECT COALESCE(sum(ore_lavorate), 0) INTO v_ore
  FROM public.hr_giornate
  WHERE profilo_id = p_profilo_id AND data >= v_start AND data < v_end;

  SELECT CASE WHEN count(*) = 0 THEN 0
    ELSE round(100.0 * count(*) FILTER (WHERE COALESCE(ore_lavorate, 0) > 0) / count(*), 1) END
  INTO v_presenza
  FROM public.hr_giornate
  WHERE profilo_id = p_profilo_id AND data >= v_start AND data < v_end;

  SELECT count(*), count(*) FILTER (WHERE stato = 'fatto')
  INTO v_task_tot, v_task_done
  FROM public.hr_task
  WHERE profilo_id = p_profilo_id
    AND (scadenza IS NULL OR (scadenza >= v_start AND scadenza < v_end));

  RETURN jsonb_build_object(
    'presenza_pct', v_presenza,
    'ore_mese', v_ore,
    'task_completati', v_task_done,
    'task_totali', v_task_tot
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.hr_persona_kpi_auto(uuid, text) TO authenticated;
