-- ============================================================================
-- v8.6.52 — Seed default widget token per il sito ediliziaincloud.com
--
-- Bug rilevato: la chat di Silvio sul sito pubblico (assistenza) non si
-- caricava. Causa: il token hardcoded `859db08e-494d-4b15-ba85-7da57849df87`
-- in SiteChatWidget.tsx NON era mai stato seedato nel DB. L'edge function
-- `public-chat-widget` chiamava `get_chatbot_config` → restituiva 404
-- "widget_not_found" → widget mostrava errore tecnico all'utente.
--
-- Fix:
-- 1. Identifica la company "Domus Group" (proprietaria del dominio
--    ediliziaincloud.com) tramite legalName/taxID.
-- 2. UPSERT su public_chatbot_settings con il token canonico
--    `859db08e-494d-4b15-ba85-7da57849df87` (corrisponde al fallback nel
--    SiteChatWidget.tsx → DEFAULT_PLATFORM_TOKEN).
-- 3. Se la company Domus Group non esiste in questo DB (es. preview env),
--    skip silenzioso senza fallire.
--
-- Note:
-- - La RLS policy `chatbot_settings_company` consente solo all'admin della
--   stessa company di modificare. Questa migration usa SECURITY DEFINER /
--   bypass tramite DO block che gira come postgres role (idempotente).
-- - Il widget è abilitato (enabled=true) e configurato come AI sales con
--   persona generica per cattura lead.
-- ============================================================================

DO $$
DECLARE
  v_company_id UUID;
  v_default_token UUID := '859db08e-494d-4b15-ba85-7da57849df87';
BEGIN
  -- Cerca la company Domus Group (proprietaria di ediliziaincloud.com).
  -- La tabella `companies` ha solo `name` + `email` come identificatori
  -- (P.IVA è solo su suppliers/marketing_contacts). Match best-effort
  -- su name + email domain.
  SELECT id INTO v_company_id
  FROM public.companies
  WHERE name ILIKE '%Domus Group%'
     OR name ILIKE '%edilizia%cloud%'
     OR name ILIKE '%EdiliziaInCloud%'
     OR email ILIKE '%@ediliziaincloud.%'
     OR email ILIKE '%@domusgroup%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'public_chatbot_settings seed: company Domus Group non trovata, skip.';
    RETURN;
  END IF;

  -- UPSERT settings con token canonico
  INSERT INTO public.public_chatbot_settings (
    company_id,
    enabled,
    welcome_message,
    primary_color,
    bot_name,
    ai_persona,
    collect_phone_required,
    collect_email_required,
    auto_handoff_after_messages,
    daily_session_limit,
    rate_limit_per_minute,
    public_widget_token
  ) VALUES (
    v_company_id,
    TRUE,
    'Ciao! Sono Silvio, l''assistente di Edilizia in Cloud. Posso rispondere a domande sul software, sui prezzi e prepararti una demo personalizzata. Da dove cominciamo?',
    '#F97316',
    'Silvio AI',
    'sales',
    FALSE, -- non obbligatorio per ridurre attrito
    TRUE,  -- email sì, per follow-up
    10,
    500,   -- daily session limit generoso per traffico landing
    20,    -- rate limit per minute
    v_default_token
  )
  ON CONFLICT (company_id) DO UPDATE
  SET
    enabled = TRUE,
    public_widget_token = v_default_token,
    bot_name = COALESCE(EXCLUDED.bot_name, public_chatbot_settings.bot_name),
    welcome_message = COALESCE(EXCLUDED.welcome_message, public_chatbot_settings.welcome_message),
    updated_at = now();

  RAISE NOTICE 'public_chatbot_settings seed: configured for company % with token %', v_company_id, v_default_token;
END $$;
