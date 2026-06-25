-- articoli_native (catalogo righe fattura + componenti FV via categoria_fv) usava
-- una RLS company_isolation basata su get_my_company_id() = profiles.company_id
-- dell'utente, che NON onora l'impersonation ("Visualizza come" del super-admin).
-- Conseguenza: sotto impersonation SELECT/INSERT sui componenti FV (pagina
-- "Componenti FV" + picker Fase 5 del wizard + editor fatture) venivano bloccati
-- da RLS. Allineo alla funzione impersonation-aware get_effective_company_id()
-- (COALESCE(active_impersonations.target_company_id, profiles.company_id)),
-- coerente col resto dell'app. Per gli utenti normali il comportamento è identico
-- (fallback a profiles.company_id). Aggiunto WITH CHECK esplicito sull'INSERT/UPDATE.
DROP POLICY IF EXISTS company_isolation ON public.articoli_native;
CREATE POLICY company_isolation ON public.articoli_native
  AS PERMISSIVE FOR ALL TO public
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());
