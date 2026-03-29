-- Customer can see their own messages
CREATE POLICY "customer_own_messages"
  ON public.customer_messages
  FOR ALL
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() AND sender_role = 'customer' AND sender_id = auth.uid());
