-- ============================================================
-- Migration: warehouse_referenti (junction table polimorfico)
--
-- Permette di assegnare uno o più referenti a un magazzino.
-- Il referente può essere un dipendente (tabella employees) OPPURE
-- un subappaltatore (tabella subappaltatori) — MAI un cliente.
--
-- Il campo role_label è libero (es. "Magazziniere", "Caposquadra",
-- "Responsabile spedizioni") così ogni azienda può usare la sua
-- terminologia senza richiedere un enum globale.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.warehouse_referenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Polymorphic reference: employee OR subcontractor, mai entrambi
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  subcontractor_id uuid REFERENCES public.subappaltatori(id) ON DELETE CASCADE,

  -- Metadati del referente
  role_label text NOT NULL DEFAULT 'Magazziniere',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Enforcement: o employee O subcontractor, non entrambi né nessuno
  CONSTRAINT warehouse_referenti_target_check CHECK (
    (employee_id IS NOT NULL AND subcontractor_id IS NULL) OR
    (employee_id IS NULL AND subcontractor_id IS NOT NULL)
  )
);

-- Un dipendente può essere referente di un magazzino al massimo una volta
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_referenti_employee_unique
  ON public.warehouse_referenti(warehouse_id, employee_id)
  WHERE employee_id IS NOT NULL;

-- Un subappaltatore può essere referente di un magazzino al massimo una volta
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_referenti_subcontractor_unique
  ON public.warehouse_referenti(warehouse_id, subcontractor_id)
  WHERE subcontractor_id IS NOT NULL;

-- Al massimo 1 referente primario per magazzino
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_referenti_primary
  ON public.warehouse_referenti(warehouse_id)
  WHERE is_primary = true;

-- Indici performance
CREATE INDEX IF NOT EXISTS idx_warehouse_referenti_warehouse
  ON public.warehouse_referenti(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_referenti_company
  ON public.warehouse_referenti(company_id);

CREATE INDEX IF NOT EXISTS idx_warehouse_referenti_employee
  ON public.warehouse_referenti(employee_id)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_referenti_subcontractor
  ON public.warehouse_referenti(subcontractor_id)
  WHERE subcontractor_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_warehouse_referenti_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS warehouse_referenti_updated_at ON public.warehouse_referenti;
CREATE TRIGGER warehouse_referenti_updated_at
  BEFORE UPDATE ON public.warehouse_referenti
  FOR EACH ROW EXECUTE FUNCTION public.set_warehouse_referenti_updated_at();

-- RLS
ALTER TABLE public.warehouse_referenti ENABLE ROW LEVEL SECURITY;

-- Tutti i membri della company possono leggere i referenti
DROP POLICY IF EXISTS "company_members_select_warehouse_referenti" ON public.warehouse_referenti;
CREATE POLICY "company_members_select_warehouse_referenti"
  ON public.warehouse_referenti
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Solo company_admin (o super_admin) può gestire
DROP POLICY IF EXISTS "company_admin_manage_warehouse_referenti" ON public.warehouse_referenti;
CREATE POLICY "company_admin_manage_warehouse_referenti"
  ON public.warehouse_referenti
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

COMMENT ON TABLE public.warehouse_referenti IS
  'Referenti di un magazzino. Junction polimorfica: employee_id OR subcontractor_id (mai clienti). role_label libero (default ''Magazziniere'').';
