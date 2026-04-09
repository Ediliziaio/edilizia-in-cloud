-- ============================================================================
-- WL-1.2: Tabella whitelabel_tiers — Feature Matrix per plan gating
-- ============================================================================

CREATE TABLE IF NOT EXISTS whitelabel_tiers (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text,
  can_change_logo boolean NOT NULL DEFAULT false,
  can_change_colors boolean NOT NULL DEFAULT false,
  can_change_login_page boolean NOT NULL DEFAULT false,
  can_custom_domain boolean NOT NULL DEFAULT false,
  can_hide_powered_by boolean NOT NULL DEFAULT false,
  can_custom_email_branding boolean NOT NULL DEFAULT false,
  can_custom_pdf_branding boolean NOT NULL DEFAULT false,
  can_custom_pwa boolean NOT NULL DEFAULT false,
  can_custom_css boolean NOT NULL DEFAULT false,
  can_resell boolean NOT NULL DEFAULT false,
  max_custom_domains integer NOT NULL DEFAULT 0,
  price_monthly numeric NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0
);

-- Seed dati tier
INSERT INTO whitelabel_tiers (slug, name, description, can_change_logo, can_change_colors, can_change_login_page, can_custom_domain, can_hide_powered_by, can_custom_email_branding, can_custom_pdf_branding, can_custom_pwa, can_custom_css, can_resell, max_custom_domains, price_monthly, position)
VALUES
  ('none',   'Nessuno',    'Piano base senza personalizzazione brand',      false, false, false, false, false, false, false, false, false, false, 0,   0,   0),
  ('basic',  'Basic',      'Logo, colori e pagina login personalizzabili',  true,  true,  true,  false, false, false, false, false, false, false, 0,  29,   1),
  ('full',   'Full',       'Branding completo con dominio custom',          true,  true,  true,  true,  true,  true,  true,  true,  false, false, 1,  89,   2),
  ('agency', 'Agency',     'White-label completo con CSS e rivendita',      true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  99, 199,  3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  can_change_logo = EXCLUDED.can_change_logo,
  can_change_colors = EXCLUDED.can_change_colors,
  can_change_login_page = EXCLUDED.can_change_login_page,
  can_custom_domain = EXCLUDED.can_custom_domain,
  can_hide_powered_by = EXCLUDED.can_hide_powered_by,
  can_custom_email_branding = EXCLUDED.can_custom_email_branding,
  can_custom_pdf_branding = EXCLUDED.can_custom_pdf_branding,
  can_custom_pwa = EXCLUDED.can_custom_pwa,
  can_custom_css = EXCLUDED.can_custom_css,
  can_resell = EXCLUDED.can_resell,
  max_custom_domains = EXCLUDED.max_custom_domains,
  price_monthly = EXCLUDED.price_monthly,
  position = EXCLUDED.position;

-- RLS: lettura pubblica (serve al frontend per mostrare pricing/features)
ALTER TABLE whitelabel_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whitelabel_tiers_public_read"
  ON whitelabel_tiers FOR SELECT
  USING (true);

-- Solo super_admin può modificare i tier
CREATE POLICY "whitelabel_tiers_admin_manage"
  ON whitelabel_tiers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Tabella audit log per operazioni white-label
CREATE TABLE IF NOT EXISTS whitelabel_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whitelabel_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whitelabel_audit_superadmin_read"
  ON whitelabel_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "whitelabel_audit_insert"
  ON whitelabel_audit_log FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_wl_audit_company ON whitelabel_audit_log(company_id);
CREATE INDEX idx_wl_audit_created ON whitelabel_audit_log(created_at DESC);
