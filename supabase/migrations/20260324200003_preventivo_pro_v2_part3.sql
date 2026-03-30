-- Utenti autenticati della stessa azienda (admin e staff)
DROP POLICY IF EXISTS "lcat_company" ON public.listino_categorie;
CREATE POLICY "lcat_company" ON public.listino_categorie FOR ALL
  USING (company_id = public.get_my_company_id());
