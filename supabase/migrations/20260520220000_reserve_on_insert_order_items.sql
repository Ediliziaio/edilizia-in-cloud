-- ─────────────────────────────────────────────────────────────────────────────
-- Reservation trigger su INSERT order_items (oltre all'UPDATE esistente)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Contesto: la funzione `trigger_update_stock_reservation` esiste da 2026-03-11
-- e gestisce correttamente il delta di `warehouse_stock.quantity_reserved`
-- quando lo status di una riga ordine passa a/da 'prenotato'.
--
-- Tuttavia il trigger associato era SOLO `AFTER UPDATE OF status, stock_item_id`.
-- Risultato: se l'utente CREA una riga ordine con `status='prenotato'` direttamente
-- (es. da OrderDetail.addItemMutation), la reservation NON parte. La riga arriva
-- al magazzino come "ordinata" ma le `stock_units` restano `available` e
-- `warehouse_stock.quantity_reserved` non viene incrementato.
--
-- Conseguenza pratica: due commesse possono "prenotare" la stessa unità di
-- stock perché il counter di disponibilità non vede mai la prima riservazione.
--
-- Fix additivo: aggiungiamo un trigger AFTER INSERT che chiama la stessa
-- funzione. La funzione gestisce gia il caso `OLD IS NULL` (perche su INSERT
-- OLD non esiste in plpgsql AFTER trigger — la logica esistente controlla
-- `OLD.status <> 'prenotato' OR OLD.stock_item_id IS NULL` che e false-y a
-- runtime su NULL). Per sicurezza creiamo una variante esplicita.
--
-- Backward compat: la logica UPDATE esistente non viene toccata. Nessun
-- dato esistente viene modificato (il trigger fires solo su INSERT futuri).
-- ─────────────────────────────────────────────────────────────────────────────

-- Variante INSERT-only della reservation function (la UPDATE ha condizioni
-- delta che non si applicano qui).
CREATE OR REPLACE FUNCTION public.trigger_reserve_on_insert_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stock_item_id IS NOT NULL
     AND NEW.status = 'prenotato'
     AND COALESCE(NEW.quantity, 0) > 0
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = quantity_reserved + NEW.quantity,
           updated_at = NOW()
     WHERE id = NEW.stock_item_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger AFTER INSERT (idempotente)
DROP TRIGGER IF EXISTS reserve_stock_on_insert_order_item ON public.order_items;
CREATE TRIGGER reserve_stock_on_insert_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_reserve_on_insert_order_item();

-- ─── Trigger AFTER DELETE: rilascia la reservation se la riga prenotata
-- viene cancellata senza prima passare dallo status 'prenotato' -> altro
-- (es. cancellazione diretta da admin/super_admin). ───────────────────────

CREATE OR REPLACE FUNCTION public.trigger_release_on_delete_order_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stock_item_id IS NOT NULL
     AND OLD.status = 'prenotato'
     AND COALESCE(OLD.quantity, 0) > 0
  THEN
    UPDATE public.warehouse_stock
       SET quantity_reserved = GREATEST(0, quantity_reserved - OLD.quantity),
           updated_at = NOW()
     WHERE id = OLD.stock_item_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS release_stock_on_delete_order_item ON public.order_items;
CREATE TRIGGER release_stock_on_delete_order_item
  AFTER DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_release_on_delete_order_item();

COMMENT ON FUNCTION public.trigger_reserve_on_insert_order_item() IS
  'Riserva automaticamente la quantita su warehouse_stock quando una nuova riga ordine viene creata con status=prenotato. Pair con trigger_update_stock_reservation (per UPDATE) e trigger_release_on_delete_order_item (per DELETE).';

COMMENT ON FUNCTION public.trigger_release_on_delete_order_item() IS
  'Rilascia la reservation su warehouse_stock quando una riga ordine prenotata viene cancellata.';
