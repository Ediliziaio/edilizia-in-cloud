-- L'avviso «integrazione in errore» guardava l'ultimo controllo di ogni nome
-- mai comparso in integration_health_log, senza chiedersi quanto fosse vecchio.
-- Il controllo «elastic_email» ha cambiato nome ad aprile (oggi si chiama
-- email_marketing / email_transactional): la sua ultima riga, «degraded» del
-- 22/04, è rimasta l'ultima per sempre, e dal 7 settembre ogni giorno è
-- partita un'email «Integrazione elastic_email in errore da 3.700 ore» per un
-- controllo che non esiste più. Tredici avvisi su un fantasma.
--
-- Un nome che non viene più controllato non è un'integrazione in errore: è un
-- controllo spento. Si avvisa solo su ciò che è stato controllato negli ultimi
-- due giorni (i controlli girano alle 06:20 e alle 18:20).
--
-- In più: il testo dell'errore passa da 200 a 400 caratteri. Dal 20/09 il
-- controllo spiega cosa non va («Token valido, ma senza il permesso…») invece
-- di scrivere «HTTP 403», e tagliato a metà non serviva.

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
       -- Solo i controlli ancora vivi: un nome fermo da più di due giorni è un
       -- controllo spento o rinominato, non un guasto.
       AND u.checked_at > now() - interval '48 hours'
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
      || '</strong>' || COALESCE(' — ' || left(r.error_message, 400), '') || '</p>'
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
