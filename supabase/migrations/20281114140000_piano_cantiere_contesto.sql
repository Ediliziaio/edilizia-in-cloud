-- Il cronoprogramma calcolato nei preventivi (2/11/2026). Le percentuali del prezzario sono dati
-- pubblici: le può chiedere chiunque lavori in azienda, anche chi non vede i costi. Il costo
-- orario medio e le rese no: a chi non ha il permesso resta il valore di partenza.
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.piano_cantiere_contesto(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_vede_costi boolean;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_vede_costi := COALESCE(auth.role(), '') = 'service_role' OR public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id);
  RETURN jsonb_build_object(
    'provincia', (SELECT COALESCE(NULLIF(c.operational_province, ''), NULLIF(c.legal_province, '')) FROM public.companies c WHERE c.id = p_company_id),
    'costo_orario', CASE WHEN v_vede_costi THEN (
      SELECT ROUND(AVG(e.costo_orario), 2) FROM public.employees e
      WHERE e.company_id = p_company_id AND COALESCE(e.is_active, true) AND e.costo_orario > 0
        AND COALESCE(lower(e.role_type), '') NOT IN ('staff_interno', 'impiegato', 'subappaltatore')) END,
    'rese', CASE WHEN v_vede_costi THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('chiave', r.chiave_lavorazione, 'ore_per_unita', r.ore_per_unita)), '[]'::jsonb)
      FROM public.rese_azienda r WHERE r.company_id = p_company_id) ELSE '[]'::jsonb END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_contesto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_contesto(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.piano_cantiere_incidenze(p_company_id uuid, p_testi text[], p_regione text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF COALESCE(array_length(p_testi, 1), 0) > 10 THEN
    RAISE EXCEPTION 'Massimo 10 testi per volta';
  END IF;

  WITH q AS (
    SELECT t AS testo, (
      SELECT string_agg(w, ' | ') FROM (
        SELECT DISTINCT w FROM regexp_split_to_table(lower(regexp_replace(t, '[^[:alpha:] ]', ' ', 'g')), ' +') w
        WHERE length(w) > 3 LIMIT 6) parole
    ) AS parole
    FROM unnest(p_testi) t
  ),
  fonti AS (
    SELECT DISTINCT ON (f.regione) f.id FROM public.prezzario_fonte f
    WHERE p_regione IS NULL OR f.regione = p_regione
    ORDER BY f.regione, f.anno DESC NULLS LAST
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('testo', q.testo, 'frazione', r.mediana, 'min', r.p25, 'max', r.p75, 'campioni', r.n)), '[]'::jsonb) INTO v_result
  FROM q
  CROSS JOIN LATERAL (
    SELECT COUNT(*) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.i) AS mediana,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.i) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.i) AS p75
    FROM (
      SELECT v.incidenza_manodopera_pct AS i
      FROM public.prezzario_voce v
      WHERE v.fonte_id IN (SELECT id FROM fonti)
        AND v.search @@ to_tsquery('italian', q.parole)
        AND v.incidenza_manodopera_pct > 0
      ORDER BY ts_rank(v.search, to_tsquery('italian', q.parole)) DESC
      LIMIT 30
    ) s
  ) r
  WHERE q.parole IS NOT NULL AND r.n >= 5;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.piano_cantiere_incidenze(uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.piano_cantiere_incidenze(uuid, text[], text) TO authenticated, service_role;

