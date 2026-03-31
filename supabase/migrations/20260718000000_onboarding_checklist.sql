-- Migration: Onboarding checklist for new companies (simple step-based guide)
-- Uses a separate table from the template-based system to avoid conflicts

CREATE TABLE IF NOT EXISTS public.onboarding_guide_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text UNIQUE NOT NULL,
  label           text NOT NULL,
  description     text,
  order_position  integer NOT NULL DEFAULT 0,
  is_required     boolean NOT NULL DEFAULT false,
  module          text,
  icon            text,
  route           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_onboarding_progress (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_key      text NOT NULL,
  completed_at  timestamptz,
  skipped_at    timestamptz,
  UNIQUE(company_id, step_key)
);

-- Seed default onboarding steps
INSERT INTO public.onboarding_guide_steps (key, label, description, order_position, is_required, module, icon, route)
VALUES
  ('complete_profile',    'Completa il profilo azienda',   'Aggiungi logo, settore e dati di contatto',                 1,  true,  'profile',   'Building2',     '/azienda/impostazioni/profilo'),
  ('create_first_order',  'Crea la prima commessa',        'Crea la tua prima commessa di lavoro',                      2,  true,  'orders',    'ClipboardList', '/azienda/commesse/nuova'),
  ('add_team_member',     'Aggiungi un membro del team',   'Invita il primo collaboratore alla piattaforma',            3,  false, 'team',      'Users',         '/azienda/team'),
  ('setup_email',         'Configura email marketing',     'Connetti il provider email per comunicazioni automatiche',  4,  false, 'email',     'Mail',          '/azienda/marketing/email'),
  ('connect_banking',     'Connetti il conto bancario',    'Configura GoCardless PSD2 per la gestione pagamenti',       5,  false, 'banking',   'Landmark',      '/azienda/finanziario/banking'),
  ('create_first_invoice','Crea la prima fattura',         'Emetti la prima fattura elettronica',                       6,  false, 'billing',   'Receipt',       '/azienda/finanziario/fatture'),
  ('setup_whatsapp',      'Attiva WhatsApp Business',      'Connetti il numero WhatsApp per messaggi automatici',       7,  false, 'whatsapp',  'MessageSquare', '/azienda/marketing/whatsapp')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_onboarding_progress_company
  ON public.company_onboarding_progress(company_id);

-- RLS
ALTER TABLE public.onboarding_guide_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_guide_steps" ON public.onboarding_guide_steps
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "company_members_progress" ON public.company_onboarding_progress
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "service_role_progress" ON public.company_onboarding_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_guide_steps" ON public.onboarding_guide_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
