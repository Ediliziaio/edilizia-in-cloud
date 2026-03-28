ALTER TABLE public.warehouse_stock
  ADD COLUMN section_id uuid REFERENCES public.warehouse_sections(id) ON DELETE SET NULL;
