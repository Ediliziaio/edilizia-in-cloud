-- RLS ticket_messages per staff
CREATE POLICY "Staff can view company ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_tickets') 
    AND EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.company_id = get_user_company_id(auth.uid())
    )
  );
