-- Fix #4 — RLS mancanti: render_gallery superadmin + render_credits write
-- + trigger per inizializzare crediti render su nuove company

-- Policy superadmin su render_gallery (consente impersonation view)
CREATE POLICY "sa_render_gallery" ON public.render_gallery
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Policy write per render_credits (assegnazione manuale crediti da dashboard)
-- La RPC SECURITY DEFINER bypassa RLS per le deductions automatiche;
-- questa policy serve per INSERT/UPDATE manuali da Supabase Dashboard.
CREATE POLICY "sa_render_credits_write" ON public.render_credits
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Funzione + trigger: inizializza 3 crediti render per ogni nuova company
CREATE OR REPLACE FUNCTION public.init_render_credits_on_company()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.render_credits (company_id, balance)
  VALUES (NEW.id, 3)
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_render_credits ON public.companies;

CREATE TRIGGER trg_init_render_credits
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.init_render_credits_on_company();
