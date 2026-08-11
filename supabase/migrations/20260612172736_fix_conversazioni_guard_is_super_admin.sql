-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- FIX CRITICO: conversazioni_puo_accedere chiamava is_super_admin() SENZA
-- argomenti, ma esiste solo is_super_admin(p_user_id uuid) → "function does
-- not exist" a runtime per OGNI utente → l'inbox Conversazioni mostrava
-- sempre "Non riesco a caricare le conversazioni".
CREATE OR REPLACE FUNCTION public.conversazioni_puo_accedere(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
      OR p_company_id = public.get_user_company_id(auth.uid())
      OR EXISTS (
           SELECT 1 FROM public.multi_company_access mca
           WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id
         );
$$;
GRANT EXECUTE ON FUNCTION public.conversazioni_puo_accedere(uuid) TO authenticated;
