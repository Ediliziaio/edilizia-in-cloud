-- 1. Tabella fornitori
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins can manage their suppliers" ON public.suppliers;
CREATE POLICY "Company admins can manage their suppliers"
  ON public.suppliers FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    company_id = get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Super admins can manage all suppliers" ON public.suppliers;
CREATE POLICY "Super admins can manage all suppliers"
  ON public.suppliers FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 2. Tabella template articoli (autocomplete)
CREATE TABLE IF NOT EXISTS public.article_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.article_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins can manage their article templates" ON public.article_templates;
CREATE POLICY "Company admins can manage their article templates"
  ON public.article_templates FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin') AND
    company_id = get_user_company_id(auth.uid())
  );

DROP POLICY IF EXISTS "Super admins can manage all article templates" ON public.article_templates;
CREATE POLICY "Super admins can manage all article templates"
  ON public.article_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'));

-- 3. Nuovi campi order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0;

-- 4. Nuovi campi orders (date cliente e IVA)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS warehouse_arrival_date DATE,
ADD COLUMN IF NOT EXISTS work_start_date DATE,
ADD COLUMN IF NOT EXISTS work_end_date DATE,
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 22;

-- 5. Aggiornare eventuali record con stati vecchi
UPDATE public.order_items SET status = 'in_magazzino' 
WHERE status IN ('in_produzione', 'consegnato', 'installato');