ALTER TABLE public.order_items 
ADD COLUMN section_id uuid REFERENCES public.warehouse_sections(id) ON DELETE SET NULL DEFAULT NULL;