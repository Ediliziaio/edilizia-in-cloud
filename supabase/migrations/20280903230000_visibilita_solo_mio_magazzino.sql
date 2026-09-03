-- ════════════════════════════════════════════════════════════════════════════
-- Terza modalità di visibilità sulle commesse: "solo il mio magazzino"
-- ════════════════════════════════════════════════════════════════════════════
-- Finora esistevano due sole modalità: tutte le commesse dell'azienda, oppure
-- solo quelle assegnate personalmente. Al capo-magazzino di una filiale non
-- basta né l'una né l'altra: gli servono TUTTE le commesse del suo magazzino,
-- comprese quelle in mano ai colleghi della sua filiale, e nessuna delle altre.
--
-- Precedenza: only_assigned è la più stretta e vince se accese entrambe.
-- Le commesse assegnate personalmente restano SEMPRE visibili anche se di un
-- altro magazzino: nascondere a qualcuno il lavoro che gli hai dato tu sarebbe
-- solo una sorpresa sgradevole.
--
-- Misurato in prod (e rollbackato) su 65 commesse, stesso utente:
--   nessun limite 65 · solo le mie 2 · solo il mio magazzino 3
-- dove le 3 sono le 2 del suo magazzino (inclusa quella di un collega) più la
-- propria che sta in un altro magazzino.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS only_my_warehouse boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff_permissions.only_my_warehouse IS
  'Vede tutte e sole le commesse dei magazzini a cui è assegnato (più le proprie). Ignorato se only_assigned è attivo, che è più stretto.';

-- Guardia unica per le commesse: sa anche DI QUALE commessa si parla, cosa che
-- check_staff_visibility (che riceve solo l'assegnatario) non può sapere.
CREATE OR REPLACE FUNCTION public.can_see_order(_order_id uuid, _assigned_to uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _only_assigned boolean;
  _only_warehouse boolean;
BEGIN
  IF has_role(_uid, 'super_admin'::app_role) OR has_role(_uid, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  SELECT only_assigned, only_my_warehouse
    INTO _only_assigned, _only_warehouse
  FROM public.staff_permissions
  WHERE user_id = _uid;

  -- La più stretta vince.
  IF COALESCE(_only_assigned, false) THEN
    RETURN _assigned_to = _uid;
  END IF;

  IF COALESCE(_only_warehouse, false) THEN
    RETURN _assigned_to = _uid OR public.order_has_item_in_my_warehouse(_order_id);
  END IF;

  RETURN true;
END;
$function$;

DROP POLICY IF EXISTS "Staff can view orders if permitted" ON public.orders;
CREATE POLICY "Staff can view orders if permitted"
  ON public.orders FOR SELECT TO authenticated
  USING (
    has_permission((SELECT auth.uid()), 'can_view_orders')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND can_see_order(id, assigned_to)
  );

DROP POLICY IF EXISTS "Staff can manage orders if permitted" ON public.orders;
CREATE POLICY "Staff can manage orders if permitted"
  ON public.orders FOR ALL TO authenticated
  USING (
    has_permission((SELECT auth.uid()), 'can_edit_orders')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND can_see_order(id, assigned_to)
  )
  WITH CHECK (
    has_permission((SELECT auth.uid()), 'can_edit_orders')
    AND company_id = get_user_company_id((SELECT auth.uid()))
    AND can_see_order(id, assigned_to)
  );

DROP POLICY IF EXISTS "orders_warehouse_user_view" ON public.orders;
CREATE POLICY "orders_warehouse_user_view"
  ON public.orders FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND is_warehouse_user()
    AND order_has_item_in_my_warehouse(id)
    AND can_see_order(id, assigned_to)
  );
