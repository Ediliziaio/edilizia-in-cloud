-- Scorte sotto minimo: l'avviso è morto da quando le quantità hanno i decimali.
--
-- `get_low_stock_alerts` dichiara `quantity`, `quantity_reserved`, `quantity_available` e
-- `deficit` come `integer`, ma su `warehouse_stock` quelle colonne sono `numeric` da quando
-- il fabbisogno acquisti ha accettato le quantità decimali (07/11/2026). Postgres non adatta
-- il tipo di ritorno di una funzione: alla prima riga solleva 42804 «structure of query does
-- not match function result type» e la chiamata fallisce sempre, per tutte le aziende.
--
-- A schermo non si vede un errore ma un elenco vuoto: «nessun articolo sotto scorta», che è
-- la risposta più rassicurante e più sbagliata. Tre punti la chiamano: il riquadro del
-- magazzino, il riepilogo live e la finestra di riordino. 112 chiamate fallite fra il 25 e il 26/11.
--
-- Il tipo di ritorno non si cambia con CREATE OR REPLACE: la funzione va eliminata e rifatta.
-- Il corpo resta identico, cambiano solo i tipi dichiarati; `min_stock_level` è ancora integer
-- perché la soglia la scrive una persona, non una misura.

DROP FUNCTION IF EXISTS public.get_low_stock_alerts(uuid);

CREATE FUNCTION public.get_low_stock_alerts(p_company_id uuid)
RETURNS TABLE(
  stock_item_id uuid, name text, quantity numeric, quantity_reserved numeric,
  quantity_available numeric, min_stock_level integer, deficit numeric,
  supplier_name text, section_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT ws.id, ws.name, ws.quantity, ws.quantity_reserved, ws.quantity_available, ws.min_stock_level,
    (ws.min_stock_level - ws.quantity_available), s.name, wsc.name
  FROM warehouse_stock ws LEFT JOIN suppliers s ON s.id = ws.supplier_id LEFT JOIN warehouse_sections wsc ON wsc.id = ws.section_id
  WHERE ws.company_id = p_company_id AND ws.min_stock_level > 0 AND ws.quantity_available < ws.min_stock_level
  ORDER BY (ws.min_stock_level - ws.quantity_available) DESC;
END;
$function$;

-- Gli stessi permessi di prima: chiusa a PUBLIC e ad anon, aperta a chi ha una sessione.
REVOKE ALL ON FUNCTION public.get_low_stock_alerts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_low_stock_alerts(uuid) TO authenticated, service_role;
