-- Dedicated reusable content: no alteration of quote templates, orders or signed documents.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS public.order_variation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  document_heading text NOT NULL CHECK (length(btrim(document_heading)) BETWEEN 1 AND 120),
  intro_text text NOT NULL DEFAULT '' CHECK (length(intro_text) <= 3000),
  conditions_text text NOT NULL DEFAULT '' CHECK (length(conditions_text) <= 10000),
  payment_terms text NOT NULL DEFAULT '' CHECK (length(payment_terms) <= 3000),
  day_unit text NOT NULL DEFAULT 'calendario' CHECK (day_unit IN ('calendario', 'lavorativi')),
  primary_color text NOT NULL DEFAULT '#1e3a5f' CHECK (primary_color IN ('#1e3a5f', '#14532d', '#9a3412')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_variation_templates_company_active_name_idx
  ON public.order_variation_templates (company_id, name) WHERE is_active;
ALTER TABLE public.order_variation_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_variation_templates FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_variation_templates TO authenticated;
GRANT ALL ON public.order_variation_templates TO service_role;
DROP POLICY IF EXISTS variation_templates_read ON public.order_variation_templates;
CREATE POLICY variation_templates_read ON public.order_variation_templates FOR SELECT TO authenticated
USING (
  NOT (SELECT public.utente_e_cliente_esterno()) AND (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR
    (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND (
      company_id IN (SELECT unnest(public.aziende_con_permesso('can_view_settings_pricing'))) OR
      company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))) OR
      company_id IN (SELECT unnest(public.aziende_con_permesso('can_view_orders'))) OR
      company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_orders')))
    ))
  )
);
DROP POLICY IF EXISTS variation_templates_insert ON public.order_variation_templates;
CREATE POLICY variation_templates_insert ON public.order_variation_templates FOR INSERT TO authenticated
WITH CHECK (NOT (SELECT public.utente_e_cliente_esterno()) AND (
  (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR
  (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND
    company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
));
DROP POLICY IF EXISTS variation_templates_update ON public.order_variation_templates;
CREATE POLICY variation_templates_update ON public.order_variation_templates FOR UPDATE TO authenticated
USING (NOT (SELECT public.utente_e_cliente_esterno()) AND (
  (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR
  (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND
    company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
))
WITH CHECK (NOT (SELECT public.utente_e_cliente_esterno()) AND (
  (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)) OR
  (company_id = (SELECT public.get_user_company_id((SELECT auth.uid()))) AND
    company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
));
DROP POLICY IF EXISTS blocco_utente_bloccato ON public.order_variation_templates;
CREATE POLICY blocco_utente_bloccato ON public.order_variation_templates AS RESTRICTIVE FOR ALL TO authenticated
USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
