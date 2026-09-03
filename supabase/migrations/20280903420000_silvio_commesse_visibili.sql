-- ════════════════════════════════════════════════════════════════════════════
-- Anche Silvio rispetta "vede solo le sue" e "solo quelle del suo magazzino"
-- ════════════════════════════════════════════════════════════════════════════
-- Le RPC di Silvio girano in SECURITY DEFINER: vedono tutta l'azienda per
-- costruzione, quindi le policy di riga su `orders` non le sfiorano. Finche' il
-- permesso e' "vedi l'area oppure no" il filtro per dominio basta; per la
-- visibilita' per riga no.
--
-- Misurato in produzione prima del fix: tre persone con only_assigned = true e
-- ZERO commesse assegnate. Nell'applicativo ne vedevano 0 — giusto, e' il fix
-- del 3 settembre. A Silvio bastava chiedere "elencami i cantieri" per averne
-- 65 su 65, con nome cliente e importi.
--
-- can_see_order() e get_my_warehouse_ids() leggono auth.uid(), che dalle edge
-- function (service_role) e' NULL: non sono riusabili da li'. Questa e' la
-- stessa regola con l'utente passato per argomento, cosi' la visibilita' di
-- Silvio resta agganciata a quella dell'applicativo invece di essere una copia
-- che prima o poi diverge. Precedenza alla piu' stretta, come nell'originale.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_commesse_visibili(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS TABLE (id uuid, order_code text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _only_assigned boolean;
  _only_warehouse boolean;
  _magazzini uuid[];
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT sp.only_assigned, sp.only_my_warehouse
    INTO _only_assigned, _only_warehouse
  FROM public.staff_permissions sp
  WHERE sp.user_id = p_user_id AND sp.company_id = p_company_id;

  -- La piu' stretta vince.
  IF COALESCE(_only_assigned, false) THEN
    RETURN QUERY
      SELECT o.id, o.order_code FROM public.orders o
      WHERE o.company_id = p_company_id AND o.assigned_to = p_user_id;
    RETURN;
  END IF;

  IF COALESCE(_only_warehouse, false) THEN
    SELECT COALESCE(array_agg(wa.warehouse_id), ARRAY[]::uuid[])
      INTO _magazzini
    FROM public.warehouse_assignments wa
    WHERE wa.user_id = p_user_id AND wa.active = true;

    -- Le commesse assegnate personalmente restano sempre visibili anche se di
    -- un altro magazzino: nascondere a qualcuno il lavoro che gli hai dato tu
    -- sarebbe solo una sorpresa sgradevole.
    RETURN QUERY
      SELECT o.id, o.order_code FROM public.orders o
      WHERE o.company_id = p_company_id
        AND (
          o.assigned_to = p_user_id
          OR o.destination_warehouse_id = ANY(_magazzini)
          OR EXISTS (
            SELECT 1 FROM public.order_items oi
            WHERE oi.order_id = o.id AND oi.destination_warehouse_id = ANY(_magazzini)
          )
        );
    RETURN;
  END IF;

  RETURN QUERY
    SELECT o.id, o.order_code FROM public.orders o WHERE o.company_id = p_company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.silvio_commesse_visibili(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_commesse_visibili(uuid, uuid) TO service_role;
