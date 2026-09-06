-- Le tre domande a cui questa funzione deve rispondere, dette come le ha dette
-- chi le ha poste: quali pagine vengono viste, quanto tempo ci stanno, dove si
-- bloccano.
--
-- La terza è la difficile, e si risponde con due numeri diversi che vanno letti
-- insieme. "Uscite" dice quante volte una pagina è l'ultima della visita: se è
-- alta su /prezzi il problema è il prezzo, se è alta su un articolo del blog è
-- normale, la gente legge e se ne va. "Tempo medio" dice se ci sono stati: due
-- secondi e via è un rimbalzo, due minuti è una lettura, e la stessa percentuale
-- di uscite significa cose opposte nei due casi.

CREATE OR REPLACE FUNCTION public.admin_sito_traffico(p_giorni int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_da        timestamptz := now() - make_interval(days => GREATEST(p_giorni, 1));
  v_da_prima  timestamptz := now() - make_interval(days => GREATEST(p_giorni, 1) * 2);
  v_riepilogo jsonb;
  v_pagine    jsonb;
  v_ingressi  jsonb;
  v_fonti     jsonb;
  v_giorni    jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  -- Ogni vista con il suo posto nella sessione: serve a sapere qual è l'ultima.
  WITH viste AS (
    SELECT pv.*,
           row_number() OVER (PARTITION BY pv.session_id ORDER BY pv.viewed_at DESC) = 1 AS e_uscita,
           row_number() OVER (PARTITION BY pv.session_id ORDER BY pv.viewed_at) = 1      AS e_ingresso
      FROM public.attribution_pageviews pv
     WHERE pv.viewed_at >= v_da
  ), precedente AS (
    SELECT count(*) AS viste, count(DISTINCT session_id) AS sessioni,
           count(DISTINCT visitor_id) AS visitatori
      FROM public.attribution_pageviews
     WHERE viewed_at >= v_da_prima AND viewed_at < v_da
  )
  SELECT jsonb_build_object(
    'giorni',            GREATEST(p_giorni, 1),
    'pagine_viste',      count(*),
    'sessioni',          count(DISTINCT session_id),
    'visitatori',        count(DISTINCT visitor_id),
    'pagine_per_sessione', round(count(*)::numeric / NULLIF(count(DISTINCT session_id), 0), 2),
    -- Una visita di una pagina sola: è entrato, ha guardato, se n'è andato.
    'sessioni_una_pagina', (SELECT count(*) FROM (
                              SELECT session_id FROM viste GROUP BY session_id HAVING count(*) = 1) s),
    'tempo_medio_pagina_s', round(avg(durata_ms) FILTER (WHERE durata_ms IS NOT NULL) / 1000.0, 1),
    'viste_con_tempo',   count(*) FILTER (WHERE durata_ms IS NOT NULL),
    'viste_precedente',  (SELECT viste FROM precedente),
    'sessioni_precedente', (SELECT sessioni FROM precedente),
    'visitatori_precedente', (SELECT visitatori FROM precedente),
    'crescita_viste_pct', CASE WHEN (SELECT viste FROM precedente) > 0
                               THEN round(100.0 * (count(*) - (SELECT viste FROM precedente))
                                          / (SELECT viste FROM precedente), 1) END
  ) INTO v_riepilogo FROM viste;

  -- Le pagine, con quanto ci si ferma e quanto spesso è l'ultima cosa che vedono.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.viste DESC), '[]'::jsonb) INTO v_pagine
  FROM (
    SELECT pv.path AS pagina,
           count(*) AS viste,
           count(DISTINCT pv.visitor_id) AS visitatori,
           round(avg(pv.durata_ms) FILTER (WHERE pv.durata_ms IS NOT NULL) / 1000.0, 1) AS tempo_medio_s,
           count(*) FILTER (WHERE pv.durata_ms IS NOT NULL) AS misurate,
           count(*) FILTER (WHERE u.e_uscita) AS uscite,
           round(100.0 * count(*) FILTER (WHERE u.e_uscita) / NULLIF(count(*), 0), 0) AS uscite_pct,
           max(pv.title) AS titolo
      FROM public.attribution_pageviews pv
      JOIN (SELECT id,
                   row_number() OVER (PARTITION BY session_id ORDER BY viewed_at DESC) = 1 AS e_uscita
              FROM public.attribution_pageviews WHERE viewed_at >= v_da) u ON u.id = pv.id
     WHERE pv.viewed_at >= v_da
     GROUP BY pv.path
     ORDER BY count(*) DESC
     LIMIT 50
  ) t;

  -- Da quale pagina entrano: è la porta del sito, e spesso non è la home.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.ingressi DESC), '[]'::jsonb) INTO v_ingressi
  FROM (
    SELECT path AS pagina, count(*) AS ingressi,
           count(*) FILTER (WHERE pagine_sessione = 1) AS senza_seguito,
           round(100.0 * count(*) FILTER (WHERE pagine_sessione = 1) / NULLIF(count(*), 0), 0) AS senza_seguito_pct
      FROM (
        SELECT pv.path, pv.session_id,
               row_number() OVER (PARTITION BY pv.session_id ORDER BY pv.viewed_at) AS n,
               count(*)     OVER (PARTITION BY pv.session_id) AS pagine_sessione
          FROM public.attribution_pageviews pv
         WHERE pv.viewed_at >= v_da
      ) s
     WHERE n = 1
     GROUP BY path
     ORDER BY count(*) DESC
     LIMIT 20
  ) t;

  -- Da dove arrivano. `attribution_sessions` fotografa la fonte all'ingresso.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.sessioni DESC), '[]'::jsonb) INTO v_fonti
  FROM (
    SELECT COALESCE(
             NULLIF(s.utm_source, ''),
             CASE
               WHEN s.referrer IS NULL OR s.referrer = '' THEN 'diretto'
               WHEN s.referrer ~* 'google\.' THEN 'google'
               WHEN s.referrer ~* 'bing\.|duckduckgo|ecosia' THEN 'altri motori'
               WHEN s.referrer ~* 'facebook|instagram|linkedin|twitter|x\.com|tiktok' THEN 'social'
               ELSE regexp_replace(s.referrer, '^https?://(www\.)?([^/]+).*$', '\2')
             END) AS fonte,
           count(*) AS sessioni,
           count(DISTINCT s.visitor_id) AS visitatori
      FROM public.attribution_sessions s
     WHERE s.started_at >= v_da
     GROUP BY 1
     ORDER BY count(*) DESC
     LIMIT 15
  ) t;

  -- Andamento giorno per giorno, per vedere se cresce o è piatto.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.giorno), '[]'::jsonb) INTO v_giorni
  FROM (
    SELECT viewed_at::date AS giorno,
           count(*) AS viste,
           count(DISTINCT session_id) AS sessioni,
           count(DISTINCT visitor_id) AS visitatori
      FROM public.attribution_pageviews
     WHERE viewed_at >= v_da
     GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'riepilogo', v_riepilogo, 'pagine', v_pagine, 'ingressi', v_ingressi,
    'fonti', v_fonti, 'giorni', v_giorni, 'calcolato_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.admin_sito_traffico(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sito_traffico(int) TO authenticated, service_role;
