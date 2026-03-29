-- ─── 2. Colonna ordine_id shortcut su documenti_fiscali ──────
ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS ordine_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
