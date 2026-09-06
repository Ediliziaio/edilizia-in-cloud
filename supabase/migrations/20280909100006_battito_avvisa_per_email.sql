-- L'avviso deve partire MENTRE la piattaforma è giù, non dopo. Questo esclude
-- ogni percorso che passi da una edge function: `sendEmailUnified` come prima
-- cosa legge la configurazione del provider dal database, e il 5 settembre
-- quella lettura sarebbe rimasta appesa come tutte le altre.
--
-- Quello che invece funzionava, quel giorno, era tutto ciò che vive dentro
-- Postgres: pg_cron ha eseguito 2.218 job senza un fallimento. Quindi l'avviso
-- si spedisce da qui: pg_net chiama direttamente l'API di Resend, con la chiave
-- e i destinatari letti dal database locale. Nessuna connessione in ingresso,
-- nessuna edge function, nessuna dipendenza da ciò che si è rotto.
--
-- Un solo messaggio per interruzione, più uno al rientro con la durata: un
-- avviso che si ripete ogni due minuti si impara a ignorarlo, ed è il modo più
-- rapido per rendere inutile un sistema di allarme.

CREATE TABLE IF NOT EXISTS public.battito_avvisi (
  id                  bigserial PRIMARY KEY,
  iniziato_il         timestamptz NOT NULL,
  terminato_il        timestamptz,
  controlli_falliti   int NOT NULL DEFAULT 0,
  avvisato_giu_il     timestamptz,
  avvisato_rientro_il timestamptz,
  destinatari         text[]
);

CREATE INDEX IF NOT EXISTS battito_avvisi_aperto_idx ON public.battito_avvisi (id DESC) WHERE terminato_il IS NULL;

ALTER TABLE public.battito_avvisi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.battito_avvisi FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.battito_avvisi TO service_role;

-- Invio grezzo via Resend. Volutamente senza fronzoli: meno cose fa, meno cose
-- possono rompersi proprio nel momento in cui serve.
CREATE OR REPLACE FUNCTION public.battito_invia_email(
  p_destinatari text[], p_oggetto text, p_html text
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'net' AS $function$
DECLARE v_chiave text; v_da text; v_nome text; v_id bigint;
BEGIN
  IF p_destinatari IS NULL OR array_length(p_destinatari, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT value INTO v_chiave FROM public.platform_settings WHERE key = 'email_transactional_api_key';
  SELECT value INTO v_da     FROM public.platform_settings WHERE key = 'email_transactional_from_address';
  SELECT value INTO v_nome   FROM public.platform_settings WHERE key = 'email_transactional_from_name';
  IF v_chiave IS NULL OR v_da IS NULL THEN
    RAISE WARNING 'Battito: manca la configurazione email transazionale, avviso non inviato';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_chiave),
    body    := jsonb_build_object(
                 'from',    COALESCE(v_nome || ' <' || v_da || '>', v_da),
                 'to',      to_jsonb(p_destinatari),
                 'subject', p_oggetto,
                 'html',    p_html),
    timeout_milliseconds := 10000
  ) INTO v_id;

  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.battito_avvisa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_falliti_di_fila int;
  v_ultimo_esito    text;
  v_aperto          public.battito_avvisi%ROWTYPE;
  v_dest            text[];
  v_da              timestamptz;
  v_minuti          int;
  v_html            text;
  v_azione          text := 'niente';
BEGIN
  SELECT falliti_di_fila, ultimo_esito INTO v_falliti_di_fila, v_ultimo_esito
    FROM public.v_battito_stato;

  SELECT * INTO v_aperto FROM public.battito_avvisi
   WHERE terminato_il IS NULL ORDER BY id DESC LIMIT 1;

  -- Chi ha le chiavi della piattaforma. Letto qui dentro, dove il database
  -- risponde anche quando non risponde a nessun altro.
  SELECT array_agg(DISTINCT p.email) INTO v_dest
    FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
   WHERE (ur.role::text = 'super_admin' OR ur.role::text LIKE 'platform%')
     AND p.email IS NOT NULL;

  -- Tre controlli falliti di fila: sei minuti. Uno solo sarebbe un singhiozzo,
  -- e un allarme che scatta per un singhiozzo smette di essere letto.
  IF v_falliti_di_fila >= 3 THEN
    IF v_aperto.id IS NULL THEN
      SELECT min(avviato_il) INTO v_da
        FROM (SELECT avviato_il FROM public.battito_esterno
               WHERE esito = 'fallito' ORDER BY avviato_il DESC LIMIT v_falliti_di_fila) s;

      INSERT INTO public.battito_avvisi (iniziato_il, controlli_falliti, destinatari)
      VALUES (COALESCE(v_da, now()), v_falliti_di_fila, v_dest)
      RETURNING * INTO v_aperto;

      v_html :=
        '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:sans-serif;color:#111827;">'
        || '<h2 style="font-size:18px;margin:0 0 12px;">Edilizia in Cloud non risponde</h2>'
        || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">La sonda interroga la piattaforma dall''esterno ogni due minuti. '
        || 'Gli ultimi <strong>' || v_falliti_di_fila || '</strong> controlli non hanno avuto risposta.</p>'
        || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Primo controllo fallito: <strong>'
        || to_char(COALESCE(v_da, now()) AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY HH24:MI') || '</strong> (ora italiana).</p>'
        || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Cosa guardare, nell''ordine: il pannello Supabase alla voce '
        || 'Reports/Database (connessioni attive e query lunghe), e se non si vede nulla, Settings → General → Restart project. '
        || 'Attenzione: lo stato del progetto può restare ACTIVE_HEALTHY anche mentre il database non accetta connessioni.</p>'
        || '<p style="font-size:12px;color:#9ca3af;margin-top:20px;">Riceverai un secondo messaggio quando la piattaforma torna a rispondere. '
        || 'Nel frattempo questo avviso non si ripete.</p></div>';

      UPDATE public.battito_avvisi
         SET avvisato_giu_il = now()
       WHERE id = v_aperto.id
         AND public.battito_invia_email(v_dest, 'Edilizia in Cloud non risponde', v_html) IS NOT NULL;

      v_azione := 'avviso_giu';
    ELSE
      UPDATE public.battito_avvisi SET controlli_falliti = v_falliti_di_fila WHERE id = v_aperto.id;
      v_azione := 'gia_avvisato';
    END IF;

  ELSIF v_aperto.id IS NOT NULL AND v_ultimo_esito = 'ok' THEN
    v_minuti := GREATEST(1, (EXTRACT(EPOCH FROM (now() - v_aperto.iniziato_il)) / 60)::int);

    v_html :=
      '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:sans-serif;color:#111827;">'
      || '<h2 style="font-size:18px;margin:0 0 12px;">Edilizia in Cloud risponde di nuovo</h2>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">L''interruzione è durata <strong>'
      || v_minuti || ' minuti</strong>, dalle '
      || to_char(v_aperto.iniziato_il AT TIME ZONE 'Europe/Rome', 'HH24:MI') || ' alle '
      || to_char(now() AT TIME ZONE 'Europe/Rome', 'HH24:MI') || ' (ora italiana), con '
      || v_aperto.controlli_falliti || ' controlli senza risposta.</p>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">La finestra resta registrata nella pagina '
      || '<strong>Salute piattaforma</strong>, sotto "Quando la piattaforma non ha risposto".</p></div>';

    UPDATE public.battito_avvisi
       SET terminato_il = now(),
           avvisato_rientro_il = CASE
             WHEN public.battito_invia_email(COALESCE(destinatari, v_dest),
                                             'Edilizia in Cloud risponde di nuovo', v_html) IS NOT NULL
             THEN now() END
     WHERE id = v_aperto.id;

    v_azione := 'avviso_rientro';
  END IF;

  RETURN jsonb_build_object('azione', v_azione, 'falliti_di_fila', v_falliti_di_fila,
                            'destinatari', COALESCE(array_length(v_dest, 1), 0));
END; $function$;

-- Il controllo periodico tira le somme e, se serve, avvisa: un job in meno da
-- tenere allineato, e nessuna finestra fra la constatazione e l'allarme.
CREATE OR REPLACE FUNCTION public.battito_verifica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'net' AS $function$
DECLARE v_chiusi int; v_scaduti int; v_avviso jsonb;
BEGIN
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

  WITH agg AS (
    UPDATE public.battito_esterno
       SET esito = 'fallito', errore = COALESCE(errore, 'nessuna risposta entro 90 secondi')
     WHERE esito IS NULL AND avviato_il < now() - interval '90 seconds'
    RETURNING 1
  ) SELECT count(*) INTO v_scaduti FROM agg;

  DELETE FROM public.battito_esterno WHERE avviato_il < now() - interval '30 days';

  -- Se l'avviso fallisce, il battito non deve fermarsi: la registrazione vale
  -- anche senza email, l'email senza registrazione no.
  BEGIN
    v_avviso := public.battito_avvisa();
  EXCEPTION WHEN OTHERS THEN
    v_avviso := jsonb_build_object('errore', SQLERRM);
    RAISE WARNING 'Battito: avviso non riuscito: %', SQLERRM;
  END;

  RETURN jsonb_build_object('chiusi', v_chiusi, 'senza_risposta', v_scaduti, 'avviso', v_avviso);
END; $function$;

REVOKE ALL ON FUNCTION public.battito_invia_email(text[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.battito_avvisa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.battito_avvisa() TO service_role;
