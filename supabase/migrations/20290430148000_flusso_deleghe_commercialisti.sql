-- Le deleghe si assegnano dal lato azienda. Lo studio può soltanto rispondere a un invito.
DROP POLICY IF EXISTS "Company admins and firm admins can manage access" ON public.accountant_company_access;
DROP POLICY IF EXISTS accountant_company_access_gestione_azienda ON public.accountant_company_access;
CREATE POLICY accountant_company_access_gestione_azienda ON public.accountant_company_access
FOR ALL TO authenticated
USING (
  NOT (SELECT public.utente_e_cliente_esterno())
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
  )
)
WITH CHECK (
  NOT (SELECT public.utente_e_cliente_esterno())
  AND (
    public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
    OR (company_id = public.get_user_company_id((SELECT auth.uid()))
      AND public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role))
  )
);

CREATE OR REPLACE FUNCTION public.studio_elenca_deleghe(p_studio uuid)
RETURNS TABLE (
  id uuid, firm_id uuid, company_id uuid, status text, access_mode text,
  permissions jsonb, invited_email text, invited_at timestamptz, accepted_at timestamptz,
  notes text, company jsonb, puo_rispondere boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT a.id, a.firm_id, a.company_id, a.status, a.access_mode, a.permissions,
         a.invited_email, a.invited_at, a.accepted_at, a.notes,
         jsonb_build_object(
           'id', c.id,
           'name', c.name,
           'vat_number', CASE WHEN a.status = 'active' THEN c.vat_number END,
           'fiscal_code', CASE WHEN a.status = 'active' THEN c.fiscal_code END,
           'legal_city', CASE WHEN a.status = 'active' THEN c.legal_city END
         ),
         m.role IN ('owner', 'admin') AND f.status NOT IN ('suspended', 'archived')
  FROM public.accountant_firm_members m
  JOIN public.accountant_firms f ON f.id = m.firm_id
  JOIN public.accountant_company_access a ON a.firm_id = m.firm_id
  JOIN public.companies c ON c.id = a.company_id
  WHERE m.firm_id = p_studio AND m.user_id = (SELECT auth.uid()) AND m.status = 'active'
    AND NOT (SELECT public.utente_bloccato())
    AND a.status IN ('invited', 'active', 'suspended')
  ORDER BY a.created_at DESC, a.id;
$function$;

CREATE OR REPLACE FUNCTION public.studio_rispondi_invito(p_studio uuid, p_invito uuid, p_accetta boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_utente uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_utente IS NULL OR p_accetta IS NULL OR public.utente_bloccato()
     OR NOT EXISTS (
       SELECT 1 FROM public.accountant_firm_members m
       JOIN public.accountant_firms f ON f.id = m.firm_id
       WHERE m.firm_id = p_studio AND m.user_id = v_utente AND m.status = 'active'
         AND m.role IN ('owner', 'admin') AND f.status NOT IN ('suspended', 'archived')
     ) THEN
    RAISE EXCEPTION 'Solo il titolare o un amministratore dello studio può rispondere all’invito.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.accountant_company_access a
  SET status = CASE WHEN p_accetta THEN 'active' ELSE 'revoked' END,
      accepted_at = CASE WHEN p_accetta THEN now() ELSE a.accepted_at END,
      accepted_by = CASE WHEN p_accetta THEN v_utente ELSE a.accepted_by END,
      revoked_at = CASE WHEN p_accetta THEN NULL ELSE now() END,
      revoked_by = CASE WHEN p_accetta THEN NULL ELSE v_utente END
  WHERE a.firm_id = p_studio AND a.id = p_invito AND a.status = 'invited'
  RETURNING a.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Invito non più disponibile: è stato revocato o già gestito.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.studio_elenca_deleghe(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.studio_rispondi_invito(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_elenca_deleghe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.studio_rispondi_invito(uuid, uuid, boolean) TO authenticated;
