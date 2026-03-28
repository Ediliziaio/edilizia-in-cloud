-- ─────────────────────────────────────────────────────────────
-- SEZIONE DIPENDENTI  (can_view_employees)
-- ─────────────────────────────────────────────────────────────

-- employee_attachments — staff con can_view_employees vede i documenti
CREATE POLICY "Staff can view employee attachments if permitted"
  ON public.employee_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_employees'::text)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_attachments.employee_id
        AND e.company_id = get_user_company_id(auth.uid())
    )
  );
