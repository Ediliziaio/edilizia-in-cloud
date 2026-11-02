-- Il carico di una persona (2/11/2026).
--
-- Prima sommava order_employees.hours_worked delle righe CREATE negli ultimi 30 giorni: quelle
-- righe sono un totale senza data, quindi tre anni di ore importate ieri davano il 1900% e chi
-- lavorava da mesi sulla stessa commessa risultava libero. Non guardava neppure impegni e assenze.
-- Ora: ore dai rapportini per data di lavoro; impegni e assenze nel periodo chiesto (senza
-- periodo, oggi). Stati nuovi: «impegnato» e «assente».
DROP FUNCTION IF EXISTS public.silvio_employees_workload(uuid);

CREATE FUNCTION public.silvio_employees_workload(
  p_company_id uuid,
  p_dal date DEFAULT NULL,
  p_al date DEFAULT NULL,
  p_escludi_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_dal date := COALESCE(p_dal, (now() AT TIME ZONE 'Europe/Rome')::date);
  v_al date;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_al := GREATEST(COALESCE(p_al, v_dal), v_dal);

  WITH rapportini AS (
    SELECT r.id, r.user_id, r.ore_lavorate,
      CASE WHEN jsonb_typeof(r.presenze_registrate) = 'array' AND jsonb_array_length(r.presenze_registrate) > 0 THEN r.presenze_registrate
           WHEN jsonb_typeof(r.presenze) = 'array' AND jsonb_array_length(r.presenze) > 0 THEN r.presenze END AS presenze
    FROM public.campo_rapportini r
    WHERE r.company_id = p_company_id
      AND r.data_lavoro BETWEEN v_oggi - 30 AND v_oggi
      AND r.stato IN ('inviato', 'approvato')
  ),
  ore_lavorate AS (
    SELECT x.employee_id, SUM(x.ore) AS ore
    FROM (
      SELECT (p->>'employee_id')::uuid AS employee_id, COALESCE((p->>'ore')::numeric, 0) AS ore
      FROM rapportini r CROSS JOIN LATERAL jsonb_array_elements(r.presenze) p
      WHERE r.presenze IS NOT NULL AND p->>'employee_id' ~ '^[0-9a-fA-F-]{36}$'
      UNION ALL
      SELECT e.id, COALESCE(r.ore_lavorate, 0)
      FROM rapportini r JOIN public.employees e ON e.user_id = r.user_id AND e.company_id = p_company_id
      WHERE r.presenze IS NULL
    ) x
    GROUP BY x.employee_id
  ),
  impegni AS (
    SELECT oe.employee_id, o.order_code,
      COALESCE(f.start_date, o.work_start_date) AS dal,
      -- Un cantiere in corso oltre la data prevista tiene ancora le persone.
      CASE WHEN o.status IN ('in_corso', 'in_lavorazione')
           THEN GREATEST(COALESCE(f.end_date, o.work_end_date, o.expected_date, v_oggi), v_oggi)
           ELSE COALESCE(f.end_date, o.work_end_date, o.expected_date, f.start_date, o.work_start_date) END AS al
    FROM public.order_employees oe
    JOIN public.orders o ON o.id = oe.order_id
    LEFT JOIN public.order_work_phases f ON f.id = oe.phase_id
    WHERE o.company_id = p_company_id
      AND o.deleted_at IS NULL
      AND o.status NOT IN ('completato', 'completata', 'annullato', 'annullata', 'chiuso', 'chiusa')
      AND (f.id IS NULL OR f.status IS DISTINCT FROM 'completata')
      AND (p_escludi_order_id IS NULL OR oe.order_id <> p_escludi_order_id)
  ),
  impegni_nel_periodo AS (
    SELECT i.employee_id, COUNT(DISTINCT i.order_code) AS commesse,
      jsonb_agg(DISTINCT jsonb_build_object('commessa', i.order_code, 'dal', i.dal, 'al', i.al)) AS elenco
    FROM impegni i
    WHERE i.dal IS NOT NULL AND i.dal <= v_al AND i.al >= v_dal
    GROUP BY i.employee_id
  ),
  assenze AS (
    SELECT a.employee_id, MIN(a.tipo_assenza) AS tipo
    FROM public.hr_assenze a
    WHERE a.company_id = p_company_id
      AND a.data_inizio <= v_al AND COALESCE(a.data_fine, a.data_inizio) >= v_dal
      AND COALESCE(a.status, '') !~* 'rifiut|annull|reject|cancel'
    GROUP BY a.employee_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.utilizzo_pct DESC NULLS LAST), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      e.id AS employee_id,
      e.first_name || ' ' || e.last_name AS nome,
      e.role_type,
      e.area,
      e.monthly_hours AS ore_mensili,
      COALESCE(l.ore, 0) AS ore_30gg,
      COALESCE(i.commesse, 0) AS ordini_attivi,
      COALESCE(i.elenco, '[]'::jsonb) AS impegni,
      ass.tipo AS assenza,
      v_dal AS dal,
      v_al AS al,
      ROUND(COALESCE(l.ore, 0)::numeric / NULLIF(e.monthly_hours, 0) * 100, 1) AS utilizzo_pct,
      CASE
        WHEN ass.employee_id IS NOT NULL THEN 'assente'
        WHEN COALESCE(l.ore, 0) >= NULLIF(e.monthly_hours, 0) THEN 'overload'
        WHEN i.employee_id IS NOT NULL THEN 'impegnato'
        WHEN NULLIF(e.monthly_hours, 0) IS NULL THEN 'ore_mancanti'
        WHEN COALESCE(l.ore, 0) >= e.monthly_hours * 0.8 THEN 'pieno'
        WHEN COALESCE(l.ore, 0) >= e.monthly_hours * 0.5 THEN 'medio'
        WHEN COALESCE(l.ore, 0) >= e.monthly_hours * 0.2 THEN 'leggero'
        ELSE 'libero'
      END AS stato_carico
    FROM public.employees e
    LEFT JOIN ore_lavorate l ON l.employee_id = e.id
    LEFT JOIN impegni_nel_periodo i ON i.employee_id = e.id
    LEFT JOIN assenze ass ON ass.employee_id = e.id
    WHERE e.company_id = p_company_id
      AND COALESCE(e.is_active, true) = true
  ) s;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.silvio_employees_workload(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_employees_workload(uuid, date, date, uuid) TO authenticated, service_role;
