-- Utenti autenticati della stessa azienda (admin e staff)
CREATE POLICY "lcat_company" ON public.listino_categorie FOR ALL
  USING (company_id = public.get_my_company_id());
