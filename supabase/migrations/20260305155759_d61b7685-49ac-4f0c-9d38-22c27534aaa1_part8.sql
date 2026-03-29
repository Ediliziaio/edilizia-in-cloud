CREATE POLICY "Staff can insert company tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );
