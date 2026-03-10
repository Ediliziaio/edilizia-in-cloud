
-- Customer messages table for client<->company real-time chat
CREATE TABLE public.customer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('customer', 'staff')),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_customer_messages_company ON public.customer_messages(company_id);
CREATE INDEX idx_customer_messages_customer ON public.customer_messages(customer_id);
CREATE INDEX idx_customer_messages_created ON public.customer_messages(created_at DESC);

-- RLS
ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;

-- Customer can see their own messages
CREATE POLICY "customer_own_messages"
  ON public.customer_messages
  FOR ALL
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() AND sender_role = 'customer' AND sender_id = auth.uid());

-- Company staff can see messages for their company
CREATE POLICY "staff_company_messages"
  ON public.customer_messages
  FOR ALL
  TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id() AND sender_role = 'staff' AND sender_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_messages;
