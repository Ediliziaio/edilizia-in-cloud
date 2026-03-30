DROP POLICY IF EXISTS "Staff can update company tickets" ON public.tickets;
CREATE POLICY "Staff can update company tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );
