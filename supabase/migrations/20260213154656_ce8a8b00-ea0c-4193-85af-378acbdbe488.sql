
-- Tabella giacenze magazzino
CREATE TABLE public.warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  description text,
  quantity integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  vat_rate numeric DEFAULT 22,
  supplier_id uuid REFERENCES public.suppliers(id),
  min_stock_level integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabella movimenti magazzino
CREATE TABLE public.warehouse_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.warehouse_stock(id),
  order_item_id uuid REFERENCES public.order_items(id),
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  notes text,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validazione movement_type con trigger
CREATE OR REPLACE FUNCTION public.validate_movement_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type NOT IN ('carico', 'scarico') THEN
    RAISE EXCEPTION 'movement_type deve essere carico o scarico';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_warehouse_movement_type
  BEFORE INSERT OR UPDATE ON public.warehouse_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_movement_type();

-- Colonna stock_item_id su order_items
ALTER TABLE public.order_items ADD COLUMN stock_item_id uuid REFERENCES public.warehouse_stock(id);

-- RLS warehouse_stock
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their warehouse stock"
  ON public.warehouse_stock FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all warehouse stock"
  ON public.warehouse_stock FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view warehouse stock if permitted"
  ON public.warehouse_stock FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_warehouse'::text) AND company_id = get_user_company_id(auth.uid()));

-- RLS warehouse_movements
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their warehouse movements"
  ON public.warehouse_movements FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.warehouse_stock ws WHERE ws.id = warehouse_movements.stock_item_id AND ws.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Super admins can manage all warehouse movements"
  ON public.warehouse_movements FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger updated_at per warehouse_stock
CREATE TRIGGER update_warehouse_stock_updated_at
  BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
