-- Lotto 02 di 27 — ruolo e azienda dell'utente calcolati una volta per query
-- nelle policy: 25 tabelle, da `warehouse_movements` a `order_work_phases`, 51 policy.
-- Il perche' e il come sono in testa al lotto 01 (20280914200001).

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
      ('warehouse_movements', 'warehouse_movements_scoped_access', '4d901c4b2ce658ebda44bafc5d03e48b'),
      ('bundle_prodotti', 'bp_company', 'ce2f147e7c83be878b59b9314fc13eba'),
      ('warehouse_stock', 'warehouse_stock_scoped_access', 'cf946735740acc01117962928dc92d13'),
      ('cg_classificazione_voci', 'cg_class_delete', 'c5fb4d9fb7b68491ca9eddd626862726'),
      ('cg_classificazione_voci', 'cg_class_insert', '48ff7abacdef110c2d810408c6a1933c'),
      ('cg_classificazione_voci', 'cg_class_select', 'c5fb4d9fb7b68491ca9eddd626862726'),
      ('cg_classificazione_voci', 'cg_class_update', '31515b857febda622204ba587001e883'),
      ('quote_templates', 'company_admin_manage_templates', '8b45424e8527e43fabec6c9d45bd24ff'),
      ('quote_templates', 'company_members_read_templates', 'b36a4e954a49330b5c077989c0d3984b'),
      ('quote_templates', 'super_admin_manage_all_templates', '2c7531adb56c2205a9cb40c71d193c05'),
      ('render_gallery', 'sa_render_gallery', '2c7531adb56c2205a9cb40c71d193c05'),
      ('render_sessions', 'sa_render_sessions', '2c7531adb56c2205a9cb40c71d193c05'),
      ('purchase_orders', 'po_super_admin', 'b5475afd508e1b67061e05492946d79d'),
      ('purchase_orders', 'po_tenant_delete', 'c5fb4d9fb7b68491ca9eddd626862726'),
      ('purchase_orders', 'po_tenant_insert', '48ff7abacdef110c2d810408c6a1933c'),
      ('purchase_orders', 'po_tenant_update', 'c5fb4d9fb7b68491ca9eddd626862726'),
      ('purchase_orders', 'purchase_orders_lettura_authenticated', '29008e447df9cb42ed833570af1b5194'),
      ('listino_macrocategorie', 'macrocat_delete', 'e41f593504c74fdd01abf5c896e3ce2f'),
      ('listino_macrocategorie', 'macrocat_insert', 'dff4703d30b567280d7b59c1a2c18a66'),
      ('listino_macrocategorie', 'macrocat_select', '0b22261bbed841df49820c8cec931fd7'),
      ('listino_macrocategorie', 'macrocat_super_admin', 'b5475afd508e1b67061e05492946d79d'),
      ('listino_macrocategorie', 'macrocat_update', 'e41f593504c74fdd01abf5c896e3ce2f'),
      ('portal_course_assets', 'portal_assets_company_access', '2415c4985d4f23e1cc29fe696a4c88c4'),
      ('stripe_events_log', 'Super admins can read stripe events', 'b5475afd508e1b67061e05492946d79d'),
      ('bank_reconciliations', 'Tenant isolation for bank_reconciliations', '953482a70ff6d309e77a4f30136dce83'),
      ('order_statuses', 'Company admins can manage their order statuses', '9c1544ec96aaa4273f9ffccd8e856b77'),
      ('order_statuses', 'Customers can view their company order statuses', 'fac347729b9ef63cb9d2cddfe78b9f96'),
      ('order_statuses', 'Staff can view their company order statuses', 'a754d7e9a9725188f24c1755a7c4010c'),
      ('order_statuses', 'Super admins can manage all order statuses', 'b5475afd508e1b67061e05492946d79d'),
      ('platform_settings', 'Super admins can manage platform settings', '2c7531adb56c2205a9cb40c71d193c05'),
      ('subappaltatori_documenti', 'sub_docs_admin', '7c59e4108b7e4f3046d63408e44f1bba'),
      ('subappaltatori_documenti', 'sub_docs_company_read', 'ce2f147e7c83be878b59b9314fc13eba'),
      ('subappaltatori_documenti', 'sub_docs_super_admin', 'b5475afd508e1b67061e05492946d79d'),
      ('login_attempts', 'login_attempts_select_admin', '94862eebd2966176bb5601d7e490440a'),
      ('ai_router_config', 'ai_router_config_admin_modify', '2c7531adb56c2205a9cb40c71d193c05'),
      ('ai_router_config', 'ai_router_config_admin_select', 'b5475afd508e1b67061e05492946d79d'),
      ('anagrafiche_native', 'company_isolation', 'c5fb4d9fb7b68491ca9eddd626862726'),
      ('platform_feature_flags', 'Super admins manage feature flags', '2c7531adb56c2205a9cb40c71d193c05'),
      ('ai_action_proposals', 'ai_action_proposals_lettura_public', 'd1011005ab566fe7e2c176e521c85f32'),
      ('salespeople', 'Company admins can manage their salespeople', '89b5ca216b29bd621b84cfd19bdd854f'),
      ('salespeople', 'Super admins can manage all salespeople', 'b5475afd508e1b67061e05492946d79d'),
      ('salespeople', 'salespeople_lettura_public', '4d9a3e061fb34845953dd2e5cbd3ddca'),
      ('ai_persona_messages', 'ai_persona_messages_lettura_public', '77efdafbf866268bf1ec732de634cd5f'),
      ('hr_profili', 'hr_profili_admin', '90555129e8e13eecbf2cdf45f23bff8c'),
      ('hr_profili', 'hr_profili_super_admin', '2c7531adb56c2205a9cb40c71d193c05'),
      ('article_family_documents', 'afd_cud', 'c82b60f2435bf43fcb681d0b41eae6a6'),
      ('article_family_documents', 'afd_select', 'ce3d9832cb0f62dee42869f2823f344b'),
      ('order_work_phases', 'Company admins manage their order work phases', '057f0bfbdc97343051e6441fd1896323'),
      ('order_work_phases', 'Staff can manage order work phases if permitted', '4eacba09211113a6c088f56cb5db9a37'),
      ('order_work_phases', 'Super admins manage all order work phases', 'b9e551a4a0e69562647f99f05673c92f'),
      ('order_work_phases', 'order_work_phases_lettura_public', '72d5b80364136ecae0648003e62f0969')
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
