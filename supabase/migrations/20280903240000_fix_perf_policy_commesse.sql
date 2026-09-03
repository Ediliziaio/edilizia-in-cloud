-- ════════════════════════════════════════════════════════════════════════════
-- Correzione di un errore mio + una zavorra che era lì da prima
-- ════════════════════════════════════════════════════════════════════════════
-- Audit sulle modifiche di oggi. Contare 385 commesse come admin costava
-- ~476 ms contro i 2,3 ms della stessa count senza RLS. Misurando funzione per
-- funzione sono usciti due colpevoli:
--
-- 1) MIO. `order_has_item_in_my_warehouse` costava 112 ms (dieci volte ogni
--    altra funzione): chiamava `get_my_warehouse_ids()` DUE volte per riga,
--    faceva una EXISTS su `orders` da dentro una policy DI `orders` — inutile,
--    la policy ha già la colonna sotto mano — e non usciva subito per chi non
--    ha nemmeno un magazzino assegnato (cioè, oggi, tutti). Ora: magazzini
--    letti una volta, uscita immediata se sono zero, e la colonna della
--    commessa la passa chi chiama. Da 112 ms a 11.
--
-- 2) PREESISTENTE. `get_my_company_id()` costava 244 ms perché valutata riga
--    per riga: dentro fa fino a tre sottoquery (active_impersonations,
--    active_company_selection con un EXISTS su multi_company_access, profiles).
--    Ma il risultato dipende solo da CHI guarda, non dalla riga. Avvolta in
--    `(SELECT ...)` Postgres la calcola una volta sola come InitPlan — lo
--    stesso motivo per cui in questo schema si scrive già `(SELECT auth.uid())`
--    dappertutto. Stesso trattamento per has_permission, get_user_company_id,
--    is_warehouse_user e get_my_warehouse_ids.
--
-- Risultato misurato: da ~450 ms a ~37 ms, a parità di righe viste (385/385
-- per gli admin) e con le tre modalità di visibilità invariate (65 / 2 / 3).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.order_has_item_in_my_warehouse(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
COST 500
AS $function$
DECLARE
  _miei uuid[];
BEGIN
  _miei := public.get_my_warehouse_ids();
  -- Nessun magazzino assegnato: niente da controllare, si esce subito.
  IF _miei IS NULL OR array_length(_miei, 1) IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = _order_id
      AND oi.destination_warehouse_id = ANY(_miei)
  );
END;
$function$;

-- Le policy dipendono dalla vecchia firma a 2 argomenti: vanno tolte prima.
DROP POLICY IF EXISTS "Staff can view orders if permitted" ON public.orders;
DROP POLICY IF EXISTS "Staff can manage orders if permitted" ON public.orders;
DROP POLICY IF EXISTS "orders_warehouse_user_view" ON public.orders;
DROP FUNCTION IF EXISTS public.can_see_order(uuid, uuid);

CREATE OR REPLACE FUNCTION public.can_see_order(
  _order_id uuid,
  _assigned_to uuid,
  _warehouse_id uuid DEFAULT NULL
)
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
    -- Prima le verifiche a costo zero, la scansione delle righe solo se serve.
    IF _assigned_to = _uid THEN RETURN true; END IF;
    IF _warehouse_id IS NOT NULL
       AND _warehouse_id = ANY(public.get_my_warehouse_ids()) THEN RETURN true; END IF;
    RETURN public.order_has_item_in_my_warehouse(_order_id);
  END IF;

  RETURN true;
END;
$function$;

-- Nelle policy: fra parentesi tonde tutto ciò che NON dipende dalla riga.
-- Per l'array serve `IN (SELECT unnest(...))`: `= ANY((SELECT f()))` non
-- compila, perché una sottoquery è un insieme di righe e non un array.
CREATE POLICY "Staff can view orders if permitted"
  ON public.orders FOR SELECT TO authenticated
  USING (
    (SELECT has_permission((SELECT auth.uid()), 'can_view_orders'))
    AND company_id = (SELECT get_user_company_id((SELECT auth.uid())))
    AND can_see_order(id, assigned_to, destination_warehouse_id)
  );

CREATE POLICY "Staff can manage orders if permitted"
  ON public.orders FOR ALL TO authenticated
  USING (
    (SELECT has_permission((SELECT auth.uid()), 'can_edit_orders'))
    AND company_id = (SELECT get_user_company_id((SELECT auth.uid())))
    AND can_see_order(id, assigned_to, destination_warehouse_id)
  )
  WITH CHECK (
    (SELECT has_permission((SELECT auth.uid()), 'can_edit_orders'))
    AND company_id = (SELECT get_user_company_id((SELECT auth.uid())))
    AND can_see_order(id, assigned_to, destination_warehouse_id)
  );

CREATE POLICY "orders_warehouse_user_view"
  ON public.orders FOR SELECT TO authenticated
  USING (
    company_id = (SELECT get_my_company_id())
    AND (SELECT is_warehouse_user())
    AND (
      destination_warehouse_id IN (SELECT unnest(get_my_warehouse_ids()))
      OR order_has_item_in_my_warehouse(id)
    )
    AND can_see_order(id, assigned_to, destination_warehouse_id)
  );
