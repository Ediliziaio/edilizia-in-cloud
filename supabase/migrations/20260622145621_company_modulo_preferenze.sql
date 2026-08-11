-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.company_modulo_preferenze (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  modulo_slug text NOT NULL,
  visibile boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, modulo_slug)
);

ALTER TABLE public.company_modulo_preferenze ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cmp super admin all" ON public.company_modulo_preferenze;
CREATE POLICY "cmp super admin all" ON public.company_modulo_preferenze
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "cmp company members" ON public.company_modulo_preferenze;
CREATE POLICY "cmp company members" ON public.company_modulo_preferenze
  FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
