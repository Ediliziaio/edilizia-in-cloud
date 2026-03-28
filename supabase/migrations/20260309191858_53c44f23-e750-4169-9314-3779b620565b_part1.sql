-- 2. ALTER TABLE prima_nota_entries - campi mancanti
ALTER TABLE public.prima_nota_entries 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_label TEXT DEFAULT 'banca';
