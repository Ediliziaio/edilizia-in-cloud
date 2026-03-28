-- RLS: company_staff con permesso can_view_tickets
CREATE POLICY "Staff can view company tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );
