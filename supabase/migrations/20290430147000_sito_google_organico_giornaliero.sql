CREATE OR REPLACE FUNCTION public.admin_sito_google_organico_giornaliero(
  p_sito uuid,
  p_giorni integer DEFAULT 28
)
RETURNS TABLE (giorno date, clic integer, sessioni integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_utente uuid := auth.uid();
  v_oggi date := (now() AT TIME ZONE 'UTC')::date;
  v_giorni integer := LEAST(GREATEST(COALESCE(p_giorni, 28), 1), 90);
BEGIN
  IF v_utente IS NULL OR NOT (COALESCE(public.is_super_admin(v_utente), false)
       OR COALESCE(public.is_platform_staff(v_utente), false)) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    WITH confrontabili AS (
      SELECT g.giorno, sc.clic, g.sessioni
      FROM public.siti_monitorati s
      JOIN public.siti_ga4_organico_giornaliero g
        ON g.sito_id = s.id AND g.ga4_property_id = s.ga4_property_id
      JOIN public.siti_metriche_giornaliere sc
        ON sc.sito_id = g.sito_id AND sc.giorno = g.giorno AND sc.fonte = 'gsc'
      WHERE s.id = p_sito AND s.gsc_site_url IS NOT NULL
        AND g.giorno >= v_oggi - v_giorni AND g.giorno < v_oggi
        AND sc.clic IS NOT NULL AND sc.impressioni IS NOT NULL
    )
    SELECT v_oggi - serie.indice, c.clic, c.sessioni
    FROM generate_series(1, v_giorni) AS serie(indice)
    LEFT JOIN confrontabili c ON c.giorno = v_oggi - serie.indice
    ORDER BY serie.indice DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_sito_google_organico_giornaliero(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sito_google_organico_giornaliero(uuid, integer) TO authenticated;
