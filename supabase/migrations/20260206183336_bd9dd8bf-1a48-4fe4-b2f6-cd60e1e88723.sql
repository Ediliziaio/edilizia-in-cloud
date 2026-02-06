-- 1. Creare bucket storage per allegati ordini
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-attachments', 'order-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Creare tabella order_item_attachments
CREATE TABLE IF NOT EXISTS public.order_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Abilitare RLS
ALTER TABLE public.order_item_attachments ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Company admins possono gestire allegati dei propri ordini
CREATE POLICY "Company admins can manage their order item attachments"
  ON public.order_item_attachments FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_attachments.order_item_id
      AND o.company_id = get_user_company_id(auth.uid())
    )
  );

-- 5. Policy: Clienti possono vedere allegati dei propri ordini
CREATE POLICY "Customers can view their order item attachments"
  ON public.order_item_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = order_item_attachments.order_item_id
      AND o.customer_id = auth.uid()
    )
  );

-- 6. Policy: Super admins accesso completo
CREATE POLICY "Super admins can manage all order item attachments"
  ON public.order_item_attachments FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 7. Storage policies per il bucket
CREATE POLICY "Anyone can view order attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'order-attachments');

CREATE POLICY "Authenticated users can upload order attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'order-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their uploaded attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'order-attachments' AND auth.role() = 'authenticated');