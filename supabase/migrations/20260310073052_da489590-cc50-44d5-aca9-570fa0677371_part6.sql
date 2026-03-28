-- Company staff can see messages for their company
CREATE POLICY "staff_company_messages"
  ON public.customer_messages
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id() AND sender_role = 'staff' AND sender_id = auth.uid());
