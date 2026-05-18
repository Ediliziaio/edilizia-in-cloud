-- ============================================================================
-- SETUP AZIENDA: Tekno Finestre — info@teknofinestre.it
--
-- Accessi attivi (uso pieno):
--   - render_ai
--   - modulo_serramenti_attivo
--   - listini_serramenti_avanzati
--
-- Tutto il resto: modalità Demo (preview) — vede UI, click su azioni apre
-- popup "Sblocca contattando il consulente" → ticket
--
-- ============================================================================
-- PREREQUISITI:
-- 1. L'utente deve già esistere in auth.users:
--    → Supabase Dashboard → Authentication → Add user
--    Email: info@teknofinestre.it
--    Password: Password2025!
--    [✓] Auto Confirm User
--
-- 2. La migration 20270519120000_feature_preview_mode.sql deve essere già
--    applicata (introduce access_level tri-state).
-- ============================================================================

DO $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_plan_id UUID;
  v_feature TEXT;
  v_features_full TEXT[] := ARRAY[
    'render_ai',
    'modulo_serramenti_attivo',
    'listini_serramenti_avanzati'
  ];
BEGIN
  -- 1. Recupera utente da auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'info@teknofinestre.it';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Utente info@teknofinestre.it non trovato in auth.users. Crealo prima da Supabase Dashboard → Authentication → Add user.';
  END IF;

  -- 2. Crea azienda Tekno Finestre (o recupera se esiste)
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE LOWER(email) = 'info@teknofinestre.it'
     OR LOWER(name) = 'tekno finestre'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, slug, email, status, trial_ends_at)
    VALUES (
      'Tekno Finestre',
      'tekno-finestre',
      'info@teknofinestre.it',
      'active',
      now() + interval '90 days'
    )
    RETURNING id INTO v_company_id;
    RAISE NOTICE 'Azienda creata: %', v_company_id;
  ELSE
    RAISE NOTICE 'Azienda già esistente: %', v_company_id;
  END IF;

  -- 3. Profilo utente → company
  INSERT INTO public.profiles (id, company_id, email, first_name, last_name)
  VALUES (v_user_id, v_company_id, 'info@teknofinestre.it', 'Tekno', 'Finestre')
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        email = COALESCE(public.profiles.email, EXCLUDED.email);

  -- 4. Ruolo: company_admin
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (v_user_id, 'company_admin', v_company_id)
  ON CONFLICT (user_id, role, company_id) DO NOTHING;

  -- 5. Sottoscrizione attiva (piano più economico disponibile)
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE price_monthly >= 0
  ORDER BY price_monthly ASC
  LIMIT 1;

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO public.company_subscriptions (company_id, plan_id, status, started_at)
    VALUES (v_company_id, v_plan_id, 'active', now())
    ON CONFLICT DO NOTHING;
  END IF;

  -- 6. Feature 'enabled': render_ai + serramenti (uso pieno)
  FOREACH v_feature IN ARRAY v_features_full LOOP
    INSERT INTO public.company_feature_overrides
      (company_id, feature_key, access_level, is_enabled, override_reason)
    VALUES
      (v_company_id, v_feature, 'enabled', true,
       'Accesso pieno commerciale — bundle Render + Infissi')
    ON CONFLICT (company_id, feature_key) DO UPDATE
      SET access_level = 'enabled',
          is_enabled = true,
          override_reason = 'Accesso pieno commerciale — bundle Render + Infissi';
    RAISE NOTICE 'Feature ENABLED: %', v_feature;
  END LOOP;

  -- 7. Tutte le altre feature: 'preview' se supportano demo, 'disabled' se a consumo
  INSERT INTO public.company_feature_overrides
    (company_id, feature_key, access_level, is_enabled, override_reason)
  SELECT
    v_company_id,
    pff.feature_key,
    CASE
      WHEN pff.supports_preview THEN 'preview'::public.feature_access_level
      ELSE 'disabled'::public.feature_access_level
    END,
    false,
    'Demo mode commerciale — sblocco via consulente'
  FROM public.platform_feature_flags pff
  WHERE pff.feature_key <> ALL (v_features_full)
  ON CONFLICT (company_id, feature_key) DO UPDATE
    SET access_level = EXCLUDED.access_level,
        is_enabled = false,
        override_reason = 'Demo mode commerciale — sblocco via consulente';

  RAISE NOTICE '✓ Setup Tekno Finestre completato. company_id=%, user_id=%', v_company_id, v_user_id;
END $$;

-- ─── Verifica finale ────────────────────────────────────────────────────────
SELECT
  cfo.feature_key,
  cfo.access_level,
  cfo.override_reason
FROM public.company_feature_overrides cfo
JOIN public.companies c ON c.id = cfo.company_id
WHERE LOWER(c.email) = 'info@teknofinestre.it'
ORDER BY
  CASE cfo.access_level
    WHEN 'enabled' THEN 1
    WHEN 'preview' THEN 2
    ELSE 3
  END,
  cfo.feature_key;
