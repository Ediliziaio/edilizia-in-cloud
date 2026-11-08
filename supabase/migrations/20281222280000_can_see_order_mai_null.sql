-- can_see_order non restituisce mai NULL (08/11/2026).
--
-- Per chi vede solo le commesse assegnate finiva con RETURN _assigned_to = _uid:
-- su una commessa senza incaricato il risultato è NULL, non false. Nei filtri e
-- nelle policy NULL vale «no», ma in plpgsql `IF NOT can_see_order(...)` non
-- scatta, e la guardia lasciava passare. Erano così delete_order_cascading,
-- assegna_alle_fasi, togli_assegnazione, materiale_rientro_magazzino,
-- riclassifica_righe_storiche, silvio_volo_della_commessa e _silvio_volo.
-- Corretto alla radice: una sola riga, per le funzioni di oggi e per quelle future.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.can_see_order(_order_id uuid, _assigned_to uuid, _warehouse_id uuid DEFAULT NULL::uuid)
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
  -- Amministratore dell'azienda in cui si lavora (26/09/2026: prima bastava il
  -- ruolo, di un'azienda qualsiasi).
  IF has_role(_uid, 'super_admin'::app_role)
     OR public.e_amministratore_di(public.get_effective_company_id()) THEN
    RETURN true;
  END IF;

  SELECT bool_or(only_assigned), bool_or(only_my_warehouse)
    INTO _only_assigned, _only_warehouse
  FROM public.staff_permissions
  WHERE user_id = _uid
    AND company_id = public.get_effective_company_id();

  IF COALESCE(_only_assigned, false) THEN
    -- Senza incaricato il confronto dà NULL: deve essere un no.
    RETURN COALESCE(_assigned_to = _uid, false);
  END IF;

  IF COALESCE(_only_warehouse, false) THEN
    -- Prima le verifiche a costo zero, la scansione righe solo se serve.
    IF _assigned_to = _uid THEN RETURN true; END IF;
    IF _warehouse_id IS NOT NULL
       AND _warehouse_id = ANY(public.get_my_warehouse_ids()) THEN RETURN true; END IF;
    RETURN COALESCE(public.order_has_item_in_my_warehouse(_order_id), false);
  END IF;

  RETURN true;
END;
$function$;
