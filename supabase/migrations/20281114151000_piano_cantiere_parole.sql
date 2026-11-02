-- Il prezzario per parole utili (2/11/2026): «fornitura», «posa», «opera» cacciavano «pavimento»
-- dalle sei parole cercate. Ora si tolgono le generiche e si tengono le prime nell'ordine del testo.
SET LOCAL lock_timeout = '3s';

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
      SELECT string_agg(p.w, ' | ') FROM (
        SELECT x.w FROM regexp_split_to_table(lower(regexp_replace(t, '[^[:alpha:] ]', ' ', 'g')), ' +') WITH ORDINALITY x(w, n)
        WHERE length(x.w) > 3 AND x.w <> ALL (ARRAY['fornitura','posa','opera','compreso','compresa','compresi','comprese','della','dello','delle','degli','dell','nella','nelle','sulla','sulle','con','tipo','ogni','come','prezzo','lavori','lavoro','opere','altro','oltre','secondo','misura','tutto','tutti','tutta','necessario','necessari'])
        GROUP BY x.w ORDER BY MIN(x.n) LIMIT 6) p
    ) AS parole
    FROM unnest(p_testi) t
  ),
  fonti AS (
    -- Senza regione la Lombardia, non tutta Italia: tutte le fonti insieme non stanno negli 8 secondi.
    SELECT f.id FROM public.prezzario_fonte f
    WHERE f.regione = COALESCE(p_regione, 'Lombardia')
    ORDER BY f.anno DESC NULLS LAST LIMIT 1
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

