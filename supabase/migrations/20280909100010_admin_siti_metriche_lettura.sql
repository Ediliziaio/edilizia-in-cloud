-- Lettura delle metriche raccolte da GA4 e Search Console, più la gestione
-- dell'elenco dei siti.
--
-- I due mondi restano separati anche qui: GA4 conta chi è arrivato, Search
-- Console conta quante volte Google ha mostrato il sito. Sommarli darebbe un
-- numero che non significa niente, e il confronto fra i due è proprio
-- l'informazione utile — tante impressioni e pochi clic è un problema di
-- titoli, pochi clic e tanto tempo sulla pagina è un problema di visibilità.

CREATE OR REPLACE FUNCTION public.admin_siti_metriche(p_giorni int DEFAULT 28)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_da       date := (now() - make_interval(days => GREATEST(p_giorni, 1)))::date;
  v_da_prima date := (now() - make_interval(days => GREATEST(p_giorni, 1) * 2))::date;
  v_siti     jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.nome), '[]'::jsonb) INTO v_siti
  FROM (
    SELECT s.id, s.nome, s.dominio, s.ga4_property_id, s.gsc_site_url,
           s.attivo, s.ultimo_sync, s.ultimo_errore,
           -- GA4
           COALESCE(sum(m.utenti)          FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS utenti,
           COALESCE(sum(m.sessioni)        FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS sessioni,
           COALESCE(sum(m.visualizzazioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS visualizzazioni,
           round(avg(m.durata_media_s)     FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 1) AS durata_media_s,
           COALESCE(sum(m.visualizzazioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da_prima AND m.giorno < v_da), 0) AS visualizzazioni_prima,
           -- Search Console
           COALESCE(sum(m.impressioni)     FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0) AS impressioni,
           COALESCE(sum(m.clic)            FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0) AS clic,
           round(avg(m.posizione_media)    FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 1) AS posizione_media,
           COALESCE(sum(m.clic)            FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da_prima AND m.giorno < v_da), 0) AS clic_prima,
           -- Quante volte, di tutte quelle in cui Google l'ha mostrato, qualcuno ha cliccato.
           CASE WHEN COALESCE(sum(m.impressioni) FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0) > 0
                THEN round(100.0 * COALESCE(sum(m.clic) FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0)
                           / sum(m.impressioni) FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 2) END AS ctr_pct,
           (SELECT count(DISTINCT percorso) FROM public.siti_pagine_giornaliere p
             WHERE p.sito_id = s.id AND p.fonte = 'gsc' AND p.giorno >= v_da
               AND COALESCE(p.impressioni, 0) > 0) AS pagine_viste_da_google
      FROM public.siti_monitorati s
      LEFT JOIN public.siti_metriche_giornaliere m
             ON m.sito_id = s.id AND m.giorno >= v_da_prima
     GROUP BY s.id, s.nome, s.dominio, s.ga4_property_id, s.gsc_site_url,
              s.attivo, s.ultimo_sync, s.ultimo_errore
  ) t;

  RETURN jsonb_build_object(
    'giorni', GREATEST(p_giorni, 1),
    'siti', v_siti,
    'configurato', EXISTS (SELECT 1 FROM public.siti_monitorati
                            WHERE ga4_property_id IS NOT NULL OR gsc_site_url IS NOT NULL),
    'calcolato_il', now());
END; $function$;

-- Le pagine di un sito: quelle che Google mostra e quelle che la gente apre.
CREATE OR REPLACE FUNCTION public.admin_sito_pagine_google(p_sito_id uuid, p_giorni int DEFAULT 28)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_da date := (now() - make_interval(days => GREATEST(p_giorni, 1)))::date;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'ricerca', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.impressioni DESC) FROM (
        SELECT percorso, sum(impressioni) AS impressioni, sum(clic) AS clic,
               round(avg(posizione_media), 1) AS posizione,
               CASE WHEN sum(impressioni) > 0
                    THEN round(100.0 * sum(clic) / sum(impressioni), 2) END AS ctr_pct
          FROM public.siti_pagine_giornaliere
         WHERE sito_id = p_sito_id AND fonte = 'gsc' AND giorno >= v_da
         GROUP BY percorso ORDER BY sum(impressioni) DESC LIMIT 50) t), '[]'::jsonb),
    'visite', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.visualizzazioni DESC) FROM (
        SELECT percorso, sum(visualizzazioni) AS visualizzazioni, sum(utenti) AS utenti,
               round(avg(durata_media_s), 1) AS durata_media_s
          FROM public.siti_pagine_giornaliere
         WHERE sito_id = p_sito_id AND fonte = 'ga4' AND giorno >= v_da
         GROUP BY percorso ORDER BY sum(visualizzazioni) DESC LIMIT 50) t), '[]'::jsonb),
    'andamento', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.giorno) FROM (
        SELECT giorno,
               sum(visualizzazioni) FILTER (WHERE fonte = 'ga4') AS visualizzazioni,
               sum(utenti)          FILTER (WHERE fonte = 'ga4') AS utenti,
               sum(impressioni)     FILTER (WHERE fonte = 'gsc') AS impressioni,
               sum(clic)            FILTER (WHERE fonte = 'gsc') AS clic
          FROM public.siti_metriche_giornaliere
         WHERE sito_id = p_sito_id AND giorno >= v_da
         GROUP BY giorno) t), '[]'::jsonb));
END; $function$;

-- Salvataggio di un sito dalla pagina: gli identificativi di GA4 e Search
-- Console si incollano da lì, non si aggiungono a mano al database.
CREATE OR REPLACE FUNCTION public.admin_sito_salva(
  p_id uuid, p_nome text, p_dominio text,
  p_ga4 text DEFAULT NULL, p_gsc text DEFAULT NULL, p_attivo boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(p_nome, '')) = '' OR btrim(COALESCE(p_dominio, '')) = '' THEN
    RETURN jsonb_build_object('error', 'Nome e dominio sono obbligatori');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.siti_monitorati (nome, dominio, ga4_property_id, gsc_site_url, attivo)
    VALUES (btrim(p_nome), lower(btrim(p_dominio)), NULLIF(btrim(COALESCE(p_ga4, '')), ''),
            NULLIF(btrim(COALESCE(p_gsc, '')), ''), COALESCE(p_attivo, true))
    ON CONFLICT (dominio) DO UPDATE
      SET nome = EXCLUDED.nome, ga4_property_id = EXCLUDED.ga4_property_id,
          gsc_site_url = EXCLUDED.gsc_site_url, attivo = EXCLUDED.attivo
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.siti_monitorati
       SET nome = btrim(p_nome), dominio = lower(btrim(p_dominio)),
           ga4_property_id = NULLIF(btrim(COALESCE(p_ga4, '')), ''),
           gsc_site_url = NULLIF(btrim(COALESCE(p_gsc, '')), ''),
           attivo = COALESCE(p_attivo, true)
     WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_siti_metriche(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sito_pagine_google(uuid, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sito_salva(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_siti_metriche(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sito_pagine_google(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sito_salva(uuid, text, text, text, text, boolean) TO authenticated, service_role;
