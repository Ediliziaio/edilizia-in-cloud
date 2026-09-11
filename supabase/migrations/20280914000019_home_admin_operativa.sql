-- Home /admin ridisegnata (11/09/2026): 23 widget da SaaS con migliaia di
-- clienti — coorti, NRR, forecast, riconciliazione Stripe — con 18 aziende
-- dicevano lo stesso MRR sei volte e il resto era zero. La home risponde a
-- quattro domande: cosa devo fare oggi, chi usa il prodotto, come va
-- l'outreach, quanti soldi. Tre RPC leggere più il briefing esteso.

-- 1. Le aziende, una riga ciascuna: ultimo accesso, utenti, lavoro recente,
--    salute, insoluto. Le metriche pesanti vengono da mv_company_metrics
--    (aggiornata ogni 15 minuti), il resto è contato al volo su 18 righe.
CREATE OR REPLACE FUNCTION public.admin_home_aziende()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(r ORDER BY r.ultimo_accesso DESC NULLS LAST, r.nome), '[]'::jsonb) FROM (
      SELECT c.id, c.name AS nome, c.status AS stato, p.name AS piano,
             c.stripe_subscription_status AS stripe, c.created_at AS creata_il,
             m.ultimo_accesso, COALESCE(m.utenti_totali, 0) AS utenti_totali,
             COALESCE(m.mrr_listino, 0) AS mrr_listino, COALESCE(m.mrr_incassato, 0) AS mrr_incassato,
             (SELECT count(*) FROM public.profiles pr JOIN auth.users u ON u.id = pr.id
               WHERE pr.company_id = c.id AND u.last_sign_in_at > now() - interval '7 days') AS utenti_attivi_7g,
             (SELECT count(*) FROM public.orders o
               WHERE o.company_id = c.id AND o.created_at > now() - interval '30 days') AS ordini_30g,
             (SELECT count(*) FROM public.quotes q
               WHERE q.company_id = c.id AND q.deleted_at IS NULL AND q.created_at > now() - interval '30 days') AS preventivi_30g,
             (SELECT h.score FROM public.company_health_scores h
               WHERE h.company_id = c.id ORDER BY h.calculated_at DESC LIMIT 1) AS salute,
             EXISTS (SELECT 1 FROM public.v_insoluti i
                      WHERE i.azienda_id = c.id AND NOT COALESCE(i.in_omaggio, false)) AS insoluto
        FROM public.companies c
        LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id
        LEFT JOIN public.mv_company_metrics m ON m.company_id = c.id
       WHERE c.deleted_at IS NULL AND COALESCE(c.is_platform_admin_company, false) = false
    ) r);
END;
$function$;

-- 2. Outreach a freddo: email e WhatsApp, oggi e in coda.
CREATE OR REPLACE FUNCTION public.admin_home_outreach()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oggi timestamptz := (date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome');
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'whatsapp', jsonb_build_object(
      'campagne_in_corso', (SELECT count(*) FROM public.openwa_campagne WHERE stato = 'in_corso'),
      'in_coda', (SELECT count(*) FROM public.openwa_campagna_destinatari d
                    JOIN public.openwa_campagne c ON c.id = d.campagna_id
                   WHERE c.stato = 'in_corso' AND d.stato = 'da_inviare'),
      'inviati_oggi', (SELECT count(*) FROM public.openwa_messages
                        WHERE direction = 'outbound' AND created_at >= v_oggi),
      'risposte_oggi', (SELECT count(*) FROM public.openwa_messages
                         WHERE direction = 'inbound' AND created_at >= v_oggi),
      'risposte_totali', (SELECT count(*) FROM public.openwa_campagna_destinatari d
                            JOIN public.openwa_campagne c ON c.id = d.campagna_id
                           WHERE c.stato = 'in_corso' AND d.stato = 'risposto'),
      'numeri_connessi', (SELECT count(*) FROM public.openwa_numbers WHERE deleted_at IS NULL AND stato = 'connected'),
      'numeri_totali', (SELECT count(*) FROM public.openwa_numbers WHERE deleted_at IS NULL)),
    'email', jsonb_build_object(
      'sequenze_attive', (SELECT count(*) FROM public.outreach_sequences WHERE status = 'active'),
      'in_coda', (SELECT count(*) FROM public.outreach_send_queue WHERE status = 'queued'),
      'inviati_oggi', (SELECT count(*) FROM public.outreach_send_queue WHERE status = 'sent' AND sent_at >= v_oggi),
      'inviati_7g', (SELECT count(*) FROM public.outreach_send_queue WHERE status = 'sent' AND sent_at > now() - interval '7 days'),
      'risposte_7g', (SELECT count(*) FROM public.outreach_replies WHERE received_at > now() - interval '7 days'),
      'caselle_attive', (SELECT count(*) FROM public.outreach_sender_accounts
                          WHERE status <> 'paused' AND COALESCE(connection_status, 'ok') <> 'error'),
      'caselle_in_errore', (SELECT count(*) FROM public.outreach_sender_accounts WHERE connection_status = 'error'),
      'caselle_totali', (SELECT count(*) FROM public.outreach_sender_accounts)),
    'calcolato_il', now());
END;
$function$;

-- 3. Soldi, in una riga: incassato, regalato a listino, insoluti, tool a costo.
CREATE OR REPLACE FUNCTION public.admin_home_soldi()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH a AS (
      SELECT m.* FROM public.mv_company_metrics m
        JOIN public.companies c ON c.id = m.company_id
       WHERE c.deleted_at IS NULL AND COALESCE(c.is_platform_admin_company, false) = false
    ), ins AS (
      SELECT count(*) AS n, COALESCE(sum(importo_dovuto), 0) / 100.0 AS totale
        FROM public.v_insoluti WHERE NOT COALESCE(in_omaggio, false)
    )
    SELECT jsonb_build_object(
      'mrr_incassato', (SELECT COALESCE(sum(mrr_incassato), 0) FROM a),
      'aziende_paganti', (SELECT count(*) FROM a WHERE COALESCE(mrr_incassato, 0) > 0),
      'a_listino_non_fatturato', (SELECT COALESCE(sum(mrr_listino), 0) FROM a
                                    WHERE COALESCE(mrr_incassato, 0) = 0 AND status IN ('active', 'free')),
      'aziende_comped', (SELECT count(*) FROM a
                          WHERE COALESCE(mrr_incassato, 0) = 0 AND COALESCE(mrr_listino, 0) > 0
                            AND status IN ('active', 'free')),
      'insoluti_n', (SELECT n FROM ins),
      'insoluti_totale', (SELECT totale FROM ins),
      'tool_a_costo_mese', (SELECT COALESCE(sum(total_eur), 0)
                              FROM public.get_platform_consumption_summary(date_trunc('month', now()))),
      'calcolato_il', now())
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_home_aziende() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_home_outreach() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_home_soldi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_home_aziende() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_home_outreach() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_home_soldi() TO authenticated, service_role;

-- 4. Il briefing usa la stessa regola di Salute per i job (un giro fallito su
--    mille non è un guasto) e aggiunge insoluti aperti, numeri WhatsApp
--    scollegati, caselle di outreach in errore, ticket aperti.
CREATE OR REPLACE FUNCTION public.admin_briefing_operativo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_voci jsonb := '[]'::jsonb;
  v_n int;
  v_n2 int;
  v_txt text;
  v_eur numeric;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  -- 1. Job guasti: ultimo giro fallito, oppure fallisce spesso (3+ e >=5%).
  SELECT count(*), string_agg(g.job, ', ') INTO v_n, v_txt FROM (
    SELECT j.jobname AS job
      FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
     WHERE j.active AND d.start_time > now() - interval '48 hours'
     GROUP BY j.jobname
    HAVING (array_agg(d.status ORDER BY d.start_time DESC))[1] <> 'succeeded'
        OR (count(*) FILTER (WHERE d.status <> 'succeeded') >= 3
            AND count(*) FILTER (WHERE d.status <> 'succeeded') * 20 >= count(*))) g;
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 1, 'tipo', 'guasto',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' job è guasto' ELSE ' job sono guasti' END,
      'dettaglio', v_txt, 'dove', '/admin/salute');
  END IF;

  -- 2. Clienti paganti che stanno scivolando: è il soldo che se ne va.
  SELECT count(*), string_agg(c.name || ' (' || h.score || '/100)', ', ') INTO v_n, v_txt
    FROM public.companies c
    JOIN LATERAL (SELECT * FROM public.company_health_scores h
                   WHERE h.company_id = c.id ORDER BY calculated_at DESC LIMIT 1) h ON true
   WHERE c.deleted_at IS NULL AND c.stripe_subscription_status = 'active' AND h.score < 50;
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 1, 'tipo', 'cliente_a_rischio',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' cliente pagante a rischio' ELSE ' clienti paganti a rischio' END,
      'dettaglio', v_txt, 'dove', '/admin/cs');
  END IF;

  -- 3. Insoluti aperti: rosso se qualcuno sta per essere sospeso.
  SELECT count(*), COALESCE(sum(importo_dovuto), 0) / 100.0,
         count(*) FILTER (WHERE prossima_azione LIKE 'sospensione%'),
         string_agg(azienda || ' (' || giorni_scaduto || ' gg)', ', ')
    INTO v_n, v_eur, v_n2, v_txt
    FROM public.v_insoluti WHERE NOT COALESCE(in_omaggio, false);
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', CASE WHEN v_n2 > 0 THEN 1 ELSE 2 END, 'tipo', 'insoluto',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' insoluto aperto' ELSE ' insoluti aperti' END
                || ' · ' || to_char(v_eur, 'FM999G999G990D00') || ' €'
                || CASE WHEN v_n2 > 0 THEN ' · ' || v_n2 || ' in sospensione stanotte' ELSE '' END,
      'dettaglio', v_txt, 'dove', '/admin/insoluti');
  END IF;

  -- 4. Trial in scadenza entro 3 giorni: la finestra per convertire.
  SELECT count(*), string_agg(name || ' (' || to_char(trial_ends_at, 'DD/MM') || ')', ', ') INTO v_n, v_txt
    FROM public.companies
   WHERE status = 'trial' AND deleted_at IS NULL
     AND trial_ends_at BETWEEN now() AND now() + interval '3 days';
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 2, 'tipo', 'trial',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' trial scade' ELSE ' trial scadono' END || ' entro 3 giorni',
      'dettaglio', v_txt, 'dove', '/admin/aziende?status=trial');
  END IF;

  -- 5. Integrazioni ferme o degradate.
  SELECT count(DISTINCT integration_name), string_agg(DISTINCT integration_name, ', ') INTO v_n, v_txt
    FROM public.integration_health_log h
   WHERE h.checked_at > now() - interval '48 hours'
     AND COALESCE(h.status, '') NOT IN ('healthy', 'ok');
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 3, 'tipo', 'integrazione',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' integrazione non risponde bene' ELSE ' integrazioni non rispondono bene' END,
      'dettaglio', v_txt, 'dove', '/admin/connessioni');
  END IF;

  -- 6. Numeri WhatsApp scollegati: le campagne su quel numero sono ferme.
  SELECT count(*), string_agg(COALESCE(numero, session_id), ', ') INTO v_n, v_txt
    FROM public.openwa_numbers WHERE deleted_at IS NULL AND stato <> 'connected';
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 2, 'tipo', 'whatsapp',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' numero WhatsApp scollegato' ELSE ' numeri WhatsApp scollegati' END,
      'dettaglio', v_txt, 'dove', '/admin/marketing/whatsapp-locale/numeri');
  END IF;

  -- 7. Caselle di outreach in errore: le sequenze su quella casella non partono.
  SELECT count(*), string_agg(email, ', ') INTO v_n, v_txt
    FROM public.outreach_sender_accounts WHERE connection_status = 'error';
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 2, 'tipo', 'casella',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' casella email a freddo in errore' ELSE ' caselle email a freddo in errore' END,
      'dettaglio', v_txt, 'dove', '/admin/marketing/email');
  END IF;

  -- 8. Ticket di assistenza aperti.
  SELECT count(*) INTO v_n FROM public.support_conversations
   WHERE COALESCE(status, 'open') NOT IN ('resolved', 'closed');
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 3, 'tipo', 'ticket',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' ticket aperto' ELSE ' ticket aperti' END,
      'dettaglio', 'Conversazioni di assistenza senza risposta definitiva', 'dove', '/admin/ticket');
  END IF;

  -- 9. Aziende cancellate che stanno per essere purgate: ultima chiamata.
  SELECT count(*) INTO v_n FROM public.companies
   WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '23 days';
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 2, 'tipo', 'purge',
      'titolo', v_n || ' aziende verranno eliminate definitivamente entro una settimana',
      'dettaglio', 'Ripristinabili fino alla scadenza dei 30 giorni', 'dove', '/admin/aziende');
  END IF;

  -- 10. Aziende attive che non entrano da tre settimane.
  SELECT count(*), string_agg(c.name, ', ') INTO v_n, v_txt
    FROM public.companies c
    LEFT JOIN public.mv_company_metrics m ON m.company_id = c.id
   WHERE c.deleted_at IS NULL AND c.status = 'active'
     AND COALESCE(c.is_platform_admin_company, false) = false
     AND (m.ultimo_accesso IS NULL OR m.ultimo_accesso < now() - interval '21 days');
  IF v_n > 0 THEN
    v_voci := v_voci || jsonb_build_object(
      'urgenza', 3, 'tipo', 'inattive',
      'titolo', v_n || CASE WHEN v_n = 1 THEN ' azienda attiva non entra' ELSE ' aziende attive non entrano' END || ' da oltre 3 settimane',
      'dettaglio', v_txt, 'dove', '/admin/aziende');
  END IF;

  RETURN jsonb_build_object(
    'giorno', current_date,
    'voci', (SELECT COALESCE(jsonb_agg(v ORDER BY (v->>'urgenza')::int), '[]'::jsonb)
               FROM jsonb_array_elements(v_voci) v),
    'tutto_a_posto', jsonb_array_length(v_voci) = 0,
    'calcolato_il', now());
END;
$function$;
