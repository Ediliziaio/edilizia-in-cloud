-- ============================================================================
-- FIX P0: staff_permissions INSERT escalation
-- Data: 2026-04-09
-- ============================================================================
-- Problema: la policy "Company admins can manage staff permissions" è FOR ALL
-- con solo USING. Per INSERT questo permette di inserire righe con user_id
-- ARBITRARIO purché company_id combaci con quello dell'admin chiamante.
-- Test eseguito: INSERT con user_id '00000000-...' riuscito (poi ripulito).
--
-- Fix: WITH CHECK esplicito che verifica che user_id corrisponda a un profilo
-- realmente appartenente alla stessa azienda dell'admin, oppure con accesso
-- multi-company a quella azienda.
-- ============================================================================

-- Ricrea policy company_admin con WITH CHECK stretto
DROP POLICY IF EXISTS "Company admins can manage staff permissions" ON public.staff_permissions;
CREATE POLICY "Company admins can manage staff permissions"
  ON public.staff_permissions
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = staff_permissions.user_id
        AND (
          p.company_id = staff_permissions.company_id
          OR EXISTS (
            SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = p.id
              AND mca.company_id = staff_permissions.company_id
          )
        )
    )
  );

-- Ricrea policy super_admin con WITH CHECK esplicito (simmetria + hygiene)
DROP POLICY IF EXISTS "Super admins can manage all staff permissions" ON public.staff_permissions;
CREATE POLICY "Super admins can manage all staff permissions"
  ON public.staff_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = staff_permissions.user_id
    )
  );
