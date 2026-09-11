-- «Traffico del sito» (/admin/sito): i numeri contavano anche cose che non
-- sono il sito, e il numero principale era gonfiato di cinque volte.
--
-- Sito pubblico, app delle aziende e pannello admin sono la STESSA
-- applicazione su tre indirizzi (ediliziaincloud.com, app., admin.), e il
-- contatore gira ovunque. Doveva escludere le aree applicative con un elenco
-- di percorsi, ma l'elenco aveva buchi:
--   · `/clienti` al plurale, mentre l'area riservata dei clienti e' `/cliente`:
--     le sue pagine finivano fra le «pagine piu' viste», una per ordine con
--     l'uuid nel percorso, e due sessioni da 17 pagine gonfiavano da sole la
--     media «pagine per visita»;
--   · `/admin` esclude `/admin/…` ma non `/admin-login`, che non ha la barra;
--     idem `/commercialista-login`, `/lavori-login`, `/produttore-login`…;
--   · nessuna delle pagine raggiunte da un link personale (firme SAL/ODV/FEA,
--     accettazione preventivo, stima, candidatura, recensione, QR) ne' i
--     rientri dagli accessi OAuth.
-- E c'era una fonte di rumore che nessun elenco di percorsi puo' vedere: lo
-- sviluppo in locale. 8 viste in 2 sessioni arrivavano da localhost:8080, con
-- percorsi identici a quelli veri.
--
-- La correzione sta nel database, non solo nel browser: una scheda aperta su
-- una versione vecchia del bundle continuerebbe a mandare le pagine sbagliate.
--   · `host`: da ora si registra l'indirizzo da cui arriva la visita (lo
--     dichiara il browser nell'header Origin, lo legge `site-track`).
--   · `sito_percorso_applicativo()` e `sito_host_escluso()`: le due regole,
--     scritte una volta sola.
--   · un trigger all'ingresso scarta le righe che non sono sito pubblico. Vale
--     solo per l'azienda di piattaforma: le altre non vengono toccate.
--   · `admin_sito_traffico()` applica le stesse regole allo storico, che non
--     ha `host`: li' il segno dello sviluppo in locale e' il referrer.
-- Niente viene cancellato: le righe vecchie restano, semplicemente non si
-- contano.
--
-- Il numero principale: «Tempo medio per pagina» diceva 193 secondi. La
-- mediana e' 37. Nove schede rimaste aperte oltre mezz'ora — una fino al tetto
-- di sei ore — valevano da sole il 51% di tutto il tempo misurato. Su un sito
-- da poche centinaia di visite la media non descrive nessuno: si mostra la
-- mediana, «tempo tipico», e la media resta nel risultato per chi la volesse.
--
-- In piu', cose che la pagina non diceva e che i dati avevano gia':
--   · le RICHIESTE. `attribution_sessions.converted_at` e' popolato quando una
--     visita diventa un contatto: 3 nel periodo, con nome. E' il numero che
--     conta su un sito di acquisizione, e non c'era.
--   · la crescita anche di visitatori e visite, non solo delle pagine viste.
--   · i giorni in ora italiana: `viewed_at::date` li tagliava a mezzanotte UTC,
--     quindi una visita all'1 di notte finiva nel giorno prima. E i giorni
--     senza visite ci sono, a zero, invece di sparire dalla serie.
--   · le fonti: Yahoo (15 visite) finiva come «it.search.yahoo.com» invece che
--     fra i motori; ChatGPT e gli altri assistenti ora sono una fonte a se' —
--     il traffico che arriva dalle risposte AI e' quello che si lavora con il
--     GEO, e va visto separato; i nostri domini non contano come referral.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── Da dove arriva la visita ────────────────────────────────────────────────
ALTER TABLE public.attribution_pageviews ADD COLUMN IF NOT EXISTS host text;
ALTER TABLE public.attribution_sessions  ADD COLUMN IF NOT EXISTS host text;

COMMENT ON COLUMN public.attribution_pageviews.host IS
  'Indirizzo da cui arriva la vista (header Origin, letto da site-track). NULL per le righe raccolte prima del 2028-09-15.';
COMMENT ON COLUMN public.attribution_sessions.host IS
  'Indirizzo da cui e'' partita la sessione (header Origin, letto da site-track). NULL per le righe raccolte prima del 2028-09-15.';

-- ── Le due regole ───────────────────────────────────────────────────────────
-- Tenere allineato con AREE_APP e PAGINE_SERVIZIO in
-- src/contexts/AnalyticsProvider.tsx: li' evitano la chiamata, qui decidono.
CREATE OR REPLACE FUNCTION public.sito_percorso_applicativo(p_path text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $fn$
  SELECT coalesce(p_path, '') ~ ('^/('
    -- aree applicative
    || 'azienda|admin|campo|tecnico|clienti|cliente|commercialista|partner|referral|produttore'
    || '|portale|appuntamento|prenota|dipendente|venditore|dev|widget'
    -- accessi, registrazione, password
    || '|login|registrati|signup|register|reset-password|cambia-password|recupera-password|auth'
    || '|logout|seleziona-azienda|2fa|admin-login|clienti-login|commercialista-login|lavori-login'
    || '|produttore-login|referral-login'
    -- pagine raggiunte da un link personale
    || '|firma|firma-fea|firma-odv|firma-sal|preventivo|accetta-preventivo|stima|candidatura'
    || '|talent-profile|qr|review|feedback'
    -- rientri da accessi esterni
    || '|oauth-done|meta-oauth-done'
    || ')(/|$)');
$fn$;

-- Indirizzi che non sono il sito pubblico: sviluppo, anteprime, app e admin.
-- Un host NULL (storico) non e' escluso: per quello decidono le altre regole.
CREATE OR REPLACE FUNCTION public.sito_host_escluso(p_host text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $fn$
  SELECT coalesce(lower(p_host), '') ~ '^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:[0-9]+)?$'
      OR coalesce(lower(p_host), '') ~ '\.(local|pages\.dev|lovable\.app|lovableproject\.com)(:[0-9]+)?$'
      OR coalesce(lower(p_host), '') ~ '^(app|admin)\.';
$fn$;

-- La fonte d'ingresso, con un nome che si capisce.
--
-- Gli assistenti AI si riconoscono PRIMA di usare utm_source cosi' com'e':
-- ChatGPT aggiunge da solo `utm_source=chatgpt.com` ai link che cita, spesso
-- senza referrer. Guardando solo il referrer, al momento della scrittura le
-- visite da ChatGPT sembravano una; col tag sono dieci. Un utm_source messo
-- a mano per una campagna resta invece com'e': e' una scelta deliberata.
CREATE OR REPLACE FUNCTION public.sito_fonte(p_utm_source text, p_referrer text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN lower(coalesce(p_utm_source, '')) ~ '(chatgpt|openai|perplexity|claude|gemini|copilot|you\.com)'
      THEN 'assistenti AI'
    ELSE COALESCE(
    NULLIF(lower(trim(p_utm_source)), ''),
    CASE
      WHEN p_referrer IS NULL OR p_referrer = '' THEN 'diretto'
      -- il rientro da un accesso con Google non e' un referral
      WHEN p_referrer ~* '^https?://accounts\.google\.' THEN 'diretto'
      WHEN p_referrer ~* '^https?://([a-z0-9-]+\.)*(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|copilot\.com|you\.com)' THEN 'assistenti AI'
      WHEN p_referrer ~* '^https?://([a-z0-9-]+\.)*google\.' THEN 'google'
      WHEN p_referrer ~* '^https?://([a-z0-9-]+\.)*(bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.com|qwant\.com|yandex\.)' THEN 'altri motori'
      WHEN p_referrer ~* '^https?://([a-z0-9-]+\.)*(facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|twitter\.com|x\.com|t\.co|tiktok\.com|youtube\.com)' THEN 'social'
      WHEN p_referrer ~* '^https?://([a-z0-9-]+\.)*(ediliziaincloud\.(com|it)|edilizia\.io|aedix\.it)' THEN 'nostri siti'
      ELSE regexp_replace(p_referrer, '^https?://(www\.)?([^/:]+).*$', '\2')
    END)
  END;
$fn$;

REVOKE ALL ON FUNCTION public.sito_percorso_applicativo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sito_host_escluso(text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sito_fonte(text, text)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sito_percorso_applicativo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sito_host_escluso(text)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sito_fonte(text, text)          TO authenticated, service_role;

-- ── All'ingresso: cio' che non e' sito pubblico non entra ───────────────────
-- Solo per l'azienda di piattaforma. `to_jsonb(NEW)` perche' le due tabelle
-- chiamano il percorso in modo diverso (path / landing_page): nominarli
-- entrambi direttamente fallirebbe sulla tabella che non ha la colonna.
CREATE OR REPLACE FUNCTION public.attribution_scarta_non_sito()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_riga jsonb := to_jsonb(NEW);
BEGIN
  IF NEW.company_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND ( public.sito_host_escluso(v_riga ->> 'host')
        OR public.sito_percorso_applicativo(coalesce(v_riga ->> 'path', v_riga ->> 'landing_page')) )
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.attribution_scarta_non_sito() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_attribution_pageviews_solo_sito ON public.attribution_pageviews;
CREATE TRIGGER trg_attribution_pageviews_solo_sito
  BEFORE INSERT ON public.attribution_pageviews
  FOR EACH ROW EXECUTE FUNCTION public.attribution_scarta_non_sito();

DROP TRIGGER IF EXISTS trg_attribution_sessions_solo_sito ON public.attribution_sessions;
CREATE TRIGGER trg_attribution_sessions_solo_sito
  BEFORE INSERT ON public.attribution_sessions
  FOR EACH ROW EXECUTE FUNCTION public.attribution_scarta_non_sito();

-- ── La pagina ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_sito_traffico(p_giorni integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_piattaforma CONSTANT uuid := '00000000-0000-0000-0000-000000000001';
  v_giorni   integer     := GREATEST(coalesce(p_giorni, 30), 1);
  v_da       timestamptz := now() - make_interval(days => v_giorni);
  v_da_prima timestamptz := now() - make_interval(days => v_giorni * 2);
  v_esito    jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  WITH
  -- Solo il sito pubblico, periodo corrente e precedente insieme. Per le righe
  -- nuove lo garantisce gia' il trigger; qui serve per lo storico senza host.
  grezze AS (
    SELECT pv.*
      FROM public.attribution_pageviews pv
     WHERE pv.company_id = c_piattaforma
       AND pv.viewed_at >= v_da_prima
       AND NOT public.sito_percorso_applicativo(pv.path)
       AND NOT public.sito_host_escluso(pv.host)
       AND NOT (pv.host IS NULL AND coalesce(pv.referrer, '') ~* '^https?://(localhost|127\.0\.0\.1)')
  ),
  viste AS (
    SELECT g.*,
           (g.viewed_at AT TIME ZONE 'Europe/Rome')::date AS giorno,
           row_number() OVER (PARTITION BY g.session_id ORDER BY g.viewed_at DESC) = 1 AS e_uscita,
           row_number() OVER (PARTITION BY g.session_id ORDER BY g.viewed_at)      = 1 AS e_ingresso,
           count(*)     OVER (PARTITION BY g.session_id)                               AS pagine_sessione
      FROM grezze g
     WHERE g.viewed_at >= v_da
  ),
  prima AS (
    SELECT count(*) AS viste,
           count(DISTINCT session_id) AS sessioni,
           count(DISTINCT visitor_id) AS visitatori
      FROM grezze
     WHERE viewed_at < v_da
  ),
  ora AS (
    SELECT count(*) AS viste,
           count(DISTINCT session_id) AS sessioni,
           count(DISTINCT visitor_id) AS visitatori
      FROM viste
  ),
  sessioni AS (
    SELECT s.*, public.sito_fonte(s.utm_source, s.referrer) AS fonte
      FROM public.attribution_sessions s
     WHERE s.company_id = c_piattaforma
       AND (s.started_at >= v_da OR s.converted_at >= v_da)
       AND NOT public.sito_percorso_applicativo(s.landing_page)
       AND NOT public.sito_host_escluso(s.host)
       AND NOT (s.host IS NULL AND coalesce(s.referrer, '') ~* '^https?://(localhost|127\.0\.0\.1)')
  ),
  richieste AS (
    SELECT s.converted_at, s.landing_page, s.pages_viewed, s.fonte,
           nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') AS nome
      FROM sessioni s
      LEFT JOIN public.marketing_contacts c ON c.id = s.contact_id
     WHERE s.converted_at >= v_da
  )
  SELECT jsonb_build_object(
    'riepilogo', jsonb_build_object(
      'giorni',                v_giorni,
      'pagine_viste',          (SELECT viste FROM ora),
      'sessioni',              (SELECT sessioni FROM ora),
      'visitatori',            (SELECT visitatori FROM ora),
      'pagine_per_sessione',   (SELECT round(viste::numeric / NULLIF(sessioni, 0), 2) FROM ora),
      'sessioni_una_pagina',   (SELECT count(*) FROM (SELECT 1 FROM viste GROUP BY session_id HAVING count(*) = 1) x),
      'tempo_tipico_pagina_s', (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY durata_ms))::numeric / 1000, 1)
                                  FROM viste WHERE durata_ms IS NOT NULL),
      'tempo_medio_pagina_s',  (SELECT round(avg(durata_ms) / 1000.0, 1) FROM viste WHERE durata_ms IS NOT NULL),
      'viste_con_tempo',       (SELECT count(*) FROM viste WHERE durata_ms IS NOT NULL),
      'viste_precedente',      (SELECT viste FROM prima),
      'sessioni_precedente',   (SELECT sessioni FROM prima),
      'visitatori_precedente', (SELECT visitatori FROM prima),
      'crescita_viste_pct',      (SELECT CASE WHEN p.viste > 0      THEN round(100.0 * (o.viste - p.viste) / p.viste, 1) END FROM ora o, prima p),
      'crescita_sessioni_pct',   (SELECT CASE WHEN p.sessioni > 0   THEN round(100.0 * (o.sessioni - p.sessioni) / p.sessioni, 1) END FROM ora o, prima p),
      'crescita_visitatori_pct', (SELECT CASE WHEN p.visitatori > 0 THEN round(100.0 * (o.visitatori - p.visitatori) / p.visitatori, 1) END FROM ora o, prima p),
      'richieste',             (SELECT count(*) FROM richieste),
      'tasso_richiesta_pct',   (SELECT round(100.0 * (SELECT count(*) FROM richieste) / NULLIF(sessioni, 0), 1) FROM ora)
    ),
    -- Le pagine: quanto ci si ferma (mediana) e quanto spesso sono l'ultima.
    'pagine', (SELECT COALESCE(jsonb_agg(t ORDER BY t.viste DESC), '[]'::jsonb) FROM (
      SELECT path AS pagina,
             count(*) AS viste,
             count(DISTINCT visitor_id) AS visitatori,
             round((percentile_cont(0.5) WITHIN GROUP (ORDER BY durata_ms))::numeric / 1000, 1) AS tempo_tipico_s,
             round(avg(durata_ms) / 1000.0, 1) AS tempo_medio_s,
             count(durata_ms) AS misurate,
             count(*) FILTER (WHERE e_uscita) AS uscite,
             round(100.0 * count(*) FILTER (WHERE e_uscita) / NULLIF(count(*), 0), 0) AS uscite_pct,
             max(title) AS titolo
        FROM viste
       GROUP BY path
       ORDER BY count(*) DESC
       LIMIT 50) t),
    -- Da quale pagina entrano: la porta del sito, spesso non e' la home.
    'ingressi', (SELECT COALESCE(jsonb_agg(t ORDER BY t.ingressi DESC), '[]'::jsonb) FROM (
      SELECT path AS pagina,
             count(*) AS ingressi,
             count(*) FILTER (WHERE pagine_sessione = 1) AS senza_seguito,
             round(100.0 * count(*) FILTER (WHERE pagine_sessione = 1) / NULLIF(count(*), 0), 0) AS senza_seguito_pct
        FROM viste
       WHERE e_ingresso
       GROUP BY path
       ORDER BY count(*) DESC
       LIMIT 20) t),
    -- Da dove arrivano, e quali fonti portano richieste.
    'fonti', (SELECT COALESCE(jsonb_agg(t ORDER BY t.sessioni DESC), '[]'::jsonb) FROM (
      SELECT fonte,
             count(*) FILTER (WHERE started_at >= v_da) AS sessioni,
             count(DISTINCT visitor_id) FILTER (WHERE started_at >= v_da) AS visitatori,
             count(*) FILTER (WHERE converted_at >= v_da) AS richieste
        FROM sessioni
       GROUP BY fonte
      HAVING count(*) FILTER (WHERE started_at >= v_da) > 0
          OR count(*) FILTER (WHERE converted_at >= v_da) > 0
       ORDER BY count(*) FILTER (WHERE started_at >= v_da) DESC
       LIMIT 15) t),
    -- Le visite diventate richieste: chi, da dove, dopo quante pagine.
    'richieste', (SELECT COALESCE(jsonb_agg(t ORDER BY t.quando DESC), '[]'::jsonb) FROM (
      SELECT converted_at AS quando, nome, fonte, landing_page AS ingresso, pages_viewed AS pagine
        FROM richieste
       ORDER BY converted_at DESC
       LIMIT 20) t),
    -- Giorno per giorno in ora italiana, con i giorni vuoti a zero.
    'giorni', (SELECT COALESCE(jsonb_agg(t ORDER BY t.giorno), '[]'::jsonb) FROM (
      SELECT d::date AS giorno,
             count(v.id) AS viste,
             count(DISTINCT v.session_id) AS sessioni,
             count(DISTINCT v.visitor_id) AS visitatori
        FROM generate_series((v_da AT TIME ZONE 'Europe/Rome')::date,
                             (now() AT TIME ZONE 'Europe/Rome')::date,
                             interval '1 day') d
        LEFT JOIN viste v ON v.giorno = d::date
       GROUP BY d) t),
    'calcolato_il', now()
  ) INTO v_esito;

  RETURN v_esito;
END;
$function$;
