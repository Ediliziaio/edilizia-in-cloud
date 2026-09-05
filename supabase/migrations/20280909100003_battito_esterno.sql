-- Il 5 settembre 2026 il database è rimasto irraggiungibile dall'esterno per due
-- ore e nessuno se n'è accorto. Non per mancanza di sorveglianza: sentinelle,
-- canarino, cron_health_check, sentinelle_effetti_cron esistono tutti — ma
-- girano DENTRO il database, via pg_cron, e quel giorno pg_cron stava benissimo:
-- 2.218 esecuzioni, zero fallimenti. Il guasto era sulle connessioni in
-- ingresso, cioè esattamente l'unica cosa che nessuna sonda interna guarda.
--
-- Questo battito chiude il cerchio: pg_cron è vivo anche quando le connessioni
-- sono sature, e pg_net esce verso l'esterno e rientra dalla porta pubblica —
-- lo stesso percorso che usa l'applicazione. Se quella porta è chiusa, la sonda
-- non riceve risposta e lo registra.
--
-- Non sostituisce un controllo davvero esterno, ospitato altrove: se il progetto
-- Supabase si spegne del tutto, si spegne anche questo. Copre però il guasto che
-- si è visto davvero, ed è l'unico che finora passava inosservato.

-- Bersaglio della sonda: una funzione che non dice nulla e non legge nulla, ma
-- che per rispondere obbliga PostgREST a ottenere una connessione al database.
-- Un 401 su una tabella qualsiasi sarebbe arrivato senza toccare il database, e
-- avrebbe fatto sembrare sano un database irraggiungibile.
CREATE OR REPLACE FUNCTION public.battito_ping()
RETURNS boolean LANGUAGE sql STABLE
SET search_path TO 'public' AS $function$ SELECT true $function$;

COMMENT ON FUNCTION public.battito_ping() IS
  'Sonda di raggiungibilità. Volutamente eseguibile da anon: non legge dati, serve solo a provare che il database risponde attraverso la porta pubblica.';

GRANT EXECUTE ON FUNCTION public.battito_ping() TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.battito_esterno (
  id           bigserial PRIMARY KEY,
  avviato_il   timestamptz NOT NULL DEFAULT now(),
  request_id   bigint,
  esito        text,               -- 'ok' | 'fallito' | NULL se ancora in volo
  status_code  int,
  durata_ms    int,
  errore       text
);

CREATE INDEX IF NOT EXISTS battito_esterno_avviato_idx ON public.battito_esterno (avviato_il DESC);
CREATE INDEX IF NOT EXISTS battito_esterno_in_volo_idx ON public.battito_esterno (request_id) WHERE esito IS NULL;

ALTER TABLE public.battito_esterno ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.battito_esterno FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.battito_esterno TO service_role;

CREATE OR REPLACE FUNCTION public.battito_avvia()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'net', 'vault' AS $function$
DECLARE v_id bigint; v_chiave text;
BEGIN
  SELECT decrypted_secret INTO v_chiave FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key';
  IF v_chiave IS NULL THEN
    RAISE EXCEPTION 'Manca supabase_anon_key nel Vault: la sonda non può autenticarsi';
  END IF;

  SELECT net.http_post(
    url     := 'https://rsbrguhkodgnqfomrevo.supabase.co/rest/v1/rpc/battito_ping',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', v_chiave,
                                  'Authorization', 'Bearer ' || v_chiave),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) INTO v_id;

  INSERT INTO public.battito_esterno (request_id) VALUES (v_id);
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.battito_verifica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'net' AS $function$
DECLARE v_chiusi int; v_scaduti int;
BEGIN
  -- Risposte arrivate
  WITH agg AS (
    UPDATE public.battito_esterno b
       SET esito       = CASE WHEN r.status_code = 200 THEN 'ok' ELSE 'fallito' END,
           status_code = r.status_code,
           errore      = r.error_msg,
           durata_ms   = GREATEST(EXTRACT(MILLISECONDS FROM (r.created - b.avviato_il))::int, 0)
      FROM net._http_response r
     WHERE r.id = b.request_id AND b.esito IS NULL
    RETURNING 1
  ) SELECT count(*) INTO v_chiusi FROM agg;

  -- Nessuna risposta: è il caso che conta, ed è quello che il 5 settembre
  -- sarebbe stato l'unico segnale disponibile.
  WITH agg AS (
    UPDATE public.battito_esterno
       SET esito = 'fallito', errore = COALESCE(errore, 'nessuna risposta entro 90 secondi')
     WHERE esito IS NULL AND avviato_il < now() - interval '90 seconds'
    RETURNING 1
  ) SELECT count(*) INTO v_scaduti FROM agg;

  DELETE FROM public.battito_esterno WHERE avviato_il < now() - interval '30 days';

  RETURN jsonb_build_object('chiusi', v_chiusi, 'senza_risposta', v_scaduti);
END; $function$;

-- Lo stato in una riga: l'ultimo esito, da quanto dura, e quanto è stata
-- raggiungibile la piattaforma nelle ultime 24 ore.
CREATE OR REPLACE VIEW public.v_battito_stato
WITH (security_invoker = true) AS
WITH ultimi AS (
  SELECT esito, avviato_il, status_code, durata_ms,
         row_number() OVER (ORDER BY avviato_il DESC) AS n
    FROM public.battito_esterno
   WHERE esito IS NOT NULL
), consecutivi AS (
  SELECT count(*) AS falliti_di_fila
    FROM ultimi
   WHERE n <= COALESCE((SELECT min(n) FROM ultimi WHERE esito = 'ok'), 1000000) - 1
)
SELECT (SELECT esito FROM ultimi WHERE n = 1)                    AS ultimo_esito,
       (SELECT avviato_il FROM ultimi WHERE n = 1)               AS ultimo_controllo,
       (SELECT durata_ms FROM ultimi WHERE n = 1)                AS ultima_durata_ms,
       (SELECT falliti_di_fila FROM consecutivi)                 AS falliti_di_fila,
       (SELECT count(*) FROM public.battito_esterno
         WHERE avviato_il > now() - interval '24 hours' AND esito IS NOT NULL) AS controlli_24h,
       (SELECT count(*) FROM public.battito_esterno
         WHERE avviato_il > now() - interval '24 hours' AND esito = 'fallito') AS falliti_24h,
       (SELECT round(100.0 * count(*) FILTER (WHERE esito = 'ok') / NULLIF(count(*), 0), 2)
          FROM public.battito_esterno
         WHERE avviato_il > now() - interval '24 hours' AND esito IS NOT NULL)  AS disponibilita_24h_pct;

REVOKE ALL ON public.v_battito_stato FROM PUBLIC, anon;
GRANT SELECT ON public.v_battito_stato TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.battito_avvia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.battito_verifica() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battito_avvia() TO service_role;
GRANT EXECUTE ON FUNCTION public.battito_verifica() TO service_role;

-- Ogni due minuti la sonda parte, un minuto dopo si tirano le somme: il ritardo
-- serve perché una richiesta che non risponde va aspettata, non dichiarata morta
-- nello stesso istante in cui parte.
SELECT cron.schedule('battito-esterno-2min',   '*/2 * * * *',   'SELECT public.battito_avvia()');
SELECT cron.schedule('battito-verifica-2min',  '1-59/2 * * * *', 'SELECT public.battito_verifica()');
