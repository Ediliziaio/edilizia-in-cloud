-- Cloudflare risponde 403 a ogni controllo dalle 06:20 del 6 settembre, ed
-- elastic_email è "degraded" da altrettanto. Il controllo lo scrive
-- diligentemente in integration_health_log, 6.908 righe, e nessuna pagina lo
-- mette davanti a qualcuno: si vede solo aprendo Connessioni.
--
-- Un guasto che dura è diverso da un singhiozzo: un 403 per un'ora è un
-- incidente del fornitore, un 403 per un giorno è un token scaduto. Qui si
-- avvisa quando il guasto supera le sei ore, una volta al giorno per
-- integrazione, con lo stesso canale del battito — parte da dentro il database.

CREATE TABLE IF NOT EXISTS public.integrazioni_avvisi (
  integration_name text NOT NULL,
  avvisato_il      timestamptz NOT NULL DEFAULT now(),
  stato            text,
  errore           text,
  guasto_da        timestamptz,
  PRIMARY KEY (integration_name, avvisato_il)
);
ALTER TABLE public.integrazioni_avvisi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integrazioni_avvisi FROM PUBLIC, anon;
GRANT SELECT ON public.integrazioni_avvisi TO service_role;

CREATE OR REPLACE FUNCTION public.integrazioni_avvisa()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  r        RECORD;
  v_dest   text[];
  v_html   text;
  v_ore    int;
  v_quante int := 0;
  v_nomi   text[] := '{}';
BEGIN
  SELECT array_agg(DISTINCT p.email) INTO v_dest
    FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
   WHERE (ur.role::text = 'super_admin' OR ur.role::text LIKE 'platform%') AND p.email IS NOT NULL;

  FOR r IN
    WITH ultimo AS (
      SELECT DISTINCT ON (integration_name) integration_name, status, error_message, checked_at
        FROM public.integration_health_log
       ORDER BY integration_name, checked_at DESC
    ), ultimo_sano AS (
      SELECT integration_name, max(checked_at) AS sano_il
        FROM public.integration_health_log
       WHERE status IN ('healthy', 'ok')
       GROUP BY integration_name
    )
    SELECT u.integration_name, u.status, u.error_message, u.checked_at,
           COALESCE(s.sano_il, u.checked_at - interval '7 days') AS sano_il
      FROM ultimo u LEFT JOIN ultimo_sano s USING (integration_name)
     WHERE u.status NOT IN ('healthy', 'ok', 'unconfigured')
       AND COALESCE(s.sano_il, u.checked_at - interval '7 days') < now() - interval '6 hours'
       AND NOT EXISTS (SELECT 1 FROM public.integrazioni_avvisi a
                        WHERE a.integration_name = u.integration_name
                          AND a.avvisato_il > now() - interval '24 hours')
  LOOP
    v_ore := GREATEST(1, (EXTRACT(EPOCH FROM (now() - r.sano_il)) / 3600)::int);
    v_html :=
      '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:sans-serif;color:#111827;">'
      || '<h2 style="font-size:18px;margin:0 0 12px;">Integrazione ' || r.integration_name || ' in errore da ' || v_ore || ' ore</h2>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Ultimo controllo: <strong>' || COALESCE(r.status, '?')
      || '</strong>' || COALESCE(' — ' || left(r.error_message, 200), '') || '.</p>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Ultima risposta sana: '
      || to_char(r.sano_il AT TIME ZONE 'Europe/Rome', 'DD/MM HH24:MI') || ' (ora italiana). '
      || 'Un errore che dura più di qualche ora non è un singhiozzo del fornitore: di solito è un token scaduto o un permesso tolto.</p>'
      || '<p style="font-size:12px;color:#9ca3af;margin-top:20px;">Questo avviso non si ripete per 24 ore. Il dettaglio è nella pagina Connessioni del SuperAdmin.</p></div>';

    INSERT INTO public.integrazioni_avvisi (integration_name, stato, errore, guasto_da)
    VALUES (r.integration_name, r.status, left(r.error_message, 500), r.sano_il);

    PERFORM public.battito_invia_email(v_dest, 'Integrazione ' || r.integration_name || ' in errore da ' || v_ore || ' ore', v_html);
    v_quante := v_quante + 1;
    v_nomi := v_nomi || r.integration_name;
  END LOOP;

  RETURN jsonb_build_object('avvisi', v_quante, 'integrazioni', v_nomi);
END; $function$;

REVOKE ALL ON FUNCTION public.integrazioni_avvisa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integrazioni_avvisa() TO service_role;

-- Ogni ora, al minuto 7: i controlli delle integrazioni girano alle 06:20 e
-- alle 18:20, e un'ora dopo il dato è già lì.
SELECT cron.schedule('integrazioni-avviso-orario', '7 * * * *', 'SELECT public.integrazioni_avvisa()');
