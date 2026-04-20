-- ============================================================
-- Migration: helper functions per visibilità referenti (additiva)
--
-- NOTA: la funzione `public.get_my_warehouse_ids()` esiste già in DB ed
-- è utilizzata da policy RLS su tabelle come warehouse_stock,
-- warehouse_movements, goods_receipts, ddt_ricezione, shipments_to_site,
-- warehouse_transfers, purchase_orders, orders, order_items.
-- Questa migration NON la modifica.
--
-- Aggiungiamo invece due helper complementari usati dal frontend per:
--   - `is_warehouse_referente(user_id, warehouse_id) -> bool`: check puntuale
--   - `get_my_primary_warehouse() -> uuid`: primo magazzino "principale"
--     di cui l'utente corrente è referente
--
-- Il filtro avviene via employees.user_id = auth.uid() e solo per employee
-- attivi. I subappaltatori non sono utenti loggati quindi non appaiono qui.
-- ============================================================

-- Drop idempotente (nel caso venga riapplicata)
DROP FUNCTION IF EXISTS public.is_warehouse_referente(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_my_primary_warehouse();

-- 1) is_warehouse_referente: true se p_user_id è referente di p_warehouse_id
CREATE FUNCTION public.is_warehouse_referente(
  p_user_id uuid,
  p_warehouse_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.warehouse_referenti wr
    JOIN public.employees e ON e.id = wr.employee_id
    WHERE wr.warehouse_id = p_warehouse_id
      AND e.user_id = p_user_id
      AND e.is_active = true
  );
$$;

COMMENT ON FUNCTION public.is_warehouse_referente(uuid, uuid) IS
  'True se p_user_id è referente del magazzino p_warehouse_id (via employees.user_id).';

-- 2) get_my_primary_warehouse: primo magazzino "principale" di cui l''utente è referente
CREATE FUNCTION public.get_my_primary_warehouse()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT wr.warehouse_id
  FROM public.warehouse_referenti wr
  JOIN public.employees e ON e.id = wr.employee_id
  WHERE e.user_id = auth.uid()
    AND e.is_active = true
    AND wr.is_primary = true
  ORDER BY wr.created_at ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_primary_warehouse() IS
  'Primo magazzino dove l''utente corrente è referente principale (NULL se nessuno).';

-- Grants
GRANT EXECUTE ON FUNCTION public.is_warehouse_referente(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_primary_warehouse() TO authenticated;
