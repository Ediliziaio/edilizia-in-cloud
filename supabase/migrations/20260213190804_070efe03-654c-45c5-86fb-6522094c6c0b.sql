
-- Expand article_templates with catalog fields
ALTER TABLE public.article_templates 
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_cost NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_of_measure TEXT DEFAULT 'pz',
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 22,
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Expand order_items with selling price, discount and standard cost
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS standard_cost NUMERIC DEFAULT 0;

-- Add index on article_templates category for filtering
CREATE INDEX IF NOT EXISTS idx_article_templates_category ON public.article_templates(company_id, category);

-- Add staff permission for viewing orders to also access article templates
CREATE POLICY "Staff can view article templates if permitted"
  ON public.article_templates
  FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text) 
    AND company_id = get_user_company_id(auth.uid())
  );

-- Staff with edit orders can manage article templates
CREATE POLICY "Staff can manage article templates if permitted"
  ON public.article_templates
  FOR ALL
  USING (
    has_permission(auth.uid(), 'can_edit_orders'::text) 
    AND company_id = get_user_company_id(auth.uid())
  );
