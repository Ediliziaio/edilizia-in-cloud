-- ════════════════════════════════════════════════════════════════════════════
-- Le ultime tabelle interne ancora leggibili da un cliente
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dopo i due giri precedenti (175 → 33) ho rimisurato e ne sono rimaste 36 —
-- qualcuna in più perché il primo passaggio era andato in timeout su alcune
-- tabelle. Riguardandole una per una:
--
--   LEGITTIME, restano aperte:
--     orders e profiles .............. le sue commesse e il suo profilo
--     ai_brain_documents ............. policy `scope = 'universal'`, aperta a
--                                      ogni utente autenticato di proposito
--     company_branding ............... ha `is_active = true`, scritta apposta
--                                      per essere pubblica: al portale
--                                      committente serve il logo dell'impresa
--     silvio_user_preferences, gdpr_consents, email_outbox
--                                      ... `user_id = auth.uid()`: le sue righe
--
--   NON LEGITTIME, chiuse qui: sessioni di render con le foto dei progetti,
--   account pubblicitari e metriche, registri di integrazione e GDPR, chat
--   interna, listino articoli, storico delle modifiche ai documenti fiscali,
--   portafogli di crediti, posta in uscita aziendale.
--
-- ── Un mio errore di filtro, corretto qui ──────────────────────────────────
-- Nei giri precedenti riconoscevo le policy «stessa azienda» anche con
--     LIKE '%profiles%company_id%'
-- che pretende `profiles` PRIMA di `company_id`. Ma la forma più diffusa è
--     company_id IN ( SELECT p.company_id FROM profiles p WHERE p.id = auth.uid() )
-- dove l'ordine è l'opposto: il pattern non l'ha mai riconosciuta. Per questo
-- meta_ad_accounts, meta_insights_cache e altre erano sopravvissute a due giri.
-- Ora i due pezzi si cercano separatamente, che è quello che intendevo.
--
-- Aggiunti anche due aiutanti «stessa azienda» che non conoscevo:
-- `can_access_render_company()` e `internal_chat_*_allowed()`.
--
-- Misurato dopo: il cliente passa da 36 tabelle a 12, lo staff resta a 248.
DO $$
DECLARE
  t text; p record; v_fatte int := 0;
  tabelle constant text[] := ARRAY[
    'render_sessions','render_gallery','render_bagno_sessions','render_pavimento_sessions',
    'render_facciata_sessions','render_stanza_sessions','render_persiane_sessions',
    'render_technical_sessions','render_pergole_sessions','render_tetto_sessions',
    'render_piscine_sessions','render_catalog_assets',
    'meta_ad_accounts','meta_insights_cache','meta_lead_forms','meta_assets',
    'integration_audit_log','integrations','gdpr_audit_log',
    'internal_chat_members','internal_chat_messages','internal_chat_channels',
    'email_outbox','email_accessi','company_email_domains','company_email_preferences',
    'articoli_native','documenti_fiscali_storico',
    'ai_model_usage_log','ai_test_quota','ai_call_ledger','ai_router_usage_log',
    'whatsapp_credits','company_governance_settings','user_notification_preferences'
  ];
BEGIN
  FOREACH t IN ARRAY tabelle LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN
      SELECT pol.polname::text AS nome, pg_get_expr(pol.polqual, pol.polrelid) AS qual
        FROM pg_policy pol
       WHERE pol.polrelid = ('public.' || t)::regclass
         AND pol.polqual IS NOT NULL
         AND (
              pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_my_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_user_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%get_effective_company_id%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%user_can_access_company%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%can_access_render_company%'
           OR pg_get_expr(pol.polqual, pol.polrelid) LIKE '%internal_chat_%_allowed%'
           -- I due pezzi separati: l'ordine in cui compaiono non conta.
           OR (pg_get_expr(pol.polqual, pol.polrelid) LIKE '%FROM profiles%'
               AND pg_get_expr(pol.polqual, pol.polrelid) LIKE '%company_id%')
         )
         AND pg_get_expr(pol.polqual, pol.polrelid) NOT LIKE '%utente_e_cliente_esterno%'
         -- «la mia riga» resta una condizione giusta anche per un cliente.
         AND pg_get_expr(pol.polqual, pol.polrelid) NOT LIKE '%user_id = ( SELECT auth.uid%'
    LOOP
      EXECUTE format('ALTER POLICY %I ON public.%I USING ((%s) AND NOT public.utente_e_cliente_esterno())',
                     p.nome, t, p.qual);
      v_fatte := v_fatte + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'policy ristrette: %', v_fatte;
END $$;
