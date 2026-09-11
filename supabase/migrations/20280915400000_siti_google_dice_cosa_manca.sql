-- Siti e Google: la pagina dice cosa manca, e le medie pesano come in Google.
--
-- Stato trovato l'11/09/2026: la pagina non ha mai raccolto un numero. La
-- chiave Google (service account) non è né nel Vault né fra i Secrets delle
-- edge function; la raccolta notturna delle 05:35 UTC rispondeva «200 OK» in
-- un decimo di secondo senza scaricare nulla, e la Salute la contava sana.
-- Il riquadro «Manca il collegamento» si reggeva su `configurato`, che voleva
-- dire solo «qualche sito ha un ID»: scritto un ID, spariva, con la chiave
-- ancora assente.
--
-- 1. admin_siti_metriche — dice se la chiave c'è (nel Vault, oppure provata da
--    una raccolta riuscita su un sito collegato: la chiave può stare anche fra
--    i Secrets, e lì il database non vede), quanti siti sono collegati e fino
--    a che giorno arrivano i dati. `configurato` resta per le schede aperte sul
--    bundle vecchio, ma ora vuol dire «tutto pronto».
-- 2. Medie pesate: la posizione sulle impressioni, la durata sulle visite
--    (per le pagine, sulle visualizzazioni). La media semplice dei giorni dava
--    lo stesso peso a un giorno da 3 impressioni e a uno da 3.000; Google le
--    calcola pesate, e i numeri qui devono potersi confrontare con i suoi.
-- 3. admin_sito_salva — controlla gli ID prima di salvarli. «G-…» è l'ID del
--    tag che sta nel sito (G-0JZP5N2VW5 su ediliziaincloud.com): è l'unico che
--    si vede a colpo d'occhio e si scambia per quello della proprietà, che
--    invece è un numero. In Search Console «sc-domain:» e «https://…/» sono
--    due proprietà diverse, e chiedere l'una per l'altra dà «permesso negato».
--
-- Solo funzioni: nessuna riga toccata.

CREATE OR REPLACE FUNCTION public.admin_siti_metriche(p_giorni integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_giorni      integer := GREATEST(COALESCE(p_giorni, 28), 1);
  v_da          date := (now() - make_interval(days => GREATEST(COALESCE(p_giorni, 28), 1)))::date;
  v_da_prima    date := (now() - make_interval(days => GREATEST(COALESCE(p_giorni, 28), 1) * 2))::date;
  v_siti        jsonb;
  v_chiave      boolean;
  v_collegati   integer;
  v_ultimo_dato date;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.nome), '[]'::jsonb) INTO v_siti
  FROM (
    SELECT s.id, s.nome, s.dominio, s.ga4_property_id, s.gsc_site_url,
           s.attivo, s.ultimo_sync, s.ultimo_errore,
           (SELECT max(x.giorno) FROM public.siti_metriche_giornaliere x
             WHERE x.sito_id = s.id) AS ultimo_dato,
           -- GA4
           COALESCE(sum(m.utenti)          FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS utenti,
           COALESCE(sum(m.sessioni)        FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS sessioni,
           COALESCE(sum(m.visualizzazioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da), 0) AS visualizzazioni,
           -- Durata di una visita, pesata sulle visite di ogni giorno.
           round(sum(m.durata_media_s * m.sessioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da)
                 / NULLIF(sum(m.sessioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da
                                                    AND m.durata_media_s IS NOT NULL), 0), 1) AS durata_media_s,
           COALESCE(sum(m.sessioni)        FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da_prima AND m.giorno < v_da), 0) AS sessioni_prima,
           COALESCE(sum(m.visualizzazioni) FILTER (WHERE m.fonte = 'ga4' AND m.giorno >= v_da_prima AND m.giorno < v_da), 0) AS visualizzazioni_prima,
           -- Search Console
           COALESCE(sum(m.impressioni)     FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0) AS impressioni,
           COALESCE(sum(m.clic)            FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da), 0) AS clic,
           -- Posizione media pesata sulle impressioni, come la calcola Google.
           round(sum(m.posizione_media * m.impressioni) FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da)
                 / NULLIF(sum(m.impressioni) FILTER (WHERE m.fonte = 'gsc' AND m.giorno >= v_da
                                                       AND m.posizione_media IS NOT NULL), 0), 1) AS posizione_media,
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

  -- La chiave c'è se sta nel Vault, oppure se una raccolta su un sito con un
  -- ID è andata a buon fine: quella è la prova che funziona, ovunque stia.
  -- Del Vault si guarda solo il nome, senza decifrare nulla.
  v_chiave := EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'google_service_account')
           OR EXISTS (SELECT 1 FROM public.siti_monitorati
                       WHERE (ga4_property_id IS NOT NULL OR gsc_site_url IS NOT NULL)
                         AND ultimo_sync IS NOT NULL AND ultimo_errore IS NULL);

  SELECT count(*) INTO v_collegati
    FROM public.siti_monitorati
   WHERE attivo AND (ga4_property_id IS NOT NULL OR gsc_site_url IS NOT NULL);

  SELECT max(giorno) INTO v_ultimo_dato FROM public.siti_metriche_giornaliere;

  RETURN jsonb_build_object(
    'giorni', v_giorni,
    'siti', v_siti,
    'chiave_google', v_chiave,
    'siti_collegati', v_collegati,
    'ultimo_dato', v_ultimo_dato,
    -- Per le schede aperte sul bundle di prima, che mostrano le istruzioni
    -- finché è falso: ora vuol dire «chiave presente e almeno un sito collegato».
    'configurato', v_chiave AND v_collegati > 0,
    'calcolato_il', now());
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_sito_pagine_google(p_sito_id uuid, p_giorni integer DEFAULT 28)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_da date := (now() - make_interval(days => GREATEST(COALESCE(p_giorni, 28), 1)))::date;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'ricerca', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.impressioni DESC) FROM (
        SELECT percorso, sum(impressioni) AS impressioni, sum(clic) AS clic,
               round(sum(posizione_media * impressioni)
                     / NULLIF(sum(impressioni) FILTER (WHERE posizione_media IS NOT NULL), 0), 1) AS posizione,
               CASE WHEN sum(impressioni) > 0
                    THEN round(100.0 * sum(clic) / sum(impressioni), 2) END AS ctr_pct
          FROM public.siti_pagine_giornaliere
         WHERE sito_id = p_sito_id AND fonte = 'gsc' AND giorno >= v_da
         GROUP BY percorso ORDER BY sum(impressioni) DESC LIMIT 50) t), '[]'::jsonb),
    'visite', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.visualizzazioni DESC) FROM (
        -- durata_media_s di una pagina è il tempo per visualizzazione:
        -- si ripesa sulle visualizzazioni di ogni giorno.
        SELECT percorso, sum(visualizzazioni) AS visualizzazioni, sum(utenti) AS utenti,
               round(sum(durata_media_s * visualizzazioni)
                     / NULLIF(sum(visualizzazioni) FILTER (WHERE durata_media_s IS NOT NULL), 0), 1) AS durata_media_s
          FROM public.siti_pagine_giornaliere
         WHERE sito_id = p_sito_id AND fonte = 'ga4' AND giorno >= v_da
         GROUP BY percorso ORDER BY sum(visualizzazioni) DESC LIMIT 50) t), '[]'::jsonb),
    'andamento', COALESCE((
      SELECT jsonb_agg(t ORDER BY t.giorno) FROM (
        SELECT giorno,
               sum(visualizzazioni) FILTER (WHERE fonte = 'ga4') AS visualizzazioni,
               sum(sessioni)        FILTER (WHERE fonte = 'ga4') AS sessioni,
               sum(utenti)          FILTER (WHERE fonte = 'ga4') AS utenti,
               sum(impressioni)     FILTER (WHERE fonte = 'gsc') AS impressioni,
               sum(clic)            FILTER (WHERE fonte = 'gsc') AS clic
          FROM public.siti_metriche_giornaliere
         WHERE sito_id = p_sito_id AND giorno >= v_da
         GROUP BY giorno) t), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_sito_salva(
  p_id uuid, p_nome text, p_dominio text,
  p_ga4 text DEFAULT NULL::text, p_gsc text DEFAULT NULL::text, p_attivo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_dominio text := lower(btrim(COALESCE(p_dominio, '')));
  v_ga4     text := NULLIF(regexp_replace(COALESCE(p_ga4, ''), '\s', '', 'g'), '');
  v_gsc     text := NULLIF(btrim(COALESCE(p_gsc, '')), '');
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  -- Il dominio si scrive senza protocollo né percorso: «www.esempio.it».
  v_dominio := regexp_replace(regexp_replace(v_dominio, '^https?://', ''), '/.*$', '');
  IF btrim(COALESCE(p_nome, '')) = '' OR v_dominio = '' THEN
    RETURN jsonb_build_object('error', 'Nome e dominio sono obbligatori');
  END IF;

  -- GA4 vuole il NUMERO della proprietà. «G-…» è l'ID del tag che sta nel
  -- sito: l'API lo rifiuta, e l'errore di Google non lo dice in modo chiaro.
  IF v_ga4 IS NOT NULL THEN
    v_ga4 := regexp_replace(v_ga4, '^properties/', '', 'i');
    IF v_ga4 ~* '^G-' THEN
      RETURN jsonb_build_object('error',
        '«' || v_ga4 || '» è il codice del tag di Google Analytics, non quello della proprietà. '
        || 'Serve un numero (es. 123456789): lo mostra «Scopri proprietà», '
        || 'oppure GA4 → Amministrazione → Dettagli proprietà.');
    END IF;
    IF v_ga4 !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('error',
        'La proprietà GA4 è solo un numero (es. 123456789), senza lettere né «properties/».');
    END IF;
  END IF;

  -- Search Console: la proprietà «dominio» (sc-domain:esempio.it) comprende
  -- tutti i sottodomini; quella «prefisso URL» è un indirizzo con la barra
  -- finale. Sono due proprietà distinte, anche sullo stesso sito.
  IF v_gsc IS NOT NULL THEN
    IF v_gsc ~* '^sc-domain:' THEN
      v_gsc := 'sc-domain:' || lower(btrim(substr(v_gsc, 11)));
    ELSIF v_gsc ~* '^https?://[^/[:space:]]+' THEN
      IF right(v_gsc, 1) <> '/' THEN
        v_gsc := v_gsc || '/';
      END IF;
    ELSE
      RETURN jsonb_build_object('error',
        'Search Console: scrivi «sc-domain:' || regexp_replace(v_dominio, '^www\.', '')
        || '» (proprietà dominio) oppure l''indirizzo completo «https://' || v_dominio
        || '/» (prefisso URL), esattamente come compare in Search Console.');
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.siti_monitorati (nome, dominio, ga4_property_id, gsc_site_url, attivo)
    VALUES (btrim(p_nome), v_dominio, v_ga4, v_gsc, COALESCE(p_attivo, true))
    ON CONFLICT (dominio) DO UPDATE
      SET nome = EXCLUDED.nome, ga4_property_id = EXCLUDED.ga4_property_id,
          gsc_site_url = EXCLUDED.gsc_site_url, attivo = EXCLUDED.attivo,
          ultimo_errore = CASE
            WHEN siti_monitorati.ga4_property_id IS DISTINCT FROM EXCLUDED.ga4_property_id
              OR siti_monitorati.gsc_site_url IS DISTINCT FROM EXCLUDED.gsc_site_url
            THEN NULL ELSE siti_monitorati.ultimo_errore END
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.siti_monitorati s
       SET nome = btrim(p_nome), dominio = v_dominio,
           ga4_property_id = v_ga4, gsc_site_url = v_gsc,
           attivo = COALESCE(p_attivo, true),
           -- L'errore parlava degli ID di prima: con ID nuovi non vale più,
           -- e la prossima raccolta dirà com'è andata con questi.
           ultimo_errore = CASE
             WHEN s.ga4_property_id IS DISTINCT FROM v_ga4
               OR s.gsc_site_url IS DISTINCT FROM v_gsc
             THEN NULL ELSE s.ultimo_errore END
     WHERE s.id = p_id
    RETURNING s.id INTO v_id;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('error', 'Sito non trovato');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_siti_metriche(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sito_pagine_google(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sito_salva(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_siti_metriche(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sito_pagine_google(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_sito_salva(uuid, text, text, text, text, boolean) TO authenticated, service_role;
