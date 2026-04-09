-- ============================================================================
-- FIX P1: RLS hardening — WITH CHECK e deny explicit
-- Data: 2026-04-09
-- ============================================================================
-- Consolidato:
--   1. invoices: FOR ALL manca WITH CHECK → INSERT/UPDATE non validano company
--   2. super_admin_permissions: aggiunge WITH CHECK esplicito
--   3. user_audit_log: append-only — deny UPDATE/DELETE (tranne super_admin)
--   4. staff_permissions: DELETE policy esplicita (hygiene, oltre FOR ALL)
-- ============================================================================

-- ─── 1. invoices — aggiungi WITH CHECK ──────────────────────────────────────
-- Pre-fix: FOR ALL USING(...) senza WITH CHECK → WITH CHECK default = USING,
-- ma USING non è applicato a INSERT in PG. Result: INSERT senza check esplicito
-- accetta qualsiasi company_id. Fix: aggiungi WITH CHECK speculare.
DROP POLICY IF EXISTS "company_invoices" ON public.invoices;
CREATE POLICY "company_invoices" ON public.invoices
  FOR ALL
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- ─── 2. super_admin_permissions — WITH CHECK esplicito ──────────────────────
DROP POLICY IF EXISTS "Super admins can manage permissions" ON public.super_admin_permissions;
CREATE POLICY "Super admins can manage permissions"
  ON public.super_admin_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ─── 3. user_audit_log — append-only enforcement ────────────────────────────
-- La tabella è un log di audit: deve essere append-only per ogni utente normale.
-- Solo super_admin può eventualmente correggere/cancellare record.
DROP POLICY IF EXISTS "user_audit_log_no_update" ON public.user_audit_log;
CREATE POLICY "user_audit_log_no_update"
  ON public.user_audit_log
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "user_audit_log_no_delete" ON public.user_audit_log;
CREATE POLICY "user_audit_log_no_delete"
  ON public.user_audit_log
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- ─── 4. staff_permissions — DELETE policy esplicita ─────────────────────────
-- La policy FOR ALL copre già DELETE per company_admin, ma avere una policy
-- dedicata rende l'intento esplicito e riduce il rischio in caso di futuro
-- refactor della policy FOR ALL.
DROP POLICY IF EXISTS "staff_permissions_delete_admin" ON public.staff_permissions;
CREATE POLICY "staff_permissions_delete_admin"
  ON public.staff_permissions
  FOR DELETE
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      AND company_id = public.get_user_company_id(auth.uid())
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
