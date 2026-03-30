ALTER TABLE public.warehouse_stock
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.warehouse_sections(id) ON DELETE SET NULL;
