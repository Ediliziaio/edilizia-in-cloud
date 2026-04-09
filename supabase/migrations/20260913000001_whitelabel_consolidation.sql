-- ============================================================================
-- WL-1.1: Consolidamento brand fields + colonne mancanti per white-label
-- ============================================================================

-- Aggiunge colonne mancanti a company_branding (single source of truth)
ALTER TABLE company_branding
  ADD COLUMN IF NOT EXISTS whitelabel_tier text NOT NULL DEFAULT 'none'
    CHECK (whitelabel_tier IN ('none','basic','full','agency')),
  ADD COLUMN IF NOT EXISTS custom_css text,
  ADD COLUMN IF NOT EXISTS powered_by_text text DEFAULT 'Powered by Edilizia in Cloud',
  ADD COLUMN IF NOT EXISTS pwa_name text,
  ADD COLUMN IF NOT EXISTS pwa_short_name text,
  ADD COLUMN IF NOT EXISTS pwa_theme_color text,
  ADD COLUMN IF NOT EXISTS pwa_background_color text,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_url text,
  ADD COLUMN IF NOT EXISTS pwa_icon_512_url text,
  ADD COLUMN IF NOT EXISTS document_header_html text,
  ADD COLUMN IF NOT EXISTS document_footer_html text,
  ADD COLUMN IF NOT EXISTS email_from_name text,
  ADD COLUMN IF NOT EXISTS sms_sender_name text,
  ADD COLUMN IF NOT EXISTS portal_welcome_message text;

-- Migra dati da companies.brand_* a company_branding per company con dati WL
INSERT INTO company_branding (company_id, platform_name, primary_color, secondary_color, accent_color, favicon_url, login_bg_color, hide_platform_branding, is_active, whitelabel_tier)
SELECT
  c.id,
  COALESCE(c.brand_platform_name, 'Edilizia in Cloud'),
  COALESCE(c.brand_primary_color, '222 47% 11%'),
  c.brand_secondary_color,
  c.brand_accent_color,
  c.brand_favicon_url,
  c.brand_login_bg_url,
  COALESCE(c.brand_hide_powered_by, false),
  true,
  CASE WHEN c.white_label_enabled THEN 'basic' ELSE 'none' END
FROM companies c
WHERE c.white_label_enabled = true
  AND NOT EXISTS (
    SELECT 1 FROM company_branding cb WHERE cb.company_id = c.id
  );

-- Aggiorna tier per company che hanno già un record in company_branding
UPDATE company_branding cb
SET whitelabel_tier = CASE
  WHEN c.white_label_enabled THEN 'basic'
  ELSE 'none'
END
FROM companies c
WHERE cb.company_id = c.id
  AND cb.whitelabel_tier = 'none'
  AND c.white_label_enabled = true;

-- Indici unique (se non già esistenti — possono già esistere da migration precedenti)
CREATE UNIQUE INDEX IF NOT EXISTS idx_branding_custom_domain
  ON company_branding(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_branding_subdomain
  ON company_branding(subdomain) WHERE subdomain IS NOT NULL;

COMMENT ON COLUMN company_branding.whitelabel_tier IS 'Tier white-label: none, basic, full, agency';
COMMENT ON COLUMN company_branding.custom_css IS 'CSS personalizzato (solo tier agency)';
COMMENT ON COLUMN company_branding.powered_by_text IS 'Testo powered-by personalizzato';
