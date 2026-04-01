-- ============================================================
-- Migration 01: Tabella warehouses (magazzini fisici)
-- Sprint 1 Multi-Magazzino — Edilizia in Cloud
-- ============================================================

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'main'
    CHECK (type IN ('main', 'secondary', 'site', 'vehicle')),
  address text,
  city text,
  province text,
  postal_code text,
  contact_name text,
  contact_phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  linked_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vincolo: al massimo 1 magazzino default per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_default
  ON public.warehouses(company_id) WHERE is_default = true;

-- Indici performance
CREATE INDEX IF NOT EXISTS idx_warehouses_company
  ON public.warehouses(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouses_type
  ON public.warehouses(company_id, type);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_warehouses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS warehouses_updated_at ON public.warehouses;
CREATE TRIGGER warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.set_warehouses_updated_at();

-- RLS
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_warehouses" ON public.warehouses;
CREATE POLICY "company_warehouses" ON public.warehouses
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));
