-- ============================================================================
-- AUDIT Magazzino ↔ Ordini d'Acquisto ↔ Commesse
-- Applicato LIVE via execute_sql (no db push). Source of truth.
-- ============================================================================

-- ── P1b — warehouse_stock: trigger duplicato 3× → automazioni interne in triplice
-- Tre trigger identici (ia_warehouse_stock, internal_auto_warehouse_stock,
-- trg_internal_auto_stock_events) chiamavano tutti trigger_internal_auto_stock_events
-- → ogni variazione di giacenza avviava 3 esecuzioni dello stesso flow (es. 3 email
-- di riordino). Ne resta UNO (trg_internal_auto_stock_events).
DROP TRIGGER IF EXISTS ia_warehouse_stock ON public.warehouse_stock;
DROP TRIGGER IF EXISTS internal_auto_warehouse_stock ON public.warehouse_stock;

-- ── P3 igiene — REVOKE anon/PUBLIC sulle RPC magazzino SECURITY DEFINER
-- (si auto-difendono con auth.uid()/assert_company_access, ma non devono essere
-- chiamabili senza login). Applicato via loop su:
--   create_ddt_from_uscita, receive_from_oda_via_scans, register_warehouse_uscita,
--   warehouse_scan_lookup, get_low_stock_alerts → REVOKE anon,PUBLIC + GRANT
--   authenticated,service_role.

-- ── P1c — register_warehouse_uscita: guardia disponibilità
-- Faceva UPDATE warehouse_stock SET quantity = GREATEST(0, quantity - v_qty) ma
-- inseriva comunque il movimento 'scarico' con v_qty piena → se v_qty > giacenza,
-- stock clampato a 0 ma ledger con scarico maggiore → warehouse_stock ≠ somma
-- movimenti. Ora: fetch della quantity nella SELECT + guardia
--   IF COALESCE(v_current_qty,0) < v_qty THEN (errore 'insufficient_stock' + CONTINUE)
-- prima di registrare movimento/scarico. (Corpo completo applicato live.)

-- ── P1c — receive_from_oda_via_scans: cap sul residuo ordinato
-- Faceva quantity_received = quantity_received + v_qty senza cap su quantity → una
-- ricezione (o retry) poteva superare l'ordinato e caricare stock fantasma. Ora,
-- quando la riga scan è collegata a un oda_item, calcola il residuo
--   (quantity - quantity_received) e applica v_qty := LEAST(v_qty, residuo)
-- (salta con 'already_fully_received' se residuo <= 0). (Corpo completo live.)

-- NB: register_warehouse_uscita e receive_from_oda_via_scans sono state riscritte
-- interamente via CREATE OR REPLACE (corpo lungo) — qui il changelog. Le due RPC
-- P0 MANCANTI sul live (insert_goods_receipt_atomic, set_default_warehouse) e la
-- non-idempotenza/atomicità del carico-stock in usePurchaseOrders sono documentate
-- come FOLLOW-UP (richiedono una RPC atomica dedicata).
