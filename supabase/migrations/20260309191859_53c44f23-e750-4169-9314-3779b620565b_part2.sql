-- 3. ALTER TABLE purchase_order_items - link a order_items
ALTER TABLE public.purchase_order_items 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;
