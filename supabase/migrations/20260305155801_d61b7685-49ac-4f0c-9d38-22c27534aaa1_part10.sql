CREATE POLICY "Staff can insert company ticket messages"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.company_id = get_user_company_id(auth.uid())
    )
  );
