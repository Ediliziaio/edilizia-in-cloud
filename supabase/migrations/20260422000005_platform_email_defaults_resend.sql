-- ============================================================================
-- Email Dual-Provider — FASE 5: switch default transactional → Resend
-- ============================================================================
-- L'utente ha valutato Resend > SendGrid: cambia il default in
-- platform_settings da 'sendgrid' a 'resend' per il transactional stream.
--
-- Il marketing resta su Elastic Email.
--
-- IDEMPOTENTE: usa ON CONFLICT per upsert.
-- ============================================================================

-- 1. Inserisce o aggiorna i default provider
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  ('email_transactional_provider', 'resend', now()),
  ('email_marketing_provider',     'elastic_email', now())
ON CONFLICT (key) DO UPDATE
SET
  value = CASE
    -- Se valore corrente è ancora 'sendgrid' su transactional → switch a 'resend'
    WHEN platform_settings.key = 'email_transactional_provider'
      AND platform_settings.value IN ('sendgrid', '', NULL) THEN 'resend'
    -- Se valore corrente è '' o NULL su marketing → set 'elastic_email'
    WHEN platform_settings.key = 'email_marketing_provider'
      AND platform_settings.value IN ('', NULL) THEN 'elastic_email'
    -- Altrimenti rispetta la scelta dell'admin (non sovrascrive override manuali)
    ELSE platform_settings.value
  END,
  updated_at = now();

-- 2. Sottodomini fallback EiC (richiesti dal masterprompt sezione 1.3)
-- L'utente partirà da zero per la configurazione DNS, ma settiamo i valori
-- "intended" qui in modo che l'app sappia quali sono i fallback corretti.
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  ('email_transactional_fallback_subdomain', 'notifiche.ediliziaincloud.it', now()),
  ('email_marketing_fallback_subdomain',     'mail.ediliziaincloud.it',     now()),
  ('email_transactional_fallback_from_name', 'EdiliziaInCloud',             now()),
  ('email_marketing_fallback_from_suffix',   ' via EdiliziaInCloud',        now())
ON CONFLICT (key) DO NOTHING;

-- 3. Defaults per rate limiting (configurabili da SuperAdmin)
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  ('email_rate_limit_transactional_per_day', '5000', now()),
  ('email_rate_limit_warning_threshold_pct', '80',   now()),
  ('email_bounce_rate_threshold_pct',        '5',    now()),
  ('email_complaint_rate_threshold_pct',     '0.1',  now()),
  ('email_dmarc_report_address',             'dmarc@ediliziaincloud.it', now())
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS
  'Configurazione globale piattaforma. Email keys: email_{stream}_provider, email_{stream}_api_key, email_{stream}_fallback_subdomain, ecc.';
