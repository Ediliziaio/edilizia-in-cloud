CREATE TABLE IF NOT EXISTS public.siti_ga4_organico_giornaliero (
  sito_id uuid NOT NULL REFERENCES public.siti_monitorati(id) ON DELETE CASCADE,
  giorno date NOT NULL,
  ga4_property_id text NOT NULL,
  sessioni integer NOT NULL CHECK (sessioni >= 0),
  PRIMARY KEY (sito_id, giorno)
);

ALTER TABLE public.siti_ga4_organico_giornaliero ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.siti_ga4_organico_giornaliero FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.siti_ga4_organico_giornaliero TO service_role;

CREATE OR REPLACE FUNCTION public.admin_siti_confronto_google(p_giorni integer DEFAULT 28)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_oggi date := (now() AT TIME ZONE 'UTC')::date;
  v_giorni integer := LEAST(GREATEST(COALESCE(p_giorni, 28), 1), 90);
BEGIN
  IF NOT (COALESCE(public.is_super_admin(auth.uid()), false)
       OR COALESCE(public.is_platform_staff(auth.uid()), false)) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  -- Le due somme usano lo stesso insieme di date effettivamente raccolte.
  RETURN (
    SELECT COALESCE(jsonb_object_agg(confronto.sito_id, to_jsonb(confronto) - 'sito_id'), '{}'::jsonb)
    FROM (
      SELECT g.sito_id, min(g.giorno) AS dal, max(g.giorno) AS al, count(*) AS giorni,
             sum(g.sessioni) AS sessioni, sum(sc.clic) AS clic, sum(sc.impressioni) AS impressioni
      FROM public.siti_ga4_organico_giornaliero g
      JOIN public.siti_monitorati s ON s.id = g.sito_id AND s.ga4_property_id = g.ga4_property_id
      JOIN public.siti_metriche_giornaliere sc
        ON sc.sito_id = g.sito_id AND sc.giorno = g.giorno AND sc.fonte = 'gsc'
      WHERE g.giorno >= v_oggi - v_giorni AND g.giorno < v_oggi
        AND s.gsc_site_url IS NOT NULL AND sc.clic IS NOT NULL AND sc.impressioni IS NOT NULL
      GROUP BY g.sito_id
    ) confronto
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_siti_confronto_google(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_siti_confronto_google(integer) TO authenticated, service_role;
