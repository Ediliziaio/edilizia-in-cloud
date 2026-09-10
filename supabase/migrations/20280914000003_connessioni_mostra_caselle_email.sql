-- Le caselle email collegate entrano nel cruscotto Connessioni.
--
-- Fino a ieri non c'era un posto dove vedere quali caselle dei clienti hanno
-- smesso di funzionare: due Gmail sono rimaste ferme da giugno a settembre e
-- l'unico modo di accorgersene era aprire il profilo di quella persona, in
-- quell'azienda. Ora stanno accanto alle altre integrazioni, con da quanti
-- giorni sono ferme e perché — e la pagina lo dice in cima, come già fa per le
-- integrazioni che non rispondono.
--
-- Il resto della funzione è invariato rispetto a 20280904101900.

CREATE OR REPLACE FUNCTION public.admin_stato_connessioni()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_integrazioni jsonb; v_chiavi jsonb; v_webhook jsonb; v_riepilogo jsonb;
  v_caselle jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.errori_7g DESC, t.integrazione), '[]'::jsonb)
    INTO v_integrazioni
  FROM (
    SELECT h.integration_name AS integrazione,
           count(*) AS controlli_7g,
           -- Gli stati sani sono 'healthy' e 'ok': tutto il resto (degraded,
           -- down, error) conta come problema.
           count(*) FILTER (WHERE COALESCE(h.status,'') NOT IN ('healthy','ok')) AS errori_7g,
           max(h.checked_at) AS ultimo_controllo,
           (array_agg(h.status ORDER BY h.checked_at DESC))[1] AS stato_attuale,
           (array_agg(h.error_message ORDER BY h.checked_at DESC)
              FILTER (WHERE h.error_message IS NOT NULL))[1] AS ultimo_errore,
           round(avg(h.response_ms)) AS latenza_media_ms,
           -- Un controllo che non arriva da giorni è esso stesso un sintomo.
           (max(h.checked_at) < now() - interval '36 hours') AS controllo_fermo
      FROM public.integration_health_log h
     WHERE h.checked_at > now() - interval '7 days'
     GROUP BY h.integration_name
  ) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.chiamate_7g DESC NULLS LAST), '[]'::jsonb) INTO v_chiavi
  FROM (
    SELECT k.id, k.name AS nome, k.key_prefix AS prefisso, c.name AS azienda,
           k.scopes AS ambiti, k.is_active AS attiva, k.revoked_at AS revocata_il,
           k.expires_at AS scade_il, k.last_used_at AS ultimo_uso,
           k.rate_limit_per_minute AS limite_minuto,
           (SELECT count(*) FROM public.api_usage_log u
             WHERE u.api_key_id = k.id AND u.created_at > now() - interval '7 days') AS chiamate_7g,
           (SELECT count(*) FROM public.api_usage_log u
             WHERE u.api_key_id = k.id AND u.created_at > now() - interval '7 days'
               AND u.status_code >= 400) AS errori_7g
      FROM public.api_keys k
      LEFT JOIN public.companies c ON c.id = k.company_id
  ) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.fallite_7g DESC NULLS LAST), '[]'::jsonb) INTO v_webhook
  FROM (
    SELECT w.id, w.name AS nome, w.url, 'piattaforma'::text AS ambito,
           NULL::text AS azienda, w.is_active AS attivo,
           w.failure_count AS fallimenti_consecutivi, w.last_triggered_at AS ultimo_invio,
           w.last_status_code AS ultimo_esito, NULL::timestamptz AS in_pausa_dal,
           (SELECT count(*) FROM public.platform_webhook_deliveries d
             WHERE d.webhook_id = w.id AND d.delivered_at > now() - interval '7 days'
               AND d.status_code >= 400) AS fallite_7g
      FROM public.platform_webhooks w
    UNION ALL
    SELECT w.id, w.name, w.url, 'azienda', c.name, w.is_active,
           w.consecutive_failures, NULL::timestamptz, NULL::integer, w.paused_at,
           (SELECT count(*) FROM public.webhook_deliveries d
             WHERE d.webhook_id = w.id AND d.created_at > now() - interval '7 days'
               AND (d.status <> 'success' OR d.http_status >= 400)) AS fallite_7g
      FROM public.webhooks w
      LEFT JOIN public.companies c ON c.id = w.company_id
  ) t;

  -- Caselle email collegate dalle persone (Gmail, Outlook, Aruba, Register…).
  SELECT COALESCE(jsonb_agg(t ORDER BY t.giorni_ferma DESC NULLS LAST, t.azienda), '[]'::jsonb)
    INTO v_caselle
  FROM (
    SELECT c.id,
           c.email_address AS casella,
           c.provider,
           c.provider_label AS servizio,
           co.name AS azienda,
           NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '') AS persona,
           c.status AS stato,
           c.consecutive_errors AS errori_di_fila,
           c.last_synced_at AS ultimo_scambio,
           LEFT(COALESCE(c.last_sync_error, ''), 140) AS ultimo_errore,
           CASE
             WHEN c.status IN ('expired', 'revoked', 'error')
               THEN GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(c.last_synced_at, c.created_at))) / 86400)::int)
             ELSE NULL
           END AS giorni_ferma
      FROM public.email_oauth_connections c
      LEFT JOIN public.companies co ON co.id = c.company_id
      LEFT JOIN public.profiles p ON p.id = c.user_id
  ) t;

  SELECT jsonb_build_object(
    'integrazioni_monitorate', jsonb_array_length(v_integrazioni),
    'integrazioni_in_errore', (SELECT count(*) FROM jsonb_array_elements(v_integrazioni) e
                                WHERE (e->>'errori_7g')::int > 0),
    'integrazioni_senza_controlli', (SELECT count(*) FROM jsonb_array_elements(v_integrazioni) e
                                      WHERE (e->>'controllo_fermo')::boolean),
    'chiavi_totali', (SELECT count(*) FROM public.api_keys),
    'chiavi_attive', (SELECT count(*) FROM public.api_keys
                       WHERE COALESCE(is_active, false) AND revoked_at IS NULL),
    'chiavi_dormienti', (SELECT count(*) FROM public.api_keys
                          WHERE COALESCE(is_active, false) AND revoked_at IS NULL
                            AND (last_used_at IS NULL OR last_used_at < now() - interval '90 days')),
    'chiavi_in_scadenza_30g', (SELECT count(*) FROM public.api_keys
                                WHERE COALESCE(is_active, false) AND revoked_at IS NULL
                                  AND expires_at IS NOT NULL
                                  AND expires_at BETWEEN now() AND now() + interval '30 days'),
    'webhook_totali', jsonb_array_length(v_webhook),
    'webhook_in_pausa', (SELECT count(*) FROM public.webhooks WHERE paused_at IS NOT NULL),
    'chiamate_api_7g', (SELECT count(*) FROM public.api_usage_log
                         WHERE created_at > now() - interval '7 days'),
    'caselle_email_totali', jsonb_array_length(v_caselle),
    'caselle_email_ferme', (SELECT count(*) FROM jsonb_array_elements(v_caselle) e
                             WHERE e->>'giorni_ferma' IS NOT NULL)
  ) INTO v_riepilogo;

  RETURN jsonb_build_object('riepilogo', v_riepilogo, 'integrazioni', v_integrazioni,
    'chiavi_api', v_chiavi, 'webhook', v_webhook, 'caselle_email', v_caselle,
    'calcolato_il', now());
END;
$function$;
