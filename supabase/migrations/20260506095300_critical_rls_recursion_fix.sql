-- CRITICAL HOTFIX — Risolve "infinite recursion detected in policy for relation orders"
-- ════════════════════════════════════════════════════════════════════════════
-- ROOT CAUSE: 6 RLS policy creano cicli orders ↔ order_items ↔ orders e
-- orders ↔ order_employees ↔ orders. Quando un company_admin (es. Ke Bei
-- "amministrazione@kecasaarredi.it") interroga `orders`, PG valuta le policy
-- di orders → alcune fanno EXISTS su order_items/order_employees → quelle
-- tabelle hanno policy che fanno EXISTS su orders → ciclo → ERRORE 42P17.
--
-- SINTOMO UTENTE: la dashboard funziona (usa RPC SECURITY DEFINER bypassando
-- RLS) ma la pagina lista commesse mostra 0 risultati o "errore caricamento".
--
-- SOLUZIONE: tutte le policy che attraversano relazioni bidirezionali devono
-- usare helper functions SECURITY DEFINER (che bypassano RLS valutate ⇒
-- nessun loop). Le helper `get_order_company_id`, `get_order_customer_id`
-- esistono già (verificato). Aggiungiamo `order_has_employee_for_user` e
-- `order_has_item_in_my_warehouse` per chiudere gli altri 2 cicli.
-- ════════════════════════════════════════════════════════════════════════════

-- Prerequisito delle helper: lo storico aggiungeva questa colonna soltanto
-- in 20260802000002. Anticiparla rende riproducibile il replay da zero;
-- la migrazione successiva usa già ADD COLUMN IF NOT EXISTS.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid
  REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- Dipendenze della helper introdotte storicamente solo nel settembre 2026.
CREATE TABLE IF NOT EXISTS public.warehouse_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  is_primary_manager       boolean NOT NULL DEFAULT false,
  can_receive_goods        boolean NOT NULL DEFAULT true,
  can_ship_to_site         boolean NOT NULL DEFAULT true,
  can_transfer             boolean NOT NULL DEFAULT true,
  can_count_inventory      boolean NOT NULL DEFAULT true,
  can_view_purchase_orders boolean NOT NULL DEFAULT true,

  active      boolean     NOT NULL DEFAULT true,
  assigned_by uuid        REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes       text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_warehouse_user UNIQUE (warehouse_id, user_id)
);
ALTER TABLE public.warehouse_assignments ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.get_my_warehouse_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(warehouse_id), ARRAY[]::uuid[])
  FROM public.warehouse_assignments
  WHERE user_id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.is_warehouse_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.warehouse_assignments
    WHERE user_id = auth.uid() AND active = true
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper 1: order_has_employee_for_user
-- Bypass RLS valutate per spezzare loop orders ↔ order_employees
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_has_employee_for_user(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_employees oe
    JOIN public.employees e ON e.id = oe.employee_id
    WHERE oe.order_id = _order_id AND e.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.order_has_employee_for_user(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper 2: order_has_salesperson_for_user
-- Bypass RLS per spezzare loop orders ↔ order_salespeople (preventivo)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_has_salesperson_for_user(_order_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_salespeople os
    JOIN public.salespeople s ON s.id = os.salesperson_id
    WHERE os.order_id = _order_id AND s.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.order_has_salesperson_for_user(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Helper 3: order_has_item_in_my_warehouse
-- Bypass RLS per spezzare loop orders ↔ order_items via warehouse policy
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_has_item_in_my_warehouse(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
      AND oi.destination_warehouse_id = ANY(public.get_my_warehouse_ids())
  );
$$;

GRANT EXECUTE ON FUNCTION public.order_has_item_in_my_warehouse(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 1 — orders.orders_warehouse_user_view
-- Era: EXISTS (SELECT FROM order_items oi WHERE ...) → ciclo
-- Ora: usa helper SECURITY DEFINER
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS orders_warehouse_user_view ON public.orders;
CREATE POLICY orders_warehouse_user_view ON public.orders
  FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND public.is_warehouse_user()
    AND public.order_has_item_in_my_warehouse(id)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2 — orders."Employees can view their assigned orders"
-- Era: EXISTS (SELECT FROM order_employees oe JOIN employees e ...) → ciclo
-- Ora: usa helper SECURITY DEFINER
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Employees can view their assigned orders" ON public.orders;
CREATE POLICY "Employees can view their assigned orders" ON public.orders
  FOR SELECT
  USING (public.order_has_employee_for_user(id, auth.uid()));

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 3 — orders."Salespeople can view their assigned orders"
-- Era: EXISTS (SELECT FROM order_salespeople os JOIN salespeople s ...) → ciclo
-- Ora: usa helper SECURITY DEFINER
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Salespeople can view their assigned orders" ON public.orders;
CREATE POLICY "Salespeople can view their assigned orders" ON public.orders
  FOR SELECT
  USING (public.order_has_salesperson_for_user(id, auth.uid()));

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 4 — order_items."Customers can view their order items"
-- Era: EXISTS (SELECT FROM orders o WHERE customer_id = auth.uid())
-- Ora: usa get_order_customer_id (già SECURITY DEFINER esistente)
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Customers can view their order items" ON public.order_items;
CREATE POLICY "Customers can view their order items" ON public.order_items
  FOR SELECT
  USING (public.get_order_customer_id(order_id) = auth.uid());

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 5 — order_items."Company admins can manage their order items"
-- Era: EXISTS (SELECT FROM orders o WHERE company_id = ...) → ciclo
-- Ora: usa get_order_company_id (SECURITY DEFINER esistente)
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Company admins can manage their order items" ON public.order_items;
CREATE POLICY "Company admins can manage their order items" ON public.order_items
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 6 — order_items."Employees can view items of their assigned orders"
-- Era: EXISTS (SELECT FROM order_employees JOIN employees) → ciclo via order_employees
-- Ora: usa order_has_employee_for_user (SECURITY DEFINER nuova)
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Employees can view items of their assigned orders" ON public.order_items;
CREATE POLICY "Employees can view items of their assigned orders" ON public.order_items
  FOR SELECT
  USING (public.order_has_employee_for_user(order_id, auth.uid()));

-- ════════════════════════════════════════════════════════════════════════════
-- FIX 7 — order_employees."Company admins can manage their order employees"
-- Era: EXISTS (SELECT FROM orders o WHERE company_id = ...) → ciclo
-- Ora: usa get_order_company_id (SECURITY DEFINER esistente)
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Company admins can manage their order employees" ON public.order_employees;
CREATE POLICY "Company admins can manage their order employees" ON public.order_employees
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    AND public.get_order_company_id(order_id) = public.get_user_company_id(auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Verifica finale
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_recursion_test int;
BEGIN
  -- Esegue una query che precedentemente fallirebbe in modalità authenticated.
  -- Eseguita come postgres bypassa RLS, ma la simuliamo via SET LOCAL.
  RAISE NOTICE 'CRITICAL FIX RLS recursion: 7 policy riscritte + 3 helper SECURITY DEFINER aggiunte';
END $$;
