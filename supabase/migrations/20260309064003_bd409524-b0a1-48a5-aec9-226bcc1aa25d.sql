
-- Feature Flags System: 2 new tables

CREATE TABLE public.platform_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'core',
  is_beta BOOLEAN DEFAULT false,
  default_value BOOLEAN DEFAULT false,
  plans_included TEXT[] DEFAULT '{}',
  price_per_month DECIMAL(10,2),
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.company_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  feature_key TEXT REFERENCES public.platform_feature_flags(key) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  override_reason TEXT,
  override_by UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, feature_key)
);

-- Indexes
CREATE INDEX idx_company_feature_overrides_company ON public.company_feature_overrides(company_id);
CREATE INDEX idx_company_feature_overrides_key ON public.company_feature_overrides(feature_key);

-- RLS
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage feature flags"
  ON public.platform_feature_flags FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can read feature flags"
  ON public.platform_feature_flags FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Super admins manage overrides"
  ON public.company_feature_overrides FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Company users read own overrides"
  ON public.company_feature_overrides FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

-- Migrate existing messaging_beta_enabled data
INSERT INTO public.platform_feature_flags (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order) VALUES
  ('ai_agents', 'Agenti AI', 'Assistenti AI per automazione task e conversazioni', 'addon', false, true, '{enterprise}', 'Bot', 1),
  ('whatsapp', 'WhatsApp Business', 'Invio messaggi WhatsApp ai contatti', 'addon', false, true, '{pro,enterprise}', 'MessageCircle', 2),
  ('reporting_advanced', 'Reporting Avanzato', 'Report personalizzati e dashboard avanzate', 'addon', false, false, '{enterprise}', 'BarChart3', 3),
  ('messaging_beta', 'Messaggistica', 'Modulo di messaggistica con AI per conversazioni', 'beta', true, false, '{}', 'MessageSquare', 4),
  ('ai_agents_internal', 'Agenti AI Gestione Interna', 'AI per gestione ordini e magazzino', 'beta', true, false, '{}', 'Cpu', 5),
  ('email_marketing', 'Email Marketing', 'Campagne email automatizzate', 'addon', false, true, '{pro,enterprise}', 'Mail', 6),
  ('automations', 'Automazioni Marketing', 'Workflow automatizzati per il CRM', 'core', false, true, '{base,pro,enterprise}', 'Zap', 7);

-- Convert existing messaging_beta_enabled = true to overrides
INSERT INTO public.company_feature_overrides (company_id, feature_key, is_enabled, override_reason)
SELECT id, 'messaging_beta', true, 'Migrato da messaging_beta_enabled'
FROM public.companies
WHERE messaging_beta_enabled = true;
