-- 5. Indici per le nuove FK
CREATE INDEX IF NOT EXISTS idx_scadenze_order_item_id ON public.scadenze(order_item_id);
