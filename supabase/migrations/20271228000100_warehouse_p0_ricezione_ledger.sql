-- ============================================================================
-- Magazzino — P0 ricezione DDT + riconciliazione LEDGER (applicato live, no db push)
-- ============================================================================

-- ── P0 — RPC mancanti sul live (migration 20260921000004 mai applicata) ──────
-- insert_goods_receipt_atomic + set_default_warehouse NON esistevano → ricezione
-- via DDT e "magazzino di default" fallivano ("Could not find function").
-- Riapplicate CON 2 FIX rispetto all'originale:
--   1) insert_goods_receipt_atomic derivava la company da order_items.company_id
--      (colonna INESISTENTE → runtime error): ora via order_id → orders.company_id.
--   2) quantity_received: `= p_quantity_received` → `= COALESCE(...,0) + p_...`
--      (consegne parziali multiple non si sovrascrivono più).
-- (Corpi completi applicati live via execute_sql; REVOKE anon/PUBLIC + GRANT
--  authenticated,service_role.)

-- ── P2 — Riconciliazione LEDGER movimenti ↔ giacenza ─────────────────────────
-- warehouse_stock.quantity ≠ SUM(carico−scarico) per 75/84 articoli (72 creati
-- con giacenza iniziale ma SENZA movimento: StockItemDialog/CSVImport/
-- ManualArticleAdder/CaricoRapido/LowStockReorder impostano quantity senza scrivere
-- il movimento). Backfill one-time (movimento di rettifica per il delta, con
-- automazione movimenti sospesa per non generare eventi spuri) → 0 disallineati.
-- I movimenti NON toccano la giacenza (nessun trigger su warehouse_movements lo fa).

-- Prevenzione derive future: constraint trigger DEFERRED — a fine transazione, se
-- un articolo ha giacenza ma nessun movimento, scrive il carico iniziale. I
-- percorsi transfer/receipt hanno già scritto il loro movimento → l'EXISTS li
-- salta (niente doppioni), ed è deferred proprio per vederli al commit.
CREATE OR REPLACE FUNCTION public.warehouse_stock_ensure_initial_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_qty numeric; v_wh uuid; v_company uuid; v_user uuid;
BEGIN
  SELECT quantity, warehouse_id, company_id INTO v_qty, v_wh, v_company FROM public.warehouse_stock WHERE id = NEW.id;
  IF v_qty IS NULL OR v_qty <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.warehouse_movements WHERE stock_item_id = NEW.id) THEN RETURN NULL; END IF;
  v_user := COALESCE(auth.uid(), (SELECT user_id FROM public.user_roles WHERE company_id = v_company LIMIT 1));
  IF v_user IS NULL THEN RETURN NULL; END IF;
  BEGIN
    INSERT INTO public.warehouse_movements(stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id)
    VALUES (NEW.id, 'carico', v_qty::integer, 'Carico iniziale (giacenza di partenza)', v_user, v_company, v_wh);
  EXCEPTION WHEN OTHERS THEN RAISE LOG 'ensure_initial_movement: %', SQLERRM; END;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_wh_stock_initial_movement ON public.warehouse_stock;
CREATE CONSTRAINT TRIGGER trg_wh_stock_initial_movement
  AFTER INSERT ON public.warehouse_stock DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.warehouse_stock_ensure_initial_movement();
