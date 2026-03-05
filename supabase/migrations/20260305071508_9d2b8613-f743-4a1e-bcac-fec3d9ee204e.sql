
CREATE TABLE public.warehouse_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text DEFAULT '#6b7280',
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE public.warehouse_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own company sections"
  ON public.warehouse_sections FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

ALTER TABLE public.warehouse_stock
  ADD COLUMN section_id uuid REFERENCES public.warehouse_sections(id) ON DELETE SET NULL;
