-- Migration: feature_flags table for super_admin on/off toggles
-- Separate from platform_feature_flags (which defines feature metadata per plan).
-- This table manages global feature toggles and per-company overrides.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key           text UNIQUE NOT NULL,
  label         text NOT NULL,
  description   text,
  scope         text NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'company')),
  is_active     boolean NOT NULL DEFAULT false,
  default_value boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed with common flags
INSERT INTO public.feature_flags (key, label, description, scope, is_active, default_value)
VALUES
  ('ai_agents',          'Agenti AI',               'Abilita il modulo Agenti AI per nuove aziende',     'global', true,  true),
  ('whatsapp_module',    'Modulo WhatsApp',          'Abilita l''integrazione WhatsApp Cloud API',         'global', true,  true),
  ('banking_module',     'Banking / GoCardless',     'Abilita il modulo bancario con PSD2',               'global', true,  true),
  ('marketing_module',   'Modulo Marketing',         'Abilita CRM e pipeline commerciale',                'global', true,  true),
  ('beta_features',      'Funzionalità Beta',        'Espone funzionalità in sviluppo attivo',            'global', false, false),
  ('onboarding_wizard',  'Wizard onboarding',        'Mostra checklist onboarding alle nuove aziende',    'global', false, false)
ON CONFLICT (key) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_feature_flags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_feature_flags_updated_at();

-- RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Super admin: full access
CREATE POLICY "super_admin_all" ON public.feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Authenticated users: read-only (needed by the app to check flags)
CREATE POLICY "authenticated_read" ON public.feature_flags
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
