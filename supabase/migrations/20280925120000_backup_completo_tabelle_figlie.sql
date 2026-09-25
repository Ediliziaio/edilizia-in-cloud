-- Il backup salva tutto quello che la purga cancella (25/09/2026).
--
-- Fino a oggi il backup prendeva le tabelle con una colonna company_id, meno
-- quelle col nome da registro (…_log, …_logs, ai_…, silvio_…). Due buchi, misurati
-- purgando la Demo 2 in una transazione annullata: la purga ha cancellato
-- 14.728 righe, e 3.283 non erano nel backup.
--
--  1. Le tabelle figlie non hanno company_id, quindi non c'erano: righe delle
--     fatture, voci, rate, allegati e storico fasi delle commesse, campi e liste
--     dei contatti, destinatari delle campagne WhatsApp, prospect dell'outreach.
--     La purga le cancella a cascata insieme alla madre. Solo la Demo 2 avrebbe
--     perso 184 righe di fattura, 175 voci e 76 rate; l'area super admin 313.000
--     iscrizioni alle liste.
--  2. Il filtro sul nome buttava via dati veri: saldo e movimenti dei crediti AI,
--     documenti della base di conoscenza, registro chiamate e SMS, firme
--     elettroniche (fea_audit_log), consensi GDPR, chat interna.
--
-- Da qui il contenuto lo decide il grafo della purga: entra ogni tabella con
-- company_id, ogni tabella che punta a companies con un'altra colonna, e ogni
-- tabella che la purga svuota a cascata, presa attraverso la sua madre. Resta
-- fuori solo ciò che è scritto in admin_backup_esclusioni(), una tabella per
-- riga col motivo. Una tabella nuova entra da sola: dimenticarsene costa un
-- backup più grande, non dati persi. admin_backup_tabelle_scoperte() dice se
-- qualcosa che la purga cancella non è né nel backup né fra le esclusioni.
--
-- Le funzioni di esportazione (admin_esporta_azienda, admin_esporta_blocco,
-- admin_tabelle_con_dati) non cercano più `company_id = $1`: usano il filtro
-- del catalogo. Il job del sabato non cambia.

-- ---------------------------------------------------------------------------
-- 1. Cosa resta fuori, e perché
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_backup_esclusioni()
RETURNS TABLE (tabella text, motivo text)
LANGUAGE sql STABLE
SET search_path TO 'public' AS $function$
  SELECT v.tabella, v.motivo FROM (VALUES
    -- Registri di controllo: chi ha fatto cosa. Restano finché l'azienda esiste;
    -- per rimetterla in piedi non servono. (FEA e GDPR invece entrano: sono prove.)
    ('accountant_audit_log',              'registro di controllo'),
    ('action_proposals_audit_log',        'registro di controllo'),
    ('ad_audit_log',                      'registro di controllo'),
    ('ai_agent_audit_log',                'registro di controllo'),
    ('ai_rbac_violations',                'registro di controllo'),
    ('central_audit_log',                 'registro di controllo'),
    ('company_activity_log',              'registro di controllo'),
    ('company_flag_audit_log',            'registro di controllo'),
    ('integration_audit_log',             'registro di controllo'),
    ('referral_fraud_log',                'registro di controllo'),
    ('silvio_audit',                      'registro di controllo'),
    ('superadmin_override_log',           'registro di controllo'),
    ('survey_activity_log',               'registro di controllo'),
    ('user_audit_log',                    'registro di controllo'),
    ('whitelabel_audit_log',              'registro di controllo'),
    -- Registri tecnici: esecuzioni, sincronizzazioni, invii già fatti.
    ('ai_workflow_runs',                  'registro tecnico'),
    ('ai_workflow_steps_log',             'registro tecnico'),
    ('anagrafica_reconciliation_log',     'registro tecnico'),
    ('automation_execution_log',          'registro tecnico'),
    ('automation_log',                    'registro tecnico'),
    ('bank_sync_logs',                    'registro tecnico'),
    ('billing_sync_log',                  'registro tecnico'),
    ('campaign_retry_log',                'registro tecnico'),
    ('cg_exports_log',                    'registro tecnico'),
    ('digest_log',                        'registro tecnico'),
    ('email_delivery_log',                'registro tecnico'),
    ('fv_function_logs',                  'registro tecnico'),
    ('fv_pdf_generation_log',             'registro tecnico'),
    ('integration_health_log',            'registro tecnico'),
    ('internal_automation_execution_log', 'registro tecnico'),
    ('lifecycle_events_log',              'registro tecnico'),
    ('silvio_decision_log',               'registro tecnico'),
    ('silvio_esecuzioni',                 'registro tecnico'),
    ('silvio_kb_citation_log',            'registro tecnico'),
    ('silvio_tool_steps',                 'registro tecnico'),
    ('silvio_trigger_log',                'registro tecnico'),
    ('sms_automation_logs',               'registro tecnico'),
    ('sr_pdf_generation_log',             'registro tecnico'),
    ('stripe_events_log',                 'registro tecnico'),
    ('task_automation_log',               'registro tecnico'),
    ('tool_execution_log',                'registro tecnico'),
    ('wa_notifiche_log',                  'registro tecnico'),
    ('wa_operational_reminder_log',       'registro tecnico'),
    ('webhook_deliveries',                'registro tecnico'),
    -- Consumi e statistiche: misure, non dati dell'azienda.
    ('ai_call_ledger',                    'consumi e statistiche'),
    ('ai_council_usage_log',              'consumi e statistiche'),
    ('ai_model_usage_log',                'consumi e statistiche'),
    ('ai_router_usage_log',               'consumi e statistiche'),
    ('ai_usage_logs',                     'consumi e statistiche'),
    ('api_usage_log',                     'consumi e statistiche'),
    ('attribution_pageviews',             'consumi e statistiche'),
    ('attribution_sessions',              'consumi e statistiche'),
    ('battito_esterno',                   'consumi e statistiche'),
    ('company_qr_scan_logs',              'consumi e statistiche'),
    ('siti_metriche_giornaliere',         'consumi e statistiche'),
    ('siti_pagine_giornaliere',           'consumi e statistiche'),
    ('system_health_metrics',             'consumi e statistiche'),
    ('web_vitals_events',                 'consumi e statistiche'),
    -- Calcolati o rigenerabili: si rifanno da soli dai dati.
    ('ai_prompt_feedback_aggregates',     'calcolato: si rifà dai dati'),
    ('cfo_weekly_reports',                'calcolato: si rifà dai dati'),
    ('company_health_scores',             'calcolato: si rifà dai dati'),
    ('meta_moduli_conteggi',              'calcolato: si rifà dai dati'),
    ('pipeline_forecasts',                'calcolato: si rifà dai dati'),
    ('sa_company_problems',               'calcolato: si rifà dai dati'),
    ('silvio_morning_briefings',          'calcolato: si rifà dai dati'),
    ('ai_response_cache',                 'copia temporanea (cache)'),
    ('distance_matrix_cache',             'copia temporanea (cache)'),
    ('gbp_locations_cache',               'copia temporanea (cache)'),
    ('google_ads_customers_cache',        'copia temporanea (cache)'),
    ('outlook_calendars_cache',           'copia temporanea (cache)'),
    -- Avvisi e code: lavoro in transito, non storia.
    ('ai_usage_alerts',                   'avviso'),
    ('ai_usage_alerts_log',               'avviso'),
    ('notifications',                     'avviso'),
    ('silvio_alerts',                     'avviso'),
    ('automation_trigger_events',         'coda di lavoro'),
    ('silvio_generation_jobs',            'coda di lavoro'),
    ('wa_notifiche_cooldown',             'coda di lavoro'),
    -- Accessi: sessioni e codici valgono per il momento in cui sono nati.
    ('active_company_selection',          'sessione o accesso'),
    ('active_impersonations',             'sessione o accesso'),
    ('email_otp_codes',                   'sessione o accesso'),
    ('login_attempts',                    'sessione o accesso'),
    ('push_tokens',                       'sessione o accesso'),
    ('user_sessions',                     'sessione o accesso'),
    -- Credenziali e collegamenti: dopo un ripristino si ricollegano, e un
    -- segreto in un file di backup è un segreto in più da proteggere.
    ('google_calendar_watches',           'collegamento: si rifà'),
    ('integration_credentials',           'credenziale: si ricollega'),
    -- Prove: collaudi di caselle, agenti e modelli.
    ('ai_agent_tests',                    'prova'),
    ('ai_test_runs',                      'prova'),
    ('outreach_prove_caselle',            'prova'),
    ('backup_prove_ripristino',           'prova')
  ) AS v(tabella, motivo)
  UNION ALL
  -- Copie di servizio fatte a mano durante le bonifiche.
  SELECT c.relname::text, 'copia di servizio'
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND (c.relname LIKE '\_%' ESCAPE '\' OR c.relname LIKE 'zz\_%' ESCAPE '\'
          OR c.relname LIKE '%\_backup%' ESCAPE '\' OR c.relname LIKE '%\_archive%' ESCAPE '\');
$function$;

REVOKE ALL ON FUNCTION public.admin_backup_esclusioni() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backup_esclusioni() TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Il catalogo: ogni tabella da salvare, e come si trovano le righe di
--    un'azienda (filtro su alias t, con $1 = id dell'azienda)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_catalogo_backup()
RETURNS TABLE (tabella text, filtro text, via text, righe_stimate bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_esclusi text[];
  v_mappa   jsonb;
  v_nuove   jsonb;
BEGIN
  SELECT coalesce(array_agg(e.tabella), '{}') INTO v_esclusi FROM public.admin_backup_esclusioni() e;

  -- Chi ha company_id: le righe dell'azienda sono le sue.
  SELECT coalesce(jsonb_object_agg(c.relname::text,
           jsonb_build_object('filtro', 't.company_id = $1', 'via', 'company_id')), '{}'::jsonb)
    INTO v_mappa
    FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND c.relname::text <> ALL (v_esclusi)
     AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = c.oid AND a.attname = 'company_id' AND NOT a.attisdropped);

  -- Chi punta a companies con un'altra colonna (tenant_id, produttore_id,
  -- target_company_id…) e sparisce con lei.
  SELECT v_mappa || coalesce(jsonb_object_agg(x.tabella,
           jsonb_build_object('filtro', x.filtro, 'via', x.via)), '{}'::jsonb)
    INTO v_mappa
    FROM (
      SELECT c.relname::text AS tabella,
             string_agg(format('t.%I = $1', a.attname), ' OR ' ORDER BY a.attname) AS filtro,
             string_agg(a.attname::text, ', ' ORDER BY a.attname) AS via
        FROM pg_constraint k
        JOIN pg_class c     ON c.oid = k.conrelid
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.contype = 'f' AND k.confdeltype = 'c' AND cardinality(k.conkey) = 1
         AND k.confrelid = 'public.companies'::regclass
         AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
         AND c.oid <> 'public.companies'::regclass
         AND NOT v_mappa ? c.relname::text
         AND c.relname::text <> ALL (v_esclusi)
       GROUP BY c.relname
    ) x;

  -- Le figlie: la purga le cancella a cascata con la madre, quindi le loro righe
  -- sono quelle che puntano alle righe della madre. Un passo per livello, fino a
  -- quattro; una figlia con più madri le prende tutte (OR). Si segue solo una
  -- madre già nel catalogo: la figlia di una tabella esclusa resta fuori con lei.
  FOR i IN 1..4 LOOP
    SELECT coalesce(jsonb_object_agg(x.tabella,
             jsonb_build_object('filtro', x.filtro, 'via', x.via)), '{}'::jsonb)
      INTO v_nuove
      FROM (
        SELECT c.relname::text AS tabella,
               string_agg(format('t.%I IN (SELECT t.%I FROM public.%I t WHERE %s)',
                                 a.attname, am.attname, cm.relname,
                                 v_mappa -> cm.relname::text ->> 'filtro'),
                          ' OR ' ORDER BY a.attname, cm.relname) AS filtro,
               string_agg(a.attname::text || ' → ' || cm.relname::text, ', '
                          ORDER BY a.attname, cm.relname) AS via
          FROM pg_constraint k
          JOIN pg_class c      ON c.oid  = k.conrelid
          JOIN pg_class cm     ON cm.oid = k.confrelid
          JOIN pg_attribute a  ON a.attrelid  = k.conrelid  AND a.attnum  = k.conkey[1]
          JOIN pg_attribute am ON am.attrelid = k.confrelid AND am.attnum = k.confkey[1]
         WHERE k.contype = 'f' AND k.confdeltype = 'c' AND cardinality(k.conkey) = 1
           AND k.conrelid <> k.confrelid
           AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
           AND cm.relnamespace = 'public'::regnamespace
           AND v_mappa ? cm.relname::text
           AND NOT v_mappa ? c.relname::text
           AND c.relname::text <> ALL (v_esclusi)
         GROUP BY c.relname
      ) x;
    EXIT WHEN v_nuove = '{}'::jsonb;
    v_mappa := v_mappa || v_nuove;
  END LOOP;

  RETURN QUERY
    SELECT m.key, m.value ->> 'filtro', m.value ->> 'via', GREATEST(c.reltuples::bigint, 0)
      FROM jsonb_each(v_mappa) m
      JOIN pg_class c ON c.relname = m.key AND c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     ORDER BY m.key;
END $function$;

REVOKE ALL ON FUNCTION public.admin_catalogo_backup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_catalogo_backup() TO service_role;

-- Il nome resta quello di prima: company-backup e la prova lo chiamano già.
CREATE OR REPLACE FUNCTION public.admin_tabelle_da_esportare()
RETURNS TABLE (tabella text, righe_stimate bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
  SELECT k.tabella, k.righe_stimate FROM public.admin_catalogo_backup() k ORDER BY k.tabella;
$function$;

REVOKE ALL ON FUNCTION public.admin_tabelle_da_esportare() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tabelle_da_esportare() TO service_role;

-- Ciò che la purga cancella e che non sta né nel backup né fra le esclusioni.
-- Vuoto vuol dire backup completo.
CREATE OR REPLACE FUNCTION public.admin_backup_tabelle_scoperte()
RETURNS TABLE (tabella text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
  WITH RECURSIVE chiusura(oid) AS (
    SELECT 'public.companies'::regclass::oid
    UNION
    SELECT k.conrelid FROM pg_constraint k JOIN chiusura ch ON k.confrelid = ch.oid
     WHERE k.contype = 'f' AND k.confdeltype = 'c'
  )
  SELECT c.relname::text
    FROM chiusura ch JOIN pg_class c ON c.oid = ch.oid
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
     AND c.oid <> 'public.companies'::regclass
     AND c.relname::text NOT IN (SELECT k.tabella FROM public.admin_catalogo_backup() k)
     AND c.relname::text NOT IN (SELECT e.tabella FROM public.admin_backup_esclusioni() e)
   ORDER BY 1;
$function$;

REVOKE ALL ON FUNCTION public.admin_backup_tabelle_scoperte() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backup_tabelle_scoperte() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Le esportazioni usano il filtro del catalogo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_esporta_azienda(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_azienda  jsonb;
  v_dump     jsonb;
  v_tabella  text;
  v_filtro   text;
  v_righe    jsonb;
  v_n        int;
  v_totale   int := 0;
  v_incluse  int := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND current_user <> 'service_role'
     AND NOT (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role') THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(c) INTO v_azienda FROM public.companies c WHERE c.id = p_company_id;
  IF v_azienda IS NULL THEN
    RAISE EXCEPTION 'Azienda % non trovata', p_company_id;
  END IF;
  IF COALESCE((v_azienda ->> 'is_platform_admin_company')::boolean, false) THEN
    RAISE EXCEPTION 'L''azienda di piattaforma non si esporta con questo strumento';
  END IF;

  v_dump := jsonb_build_object('esportato_il', now(), 'azienda', v_azienda, 'elenco_da_catalogo', true);

  FOR v_tabella, v_filtro IN SELECT k.tabella, k.filtro FROM public.admin_catalogo_backup() k ORDER BY k.tabella LOOP
    BEGIN
      EXECUTE format('SELECT jsonb_agg(to_jsonb(t)), count(*) FROM public.%I t WHERE %s', v_tabella, v_filtro)
         INTO v_righe, v_n USING p_company_id;
      IF v_n > 0 THEN
        v_dump := v_dump || jsonb_build_object(v_tabella, v_righe);
        v_totale := v_totale + v_n;
        v_incluse := v_incluse + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Una tabella che non si legge (tipo diverso, permessi) non ferma il
      -- backup: si dichiara e si va avanti.
      v_dump := v_dump || jsonb_build_object(v_tabella || '__errore', left(SQLERRM, 200));
    END;
  END LOOP;

  RETURN v_dump || jsonb_build_object('tabelle_incluse', v_incluse, 'righe_totali', v_totale);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_esporta_blocco(
  p_company_id uuid, p_tabella text, p_dopo text DEFAULT NULL::text, p_limite integer DEFAULT 5000
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
declare
  v_filtro  text;
  v_tipo_id text;
  v_righe   jsonb;
  v_n       int;
  v_ultimo  text;
begin
  if not public.is_super_admin(auth.uid()) and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Riservato al super admin' using errcode = '42501';
  end if;
  select k.filtro into v_filtro from public.admin_catalogo_backup() k where k.tabella = p_tabella;
  if v_filtro is null then
    raise exception 'La tabella % non è nel catalogo del backup', p_tabella;
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 20000 then
    raise exception 'Limite % fuori misura (1-20000)', p_limite;
  end if;

  select format_type(a.atttypid, a.atttypmod) into v_tipo_id
    from pg_attribute a
   where a.attrelid = ('public.' || quote_ident(p_tabella))::regclass
     and a.attname = 'id' and not a.attisdropped;

  if v_tipo_id is null then
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb), count(*) from public.%I t where %s', p_tabella, v_filtro)
      into v_righe, v_n using p_company_id;
    return jsonb_build_object('righe', v_righe, 'n', v_n, 'ultimo', null, 'finito', true);
  end if;

  execute format($f$
    with blocco as (
      select * from public.%1$I t
      where (%3$s) and ($2::text is null or t.id > $2::%2$s)
      order by t.id
      limit $3
    )
    select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb),
           count(*),
           (select b2.id::text from blocco b2 order by b2.id desc limit 1)
      from blocco b
  $f$, p_tabella, v_tipo_id, v_filtro)
    into v_righe, v_n, v_ultimo using p_company_id, p_dopo, p_limite;

  return jsonb_build_object('righe', v_righe, 'n', v_n, 'ultimo', v_ultimo, 'finito', v_n < p_limite);
end
$function$;

CREATE OR REPLACE FUNCTION public.admin_tabelle_con_dati(p_company_id uuid)
RETURNS TABLE (tabella text, righe bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
declare
  v_tabella text;
  v_filtro  text;
  v_n       bigint;
begin
  if not public.is_super_admin(auth.uid()) and current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Riservato al super admin' using errcode = '42501';
  end if;

  for v_tabella, v_filtro in select k.tabella, k.filtro from public.admin_catalogo_backup() k order by k.tabella loop
    execute format('select count(*) from public.%I t where %s', v_tabella, v_filtro) into v_n using p_company_id;
    if v_n > 0 then
      tabella := v_tabella;
      righe := v_n;
      return next;
    end if;
  end loop;
end
$function$;
