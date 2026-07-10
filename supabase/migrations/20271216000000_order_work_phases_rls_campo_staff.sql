-- ============================================================================
-- Fix RLS order_work_phases: prima solo company_admin/super_admin.
-- Effetto del bug: gli operai non vedevano né aggiornavano le fasi dal
-- rapportino campo (select vuota silenziosa, update bloccati), e gli staff
-- non gestivano le fasi lato ufficio. Parità con le convenzioni di order_items.
-- (Applicata in prod il 2026-07-10 via MCP: order_work_phases_rls_campo_staff)
-- ============================================================================

CREATE POLICY "Staff can view order work phases if permitted"
ON public.order_work_phases FOR SELECT
USING (
  has_permission((SELECT auth.uid()), 'can_view_orders')
  AND get_order_company_id(order_id) = get_user_company_id((SELECT auth.uid()))
);

CREATE POLICY "Staff can manage order work phases if permitted"
ON public.order_work_phases FOR ALL
USING (
  has_permission((SELECT auth.uid()), 'can_edit_orders')
  AND get_order_company_id(order_id) = get_user_company_id((SELECT auth.uid()))
)
WITH CHECK (
  has_permission((SELECT auth.uid()), 'can_edit_orders')
  AND get_order_company_id(order_id) = get_user_company_id((SELECT auth.uid()))
);

CREATE POLICY "Campo workers can view phases of assigned orders"
ON public.order_work_phases FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.order_campo_assignments oca
    WHERE oca.order_id = order_work_phases.order_id
      AND oca.user_id = (SELECT auth.uid())
  )
  OR order_has_employee_for_user(order_id, (SELECT auth.uid()))
);

CREATE POLICY "Campo workers can update phases of assigned orders"
ON public.order_work_phases FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.order_campo_assignments oca
    WHERE oca.order_id = order_work_phases.order_id
      AND oca.user_id = (SELECT auth.uid())
  )
  OR order_has_employee_for_user(order_id, (SELECT auth.uid()))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.order_campo_assignments oca
    WHERE oca.order_id = order_work_phases.order_id
      AND oca.user_id = (SELECT auth.uid())
  )
  OR order_has_employee_for_user(order_id, (SELECT auth.uid()))
);
