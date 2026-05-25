-- FIX critico: la policy "accountant_firm_members_visible_to_firm_members"
-- aveva una subquery ricorsiva su accountant_firm_members → infinite recursion
-- che faceva fallire le SELECT, mostrando "Nessuno studio collegato".
--
-- Inoltre aggiungiamo un RPC che ritorna gli company_id accessibili al
-- commercialista loggato (per usarlo dal client senza join nested complessi).

-- 1) Helper SECURITY DEFINER: l'utente è member attivo di un dato firm?
CREATE OR REPLACE FUNCTION public.user_is_active_firm_member(p_firm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accountant_firm_members
    WHERE firm_id = p_firm_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_active_firm_member(uuid) TO authenticated;

-- 2) Riscriviamo la policy senza ricorsione: o sei il record di te stesso,
--    oppure usi il helper SECURITY DEFINER (che bypassa RLS).
DROP POLICY IF EXISTS "accountant_firm_members_visible_to_firm_members" ON public.accountant_firm_members;
CREATE POLICY "accountant_firm_members_visible_to_firm_members"
  ON public.accountant_firm_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_is_active_firm_member(firm_id)
  );

-- 3) RPC che ritorna gli ID delle aziende delegate al commercialista loggato.
--    Il client lo chiama una sola volta, poi fa una select diretta sulle
--    companies che già sono visibili via la policy "companies_accountant_delegated_select".
CREATE OR REPLACE FUNCTION public.accountant_accessible_company_ids()
RETURNS TABLE (company_id uuid, access_id uuid, status text, access_mode text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    aca.company_id,
    aca.id AS access_id,
    aca.status::text,
    aca.access_mode::text,
    aca.created_at
  FROM public.accountant_company_access aca
  WHERE aca.status IN ('active', 'invited', 'suspended')
    AND EXISTS (
      SELECT 1 FROM public.accountant_firm_members fm
      WHERE fm.firm_id = aca.firm_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'active'
    );
$$;

GRANT EXECUTE ON FUNCTION public.accountant_accessible_company_ids() TO authenticated;

-- 4) Sicuriamo che `accountant_company_access` policy sia non-ricorsiva.
DROP POLICY IF EXISTS "accountant_company_access_member_select" ON public.accountant_company_access;
CREATE POLICY "accountant_company_access_member_select"
  ON public.accountant_company_access
  FOR SELECT
  TO authenticated
  USING (public.user_is_active_firm_member(firm_id));

-- 5) Stessa cosa su accountant_firms (no ricorsione)
DROP POLICY IF EXISTS "accountant_firms_member_select" ON public.accountant_firms;
CREATE POLICY "accountant_firms_member_select"
  ON public.accountant_firms
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.user_is_active_firm_member(id)
  );
