BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- Le policy storiche confrontavano la commessa con profiles.company_id,
-- anche quando has_permission stava già leggendo i permessi dell'azienda
-- selezionata. Il contesto effettivo valida gli accessi multi-azienda attivi.
-- Ogni operazione resta subordinata al proprio permesso, inclusa la cancellazione.
DROP POLICY IF EXISTS commesse_azienda_corrente_select ON public.orders;
CREATE POLICY commesse_azienda_corrente_select ON public.orders FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_my_company_id())
  AND (SELECT public.has_permission((SELECT auth.uid()),'can_view_orders'))
  AND public.can_see_order(id,assigned_to,destination_warehouse_id)
);
DROP POLICY IF EXISTS commesse_azienda_corrente_insert ON public.orders;
CREATE POLICY commesse_azienda_corrente_insert ON public.orders FOR INSERT TO authenticated
WITH CHECK (
  company_id = (SELECT public.get_my_company_id())
  AND (SELECT public.has_permission((SELECT auth.uid()),'can_edit_orders'))
  AND public.can_see_order(id,assigned_to,destination_warehouse_id)
);
DROP POLICY IF EXISTS commesse_azienda_corrente_update ON public.orders;
CREATE POLICY commesse_azienda_corrente_update ON public.orders FOR UPDATE TO authenticated
USING (
  company_id = (SELECT public.get_my_company_id())
  AND (SELECT public.has_permission((SELECT auth.uid()),'can_edit_orders'))
  AND public.can_see_order(id,assigned_to,destination_warehouse_id)
)
WITH CHECK (
  company_id = (SELECT public.get_my_company_id())
  AND (SELECT public.has_permission((SELECT auth.uid()),'can_edit_orders'))
  AND public.can_see_order(id,assigned_to,destination_warehouse_id)
);
DROP POLICY IF EXISTS commesse_azienda_corrente_delete ON public.orders;
CREATE POLICY commesse_azienda_corrente_delete ON public.orders FOR DELETE TO authenticated
USING (
  company_id = (SELECT public.get_my_company_id())
  AND (SELECT public.has_permission((SELECT auth.uid()),'can_delete_orders'))
  AND public.can_see_order(id,assigned_to,destination_warehouse_id)
);
COMMIT;
