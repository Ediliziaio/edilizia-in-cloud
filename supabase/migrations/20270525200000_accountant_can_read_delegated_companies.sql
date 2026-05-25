-- RLS: il commercialista (membro attivo di un accountant_firm) può leggere
-- le companies a cui ha accesso ATTIVO via accountant_company_access.
--
-- Senza questa policy, anche con access record valido, il join
-- companies!inner torna null e il portale mostra "azienda sconosciuta".

CREATE OR REPLACE FUNCTION public.user_can_read_accountant_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.accountant_company_access aca
    JOIN public.accountant_firm_members fm
      ON fm.firm_id = aca.firm_id
     AND fm.user_id = v_user_id
     AND fm.status = 'active'
    WHERE aca.company_id = p_company_id
      AND aca.status IN ('active', 'invited', 'suspended')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_read_accountant_company(uuid) TO authenticated;

-- Aggiungo policy SELECT su companies per accountant
DROP POLICY IF EXISTS "companies_accountant_delegated_select" ON public.companies;
CREATE POLICY "companies_accountant_delegated_select"
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (public.user_can_read_accountant_company(id));

-- Stessa policy concettuale su accountant_company_access:
-- l'utente vede tutti gli access record dei firm di cui è member attivo
DROP POLICY IF EXISTS "accountant_company_access_member_select" ON public.accountant_company_access;
CREATE POLICY "accountant_company_access_member_select"
  ON public.accountant_company_access
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accountant_firm_members fm
      WHERE fm.firm_id = accountant_company_access.firm_id
        AND fm.user_id = auth.uid()
        AND fm.status = 'active'
    )
  );

-- Stessa cosa per accountant_firms (member può leggere il proprio firm)
DROP POLICY IF EXISTS "accountant_firms_member_select" ON public.accountant_firms;
CREATE POLICY "accountant_firms_member_select"
  ON public.accountant_firms
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.accountant_firm_members fm
      WHERE fm.firm_id = accountant_firms.id
        AND fm.user_id = auth.uid()
        AND fm.status = 'active'
    )
  );

-- accountant_firm_members: vedi tutti i member dei firm di cui sei member
DROP POLICY IF EXISTS "accountant_firm_members_visible_to_firm_members" ON public.accountant_firm_members;
CREATE POLICY "accountant_firm_members_visible_to_firm_members"
  ON public.accountant_firm_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.accountant_firm_members fm2
      WHERE fm2.firm_id = accountant_firm_members.firm_id
        AND fm2.user_id = auth.uid()
        AND fm2.status = 'active'
    )
  );
