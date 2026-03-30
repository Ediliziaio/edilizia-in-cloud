-- S2.1 — whatsapp_pricing table
CREATE TABLE IF NOT EXISTS public.whatsapp_pricing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider             TEXT NOT NULL DEFAULT 'meta',
  label                TEXT,
  category             TEXT NOT NULL DEFAULT 'marketing'
                       CHECK (category IN ('marketing','utility','authentication','service')),
  country_code         TEXT NOT NULL DEFAULT 'IT',
  cost_real_per_unit   NUMERIC(12,6) NOT NULL DEFAULT 0.0541,
  cost_billed_per_unit NUMERIC(12,6) NOT NULL DEFAULT 0.12,
  markup_multiplier    NUMERIC(6,2)  NOT NULL DEFAULT 2.2,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_pricing (label, category, cost_real_per_unit, cost_billed_per_unit, markup_multiplier)
VALUES
  ('Marketing IT',      'marketing',      0.0541, 0.12, 2.2),
  ('Utility IT',        'utility',        0.0200, 0.05, 2.5),
  ('Authentication IT', 'authentication', 0.0280, 0.07, 2.5),
  ('Service IT',        'service',        0.0000, 0.00, 1.0);

ALTER TABLE public.whatsapp_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_whatsapp_pricing" ON public.whatsapp_pricing FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));
