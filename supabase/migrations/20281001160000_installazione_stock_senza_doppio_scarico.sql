-- Installation must not charge stock already withdrawn for the same line.
-- No historical data rewrite: ambiguous unallocated movements require review.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.trg_auto_deduct_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_stock public.warehouse_stock%ROWTYPE;
  v_company uuid;
  v_used numeric := 0;
  v_remaining numeric;
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.orders WHERE id=NEW.order_id;
    SELECT * INTO v_stock FROM public.warehouse_stock
      WHERE id=NEW.stock_item_id AND company_id=v_company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Articolo di magazzino non valido per questa commessa'; END IF;
    IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity<>trunc(NEW.quantity) THEN
      RAISE EXCEPTION 'Verifica la quantità: lo scarico automatico richiede unità intere positive';
    END IF;
    IF EXISTS (SELECT 1 FROM public.warehouse_movements
      WHERE stock_item_id=NEW.stock_item_id AND order_id=NEW.order_id
        AND company_id=v_company AND order_item_id IS NULL
        AND movement_type IN ('scarico','carico')) THEN
      RAISE EXCEPTION 'Materiale già movimentato per la commessa: collega i movimenti alla riga articolo prima di installare, per evitare un doppio scarico';
    END IF;
    SELECT coalesce(sum(CASE movement_type WHEN 'scarico' THEN quantity
                     WHEN 'carico' THEN -quantity ELSE 0 END),0)
      INTO v_used FROM public.warehouse_movements
      WHERE stock_item_id=NEW.stock_item_id AND order_id=NEW.order_id
        AND company_id=v_company AND order_item_id=NEW.id;
    v_remaining := greatest(NEW.quantity-greatest(v_used,0),0);
    IF v_remaining>0 THEN
      IF v_stock.quantity<v_remaining THEN
        RAISE EXCEPTION 'Giacenza insufficiente: disponibili %, da scaricare %', v_stock.quantity,v_remaining;
      END IF;
      UPDATE public.warehouse_stock SET quantity=quantity-v_remaining,updated_at=now()
        WHERE id=NEW.stock_item_id AND company_id=v_company;
      INSERT INTO public.warehouse_movements
        (stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,order_id,company_id,warehouse_id,unit_cost)
      VALUES (NEW.stock_item_id,NEW.id,'scarico',v_remaining,'Scarico residuo automatico a installazione',
        auth.uid(),NEW.order_id,v_company,v_stock.warehouse_id,v_stock.unit_cost);
    END IF;
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$function$;
COMMIT;
