-- ============================================================================
-- platform_email_signature — defaults globali EiC per le email transazionali
-- ============================================================================
-- Quando una company_branding è NULL / vuota il renderer deve avere comunque
-- una firma/footer e un mittente decenti. Finora questi valori erano
-- hardcoded in getBranding.ts (© <anno> Edilizia in Cloud). Con questa
-- migration li rendiamo configurabili dal SuperAdmin:
--
--   email_signature_html       → snippet HTML firmato (chiusura email)
--   email_signature_text       → versione plain text della firma
--   email_default_from_name    → mittente mostrato in "From:" per default
--   email_default_footer_text  → copyright/disclaimer legale in fondo
--   email_default_support_mail → indirizzo di supporto esposto nei template
--
-- Tutti questi finiscono come placeholder standard disponibili in ogni
-- template (vedi BRANDING_PLACEHOLDERS in _shared/email-templates/placeholders.ts).
--
-- IDEMPOTENTE: ON CONFLICT DO NOTHING → non sovrascrive eventuali
-- customizzazioni già salvate dall'admin.
-- ============================================================================

INSERT INTO public.platform_settings (key, value, updated_at)
VALUES
  (
    'email_default_from_name',
    'Edilizia in Cloud',
    now()
  ),
  (
    'email_default_footer_text',
    '© Edilizia in Cloud — Tutti i diritti riservati.',
    now()
  ),
  (
    'email_default_support_mail',
    'supporto@ediliziaincloud.it',
    now()
  ),
  (
    'email_signature_text',
    E'Il team di Edilizia in Cloud\nhttps://ediliziaincloud.it',
    now()
  ),
  (
    'email_signature_html',
    '<p style="margin:16px 0 0 0;color:#374151;font-size:14px;line-height:1.5;">Il team di <strong>Edilizia in Cloud</strong><br/><a href="https://ediliziaincloud.it" style="color:#F97415;text-decoration:none;">ediliziaincloud.it</a></p>',
    now()
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.platform_settings IS
  'Configurazione globale piattaforma. Include anche defaults email (email_default_*, email_signature_*) usati come fallback quando company_branding non ha override.';
