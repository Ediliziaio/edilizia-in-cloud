-- ════════════════════════════════════════════════════════════════════════════
-- Magazzino di competenza sulla commessa
-- ════════════════════════════════════════════════════════════════════════════
-- In "Nuova Commessa" il selettore "Magazzino Destinazione Materiali" esisteva
-- già, ma la colonna su `orders` NO e la RPC create_order_atomic non la
-- gestiva: quello che l'utente sceglieva si perdeva in silenzio. Verificato
-- prima del fix: zero righe valorizzate in tutta la piattaforma, né su orders
-- né su order_items.
--
-- Serve anche alla visibilità: chi gestisce un magazzino deve vedere le
-- commesse di quel magazzino. Finora l'unico aggancio era riga per riga
-- (order_items.destination_warehouse_id), quindi bastava una riga senza
-- magazzino perché la commessa sparisse dal suo elenco.
--
-- La colonna si popola dal frontend con un UPDATE follow-up (stesso trattamento
-- di sede_id: la RPC atomica ha una whitelist e non le include).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS destination_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.destination_warehouse_id IS
  'Magazzino di competenza della commessa: dove arriva la merce e, di conseguenza, chi la gestisce. Alimenta la visibilità per magazzino.';

CREATE INDEX IF NOT EXISTS orders_destination_warehouse_idx
  ON public.orders (destination_warehouse_id) WHERE destination_warehouse_id IS NOT NULL;

-- Backfill dal magazzino più usato fra le righe della commessa (a oggi nessuna
-- riga è valorizzata, ma la migration deve reggere anche su basi già popolate).
WITH per_ordine AS (
  SELECT DISTINCT ON (oi.order_id)
         oi.order_id, oi.destination_warehouse_id, count(*) AS n
  FROM public.order_items oi
  WHERE oi.destination_warehouse_id IS NOT NULL
  GROUP BY oi.order_id, oi.destination_warehouse_id
  ORDER BY oi.order_id, n DESC, oi.destination_warehouse_id
)
UPDATE public.orders o
SET destination_warehouse_id = p.destination_warehouse_id
FROM per_ordine p
WHERE o.id = p.order_id AND o.destination_warehouse_id IS NULL;

-- La commessa è "del mio magazzino" se lo dice la commessa stessa OPPURE una
-- sua riga merce. Prima contavano solo le righe.
CREATE OR REPLACE FUNCTION public.order_has_item_in_my_warehouse(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _order_id
      AND o.destination_warehouse_id = ANY(public.get_my_warehouse_ids())
  )
  OR EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = _order_id
      AND oi.destination_warehouse_id = ANY(public.get_my_warehouse_ids())
  );
$function$;
