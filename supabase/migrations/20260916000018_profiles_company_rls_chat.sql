-- Permetti a utenti autenticati di vedere i profili della propria azienda
-- Necessario per la chat interna e la ricerca utenti
-- Usa get_user_company_id() (SECURITY DEFINER) per evitare ricorsione infinita RLS
DROP POLICY IF EXISTS "profiles_same_company_select" ON public.profiles;
CREATE POLICY "profiles_same_company_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
