-- Lotto 01 di 27 — ruolo e azienda dell'utente calcolati una volta per query
-- nelle policy: 25 tabelle, da `marketing_contact_field_values` a `quote_items`, 40 policy.
--
-- has_role(), get_user_company_id() e get_my_company_id() sono SECURITY
-- DEFINER con un proprio search_path: il pianificatore non le puo' espandere
-- e, scritte nude dentro una policy, le chiama per OGNI RIGA letta. Ognuna
-- rifa' poi i suoi controlli (chiamante_anonimo, utente_bloccato, una lettura
-- di profiles o user_roles). Misurato come operatore del call center di
-- BeMade, prima: count(*) su marketing_contact_field_values 38 secondi per
-- vedere ZERO righe su 57.355; su listino_griglia 21 secondi. Oltre gli 8
-- secondi di PostgREST la richiesta nemmeno arriva.
--
-- Tra parentesi con SELECT diventano un InitPlan: una chiamata per query.
-- Il testo di ogni policy si riscrive QUI, dentro il database, partendo da
-- pg_get_expr con search_path vuoto (lo stesso testo di pg_dump): tre regex
-- avvolgono solo le chiamate con argomenti costanti per la riga — auth.uid(),
-- (SELECT auth.uid()), un ruolo scritto nel testo. L'unica chiamata che legge
-- una colonna, has_role(…, substring(scope from 6)::app_role), non combacia e
-- resta com'e'; una chiamata gia' avvolta non combacia (lookbehind) e non si
-- avvolge due volte. ALTER POLICY con i soli lati cambiati, mai DROP/CREATE:
-- nome, comando, ruoli, tipo e lato mancante (USING o WITH CHECK) restano.
--
-- Prima di cambiarla, ogni policy deve essere ancora quella del censimento
-- (impronta md5 del testo): se qualcuno l'ha modificata nel frattempo, il
-- lotto si ferma invece di sovrascriverla.
--
-- 25 tabelle per migrazione, in un unico blocco DO con lock_timeout di 3 s:
-- ALTER POLICY prende un ACCESS EXCLUSIVE, e un lotto che trova una tabella
-- occupata fallisce intero e si rifa' piu' piccolo. Le tabelle lette dalle
-- funzioni stesse (staff_permissions, multi_company_access,
-- active_impersonations, companies) stanno da sole nell'ultimo lotto.
-- storage.objects resta fuori: appartiene a supabase_storage_admin.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $lotto$
DECLARE
  v_search_path text := current_setting('search_path');
  r             record;
  v_using       text;
  v_check       text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  -- Testi tutti qualificati, come in pg_dump: non dipendono dal search_path.
  PERFORM set_config('search_path', '', true);

  FOR r IN
    SELECT x.tabella, x.nome, x.impronta, p.oid IS NOT NULL AS trovata,
           pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS u,
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS c
      FROM (VALUES
      ('marketing_contact_field_values', 'Company admins can manage contact field values', '913fdac50954630322b493f89cb7959c'),
      ('marketing_contact_field_values', 'Super admins can manage all contact field values', 'b5475afd508e1b67061e05492946d79d'),
      ('listino_griglia', 'lg_company', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('web_vitals_events', 'web_vitals_super_admin_read', 'b5475afd508e1b67061e05492946d79d'),
      ('email_inbox', 'email_inbox_select', '3e415c5a1568f17368b9d7fbf70a424e'),
      ('hr_timbrature', 'hr_timbrature_admin', 'f692569cddd074454cb406a8cf99de53'),
      ('ai_call_ledger', 'ai_call_ledger_lettura_public', '93901847315b1e6fb85b7df16f3d08c4'),
      ('ai_brain_documents', 'ai_brain_documents_lettura_public', '9181d868ac16a9e470a3748d7bb00c8b'),
      ('user_sessions', 'user_sessions_select_admin', 'a33f6573713adb94eca6fbc23f2be04f'),
      ('user_sessions', 'user_sessions_update_admin', '09e00ced22d65036035473745ad28b5d'),
      ('ai_router_usage_log', 'ai_router_usage_log_lettura_public', '93901847315b1e6fb85b7df16f3d08c4'),
      ('scadenze', 'scadenze_lettura_authenticated', 'be716027adc077987fb931628c0aeb39'),
      ('scadenze', 'scadenze_tenant_delete', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('scadenze', 'scadenze_tenant_insert', '48ff7abacdef110c2d810408c6a1933c'),
      ('scadenze', 'scadenze_tenant_update', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('tool_execution_log', 'tool_execution_log_company_read', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('hr_giornate', 'hr_giornate_own_company', '9ebdb123112ea2ead9e42a8bc050aa21'),
      ('listino_categorie', 'lcat_company', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('listino_fornitore_voci', 'lfv_company', '953482a70ff6d309e77a4f30136dce83'),
      ('attribution_sessions', 'attribution_sessions_tenant_insert', '0a74647ecd749996b7e21beb8076b891'),
      ('attribution_sessions', 'attribution_sessions_tenant_select', 'b36a4e954a49330b5c077989c0d3984b'),
      ('listino_griglia_history', 'listino_history_company', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('automation_nodes', 'Company admins can manage their automation nodes', '89b5ca216b29bd621b84cfd19bdd854f'),
      ('automation_nodes', 'Super admins can manage all automation nodes', 'b5475afd508e1b67061e05492946d79d'),
      ('automation_nodes', 'automation_nodes_lettura_public', '081434fa1ae98c93bc9acb972603ef93'),
      ('tariffe_aziendali', 'ta_company', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('automation_connections', 'Company admins can manage their automation connections', '89b5ca216b29bd621b84cfd19bdd854f'),
      ('automation_connections', 'Super admins can manage all automation connections', 'b5475afd508e1b67061e05492946d79d'),
      ('automation_connections', 'automation_connections_lettura_public', '081434fa1ae98c93bc9acb972603ef93'),
      ('fatture_ricevute', 'fatture_ricevute_company_isolation', '953482a70ff6d309e77a4f30136dce83'),
      ('company_feature_overrides', 'company_read_own_feature_overrides', '180351125924b96c0e07371f14d8bce3'),
      ('suppliers', 'Company admins can manage their suppliers', '89b5ca216b29bd621b84cfd19bdd854f'),
      ('suppliers', 'Staff can view suppliers if permitted', '4536c2450901aa179af8e33b040b8ef7'),
      ('suppliers', 'Super admins can manage all suppliers', 'b5475afd508e1b67061e05492946d79d'),
      ('bundle_voci', 'bv_bundle', 'f460f0613fb7c8d1d77cacfefcf1c183'),
      ('appointments', 'appointments_lettura_authenticated', '2357476efea9adbcb4bfd6af8ec39c63'),
      ('quote_items', 'qi_del', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('quote_items', 'qi_ins', '48ff7abacdef110c2d810408c6a1933c'),
      ('quote_items', 'qi_sel', 'cb0c7cfff96bb4d1960aba33d3584b72'),
      ('quote_items', 'qi_upd', 'cb0c7cfff96bb4d1960aba33d3584b72')
      ) AS x(tabella, nome, impronta)
      LEFT JOIN pg_catalog.pg_policy p
        ON p.polrelid = pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(x.tabella))
       AND p.polname = x.nome
  LOOP
    IF NOT r.trovata THEN
      RAISE EXCEPTION 'Policy "%" su % non trovata: lotto fermo', r.nome, r.tabella;
    END IF;
    IF pg_catalog.md5(coalesce(r.u, '') || '|' || coalesce(r.c, '')) <> r.impronta THEN
      RAISE EXCEPTION 'Policy "%" su % cambiata dopo il censimento: lotto fermo', r.nome, r.tabella;
    END IF;
    v_using := pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(r.u,
      '(?<!\( SELECT )(public\.has_role\((?:\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\)), ''(?:[^'']|'''')*''::public\.app_role\))', '(SELECT \1)', 'g'),
      '(?<!\( SELECT )(public\.get_user_company_id\((?:\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))\))', '(SELECT \1)', 'g'),
      '(?<!\( SELECT )(public\.get_my_company_id\(\))', '(SELECT \1)', 'g');
    v_check := pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(r.c,
      '(?<!\( SELECT )(public\.has_role\((?:\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\)), ''(?:[^'']|'''')*''::public\.app_role\))', '(SELECT \1)', 'g'),
      '(?<!\( SELECT )(public\.get_user_company_id\((?:\( SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))\))', '(SELECT \1)', 'g'),
      '(?<!\( SELECT )(public\.get_my_company_id\(\))', '(SELECT \1)', 'g');
    IF v_using IS DISTINCT FROM r.u OR v_check IS DISTINCT FROM r.c THEN
      EXECUTE pg_catalog.format('ALTER POLICY %I ON public.%I', r.nome, r.tabella)
           || CASE WHEN v_using IS DISTINCT FROM r.u THEN ' USING (' || v_using || ')' ELSE '' END
           || CASE WHEN v_check IS DISTINCT FROM r.c THEN ' WITH CHECK (' || v_check || ')' ELSE '' END;
    END IF;
  END LOOP;

  PERFORM set_config('search_path', v_search_path, true);
END $lotto$;
