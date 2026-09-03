-- ════════════════════════════════════════════════════════════════════════════
-- Il cliente fuori dalle tabelle interne
-- ════════════════════════════════════════════════════════════════════════════
--
-- Chiuse le quattro tabelle segnalate, ho passato in rassegna tutte quelle
-- raggiungibili da un account cliente reale, con la stessa sonda: utente
-- b175b990… (ruolo customer, azienda 778a2c76…), conta delle righe visibili
-- tabella per tabella.
--
-- Ne leggeva **175**. Fra queste:
--     profiles ...................... 200+   tutti i profili dell\'azienda
--     user_sessions ................. 200+   le sessioni di tutti
--     documenti_fiscali .............  41    le fatture emesse a ogni cliente
--     central_audit_log .............  62
--     listino_griglia ............... 200+   i prezzi
--     purchase_orders ...............  41    e i prezzi dei fornitori
--     internal_chat_messages ........ 200    la chat interna dell\'impresa
--     subappaltatori, hr_talent_*, ai_credits, sms_wallet, cg_*, …
--
-- La causa non è una policy sbagliata: è che l\'intero prodotto scrive le
-- policy come «stessa azienda = permesso», e `create-customer` mette nel
-- profilo del cliente il company_id DELL\'IMPRESA. Un account cliente è di
-- fatto un dipendente in sola lettura.
--     512 policy usano get_my_company_id()
--     348 usano get_user_company_id()
--     210 leggono profiles.company_id direttamente
--     e altre usano get_effective_company_id(), hr_talent_company_allowed(),
--     can_view_company_people(), internal_chat_company_allowed()… tutti
--     aiutanti che rispondono alla stessa domanda: «sei di questa azienda?».
--     Per un account cliente rispondono di sì.
--
-- ── Cosa faccio qui, e cosa lascio decidere ────────────────────────────────
-- Chiudo un elenco scelto a mano: tabelle su cui un cliente non ha niente da
-- leggere e su cui nessuna funzione del portale committente può
-- ragionevolmente appoggiarsi. La modifica può solo TOGLIERE accesso, e solo a
-- chi entra esclusivamente come cliente: nessuno staff è toccato.
--
-- Misurato dopo: il cliente passa da 175 tabelle a 33, e continua a vedere le
-- sue 3 commesse e il suo profilo. Lo staff resta a 246 tabelle con gli stessi
-- conteggi su tutte quelle chiave.
--
-- Quello che NON faccio da solo è cambiare get_my_company_id() perché
-- restituisca NULL ai clienti. Chiuderebbe 512 policy in un colpo, ed è
-- probabilmente la strada giusta — ma tocca anche cose che il portale
-- committente potrebbe volere davvero, e quella è una decisione di prodotto.
--
-- La procedura è ripetibile: salta le policy che ha già ristretto.

DO $$
DECLARE
  t text; p record; v_fatte int := 0;
  tabelle constant text[] := ARRAY[
    'documenti_fiscali','documenti_fiscali_storico','fiscal_reports',
    'dunning_policies','patrimonio_netto','cfo_weekly_reports',
    'pipeline_forecasts','customer_ltv_snapshots','cg_budget','cg_loans',
    'cg_cash_flow_manuali','cg_classificazione_voci',
    'piano_industriale_assumptions','listino_prezzi','listino_griglia',
    'listino_griglia_history','listino_categorie','listino_macrocategorie',
    'tariffe_aziendali','articoli_native','cost_categories',
    'purchase_orders','purchase_order_items','subappaltatori',
    'contratti_subappalto','subappaltatori_sicurezza','contratti_documents',
    'hr_talent_candidates','hr_talent_answers','hr_talent_reports',
    'hr_giornate','teams','tipi_documento_operaio','internal_chat_channels',
    'internal_chat_members','internal_chat_messages','whatsapp_messages',
    'email_outbox','mittenti_noti','email_accessi','email_reply_routes',
    'user_sessions','central_audit_log','integration_audit_log',
    'fea_audit_log','tool_execution_log','billing_sync_log',
    'ai_router_usage_log','ai_model_usage_log','ai_call_ledger',
    'sr_pdf_generation_log','fv_function_logs','silvio_decision_log',
    'ai_credits','ai_credit_transactions','sms_wallet',
    'sms_wallet_transazioni','sms_log','whatsapp_credits','email_credits',
    'email_credits_log','render_credits','render_credit_ledger',
    'company_auto_topup','company_governance_settings',
    'company_feature_overrides','company_features',
    'company_email_preferences','company_email_domains',
    'company_data_network_consent','integrations',
    'integration_webhook_events','integration_webhook_subscriptions',
    'social_accounts','gbp_connections','meta_ad_accounts','meta_assets',
    'meta_lead_forms','meta_insights_cache','meta_crm_conversion_events',
    'ai_brain_documents','ai_brain_facts','ai_persona_memory',
    'ai_prompt_templates','ai_model_config','ai_company_action_permissions',
    'ai_test_runs','ai_test_quota','silvio_alerts','silvio_playbook',
    'silvio_user_preferences','accountant_company_access','profiles',
    'scadenze','order_events','render_sessions','render_gallery',
    'render_bagno_sessions','render_pavimento_sessions',
    'render_facciata_sessions','render_stanza_sessions',
    'render_technical_sessions','render_tetto_sessions',
    'render_pergole_sessions','render_persiane_sessions',
    'render_piscine_sessions','render_catalog_assets','cespiti',
    'warehouses','warehouse_sections','warehouse_scan_events',
    'company_branding','company_sales_profile','company_onboarding',
    'company_onboarding_progress','company_modulo_preferenze',
    'marketing_opportunity_stage_history','computo_voci_estratte',
    'computo_uploads','preventivo_da_foto_runs','quote_items',
    'quote_pdf_materials','survey_templates','surveys','appointments',
    'contratti_manutenzione','impianti_cliente','tipi_impianto',
    'tipi_intervento','task_tags','eic_finanziarie',
    'eic_tabelle_finanziamento','eic_tabelle_finanziamento_righe',
    'simulazioni','anagrafiche_native','article_families',
    'article_family_axes','article_family_axis_values','sedi',
    'anagrafica_azienda','lifecycle_email_sends','lifecycle_notifications',
    'portal_courses','portal_course_modules','portal_course_assets',
    'portal_course_activity','portal_course_enrollments',
    'reputation_public_links','customer_messages','sr_progetti',
    'sr_progetti_media','sr_progetti_audit','sr_accessori_progetto',
    'sr_serramenti_progetto','rst_progetti','rst_listino_voci',
    'fv_progetti','fv_eventi','customer_onboarding','order_statuses',
    'bgn_template_pdf','clm_template_pdf','ele_template_pdf',
    'fv_template_pdf','idr_template_pdf','pav_template_pdf',
    'pis_template_pdf','rst_template_pdf','sr_template_pdf',
    'tet_template_pdf'
  ];
BEGIN
  FOREACH t IN ARRAY tabelle LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN
      SELECT pol.polname::text AS nome, pg_get_expr(pol.polqual, pol.polrelid) AS qual
        FROM pg_policy pol
       WHERE pol.polrelid = ('public.' || t)::regclass
         AND pol.polqual IS NOT NULL
         -- Solo le policy «stessa azienda»: quelle del commercialista, del
         -- super admin o a token restano come sono.
         AND (pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_my_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_user_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_effective_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%hr_talent_company_allowed%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%can_view_company_people%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%internal_chat_company_allowed%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%reputation_company_allowed%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%profiles%company_id%')
         AND pg_get_expr(pol.polqual, pol.polrelid) NOT LIKE '%utente_e_cliente_esterno%'
    LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) AND NOT public.utente_e_cliente_esterno())',
                     p.nome, t, p.qual);
      v_fatte := v_fatte + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'policy ristrette: %', v_fatte;
END $$;
