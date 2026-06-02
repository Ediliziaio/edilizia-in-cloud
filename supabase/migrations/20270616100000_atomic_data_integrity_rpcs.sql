-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ DATA-INTEGRITY: rendi atomiche 3 operazioni multi-write                ║
-- ║                                                                         ║
-- ║ Audit ha rilevato 3 operazioni che facevano più write SENZA            ║
-- ║ transazione né rollback: se un passo intermedio falliva, lo stato      ║
-- ║ restava corrotto (giacenze sparite, commessa svuotata a metà,          ║
-- ║ rettifica clobbering di scarichi/carichi concorrenti).                 ║
-- ║                                                                         ║
-- ║ Soluzione: 3 funzioni SECURITY DEFINER plpgsql. Ogni funzione gira     ║
-- ║ in una singola transazione → o tutto o niente. Company scoping         ║
-- ║ esplicito (RLS è bypassata da SECURITY DEFINER) con supporto           ║
-- ║ impersonation super_admin. Math giacenze RELATIVA (quantity ± delta)   ║
-- ║ con lock di riga FOR UPDATE → niente lost-update / clobber.            ║
-- ║                                                                         ║
-- ║ Convenzioni: get_my_company_id() / has_role() come le altre RPC        ║
-- ║ atomiche (create_shipment_atomic, create_order_atomic).                ║
-- ║                                                                         ║
-- ║ NB: il trigger validate_movement_type ammette SOLO 'carico'/'scarico'  ║
-- ║ → la rettifica inventariale è registrata come carico/scarico in base   ║
-- ║ al segno della differenza (non come 'rettifica', che verrebbe          ║
-- ║ rifiutato dal trigger).                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ───────────────────────────────────────────────────────────────────────────
-- 1) create_warehouse_transfer_atomic
--    Trasferimento merce tra due magazzini in un'unica transazione:
--    header + righe + scarico sorgente + carico destinazione + movimenti.
--    Sostituisce il loop di round-trip in WarehouseTransferPanel.tsx.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_warehouse_transfer_atomic(
  p_company_id        UUID,
  p_from_warehouse_id UUID,
  p_to_warehouse_id   UUID,
  p_transfer_date     DATE  DEFAULT CURRENT_DATE,
  p_notes             TEXT  DEFAULT NULL,
  p_items             JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id          UUID := public.get_my_company_id();
  v_transfer_id         UUID;
  v_from_name           TEXT;
  v_to_name             TEXT;
  v_item                JSONB;
  v_idx                 INTEGER := 0;
  v_stock_item_id       UUID;
  v_qty                 NUMERIC;
  v_src                 RECORD;
  v_dest                RECORD;
  v_dest_stock_item_id  UUID;
BEGIN
  -- Auth + tenant
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessione scaduta. Accedi di nuovo.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda obbligatoria.';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Azienda non valida per l''operazione.';
  END IF;

  -- Validazioni di base
  IF p_from_warehouse_id IS NULL OR p_to_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Magazzino di origine e destinazione obbligatori.';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Origine e destinazione devono essere magazzini diversi.';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Nessun articolo da trasferire.';
  END IF;

  -- I due magazzini devono appartenere all'azienda
  SELECT name INTO v_from_name FROM public.warehouses
   WHERE id = p_from_warehouse_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Magazzino di origine non valido per l''azienda.';
  END IF;
  SELECT name INTO v_to_name FROM public.warehouses
   WHERE id = p_to_warehouse_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Magazzino di destinazione non valido per l''azienda.';
  END IF;

  -- Header
  INSERT INTO public.warehouse_transfers (
    company_id, from_warehouse_id, to_warehouse_id, status,
    transfer_date, notes, created_by
  ) VALUES (
    p_company_id, p_from_warehouse_id, p_to_warehouse_id, 'confermato',
    COALESCE(p_transfer_date, CURRENT_DATE), NULLIF(p_notes, ''), auth.uid()
  )
  RETURNING id INTO v_transfer_id;

  -- Righe + movimenti di stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := (v_item->>'stock_item_id')::UUID;
    v_qty           := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    IF v_stock_item_id IS NULL THEN
      RAISE EXCEPTION 'Articolo non valido nella riga %.', v_idx + 1;
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantità non valida per l''articolo (riga %).', v_idx + 1;
    END IF;

    -- Lock riga sorgente (company + magazzino). FOR UPDATE serializza i
    -- trasferimenti concorrenti → niente lost-update.
    SELECT id, name, description, quantity, unit_cost, vat_rate, supplier_id,
           section_id, min_stock_level, barcode, internal_code, tracking_mode,
           requires_warranty, default_warranty_months
      INTO v_src
      FROM public.warehouse_stock
     WHERE id = v_stock_item_id
       AND company_id = p_company_id
       AND warehouse_id = p_from_warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Articolo non trovato nel magazzino di origine.';
    END IF;

    -- Nessun clamp silenzioso: giacenza insufficiente è errore bloccante
    -- (un over-decrement clampato a 0 farebbe "sparire" merce).
    IF v_src.quantity < v_qty THEN
      RAISE EXCEPTION 'Giacenza insufficiente per "%": disponibili %, richiesti %.',
        v_src.name, v_src.quantity, v_qty;
    END IF;

    -- Scarico sorgente (relativo)
    UPDATE public.warehouse_stock
       SET quantity = quantity - v_qty::INTEGER,
           updated_at = now()
     WHERE id = v_src.id;

    -- Destinazione: stesso articolo per nome nel magazzino target.
    -- (Lo schema non ha un product-id condiviso tra magazzini: l'unica
    -- chiave logica è il nome. Match by-name preservato dall'originale.)
    SELECT id, quantity INTO v_dest
      FROM public.warehouse_stock
     WHERE company_id = p_company_id
       AND warehouse_id = p_to_warehouse_id
       AND name = v_src.name
     FOR UPDATE;

    IF FOUND THEN
      v_dest_stock_item_id := v_dest.id;
      UPDATE public.warehouse_stock
         SET quantity = quantity + v_qty::INTEGER,
             updated_at = now()
       WHERE id = v_dest.id;
    ELSE
      -- Articolo assente in destinazione → crealo copiando l'anagrafica
      INSERT INTO public.warehouse_stock (
        company_id, warehouse_id, name, description, quantity,
        unit_cost, vat_rate, supplier_id, section_id, min_stock_level,
        barcode, internal_code, tracking_mode, requires_warranty,
        default_warranty_months
      ) VALUES (
        p_company_id, p_to_warehouse_id, v_src.name, v_src.description, v_qty::INTEGER,
        COALESCE(v_src.unit_cost, 0), COALESCE(v_src.vat_rate, 22), v_src.supplier_id,
        v_src.section_id, COALESCE(v_src.min_stock_level, 0), v_src.barcode,
        v_src.internal_code, COALESCE(v_src.tracking_mode, 'fungible'),
        COALESCE(v_src.requires_warranty, false), v_src.default_warranty_months
      )
      RETURNING id INTO v_dest_stock_item_id;
    END IF;

    -- Riga trasferimento
    INSERT INTO public.warehouse_transfer_items (
      transfer_id, stock_item_id, quantity, sort_order
    ) VALUES (
      v_transfer_id, v_stock_item_id, v_qty, v_idx
    );

    -- Ledger: scarico dall'origine + carico nella destinazione
    INSERT INTO public.warehouse_movements (
      stock_item_id, movement_type, quantity, notes,
      performed_by, company_id, warehouse_id
    ) VALUES
      (v_stock_item_id, 'scarico', v_qty::INTEGER,
       'Trasferimento verso ' || COALESCE(v_to_name, ''),
       auth.uid(), p_company_id, p_from_warehouse_id),
      (v_dest_stock_item_id, 'carico', v_qty::INTEGER,
       'Trasferimento da ' || COALESCE(v_from_name, ''),
       auth.uid(), p_company_id, p_to_warehouse_id);

    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_transfer_id;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) delete_order_cascading
--    Cancellazione a cascata di una commessa: pre-check blockers + delete di
--    tutte le tabelle figlie + delete commessa, tutto in una transazione.
--    Sostituisce il Promise.all + delete parent in orderUtils.ts.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_order_cascading(
  p_order_id   UUID,
  p_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id    UUID := public.get_my_company_id();
  v_invoices      BIGINT;
  v_costs         BIGINT;
  v_fiscal_docs   BIGINT;
  v_fiscal_links  BIGINT;
  v_installments  BIGINT;
  v_blockers      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Auth + tenant (companyId obbligatorio → ownership check NON skippabile)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessione scaduta. Accedi di nuovo.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda obbligatoria.';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Azienda non valida per l''operazione.';
  END IF;

  -- Ownership: la commessa deve esistere e appartenere alla company
  PERFORM 1 FROM public.orders WHERE id = p_order_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commessa non trovata o non accessibile.';
  END IF;

  -- Blockers (stessa semantica dell'originale)
  SELECT count(*) INTO v_invoices     FROM public.invoices          WHERE order_id = p_order_id;
  SELECT count(*) INTO v_costs        FROM public.company_costs     WHERE order_id = p_order_id;
  SELECT count(*) INTO v_fiscal_docs  FROM public.documenti_fiscali WHERE ordine_id = p_order_id AND deleted_at IS NULL;
  SELECT count(*) INTO v_fiscal_links FROM public.fattura_ordine    WHERE ordine_id = p_order_id;
  SELECT count(*) INTO v_installments FROM public.order_installments WHERE order_id = p_order_id;

  IF v_invoices > 0 OR v_fiscal_docs > 0 OR v_fiscal_links > 0 THEN
    v_blockers := array_append(v_blockers, 'documenti fiscali/fatture');
  END IF;
  IF v_costs > 0 THEN
    v_blockers := array_append(v_blockers, 'costi collegati');
  END IF;
  IF v_installments > 0 THEN
    v_blockers := array_append(v_blockers, 'scadenze o pagamenti');
  END IF;
  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION 'Eliminazione bloccata: la commessa ha %. Mantienila nello storico o scollega prima i movimenti.',
      array_to_string(v_blockers, ', ');
  END IF;

  -- Cascade in transazione unica (all-or-nothing).
  -- Prima gli allegati delle righe, poi le righe, poi le altre tabelle figlie.
  DELETE FROM public.order_item_attachments
   WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id = p_order_id);

  DELETE FROM public.order_items         WHERE order_id = p_order_id;
  DELETE FROM public.order_status_history WHERE order_id = p_order_id;
  DELETE FROM public.order_employees     WHERE order_id = p_order_id;
  DELETE FROM public.order_external_teams WHERE order_id = p_order_id;
  DELETE FROM public.order_salespeople   WHERE order_id = p_order_id;
  DELETE FROM public.order_attachments   WHERE order_id = p_order_id;
  DELETE FROM public.order_errors        WHERE order_id = p_order_id;
  DELETE FROM public.tasks               WHERE order_id = p_order_id;
  DELETE FROM public.appointments        WHERE order_id = p_order_id;
  DELETE FROM public.order_installments  WHERE order_id = p_order_id;  -- no-op se bloccato sopra

  DELETE FROM public.orders WHERE id = p_order_id AND company_id = p_company_id;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) apply_inventory_audit_adjustment
--    Applica una rettifica inventariale: movimento + aggiornamento giacenza
--    RELATIVO (quantity + difference) + flag applied, in una transazione.
--    La math relativa (non più "set assoluto a actualQuantity") evita di
--    clobberare scarichi/carichi avvenuti tra creazione e applicazione.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_inventory_audit_adjustment(
  p_audit_id   UUID,
  p_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_company_id    UUID := public.get_my_company_id();
  v_stock_item_id UUID;
  v_difference    INTEGER;
  v_applied       BOOLEAN;
  v_warehouse_id  UUID;
BEGIN
  -- Auth + tenant
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessione scaduta. Accedi di nuovo.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda obbligatoria.';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Azienda non valida per l''operazione.';
  END IF;

  -- Lock riga audit (company scoped). FOR UPDATE → niente doppia applicazione.
  -- 'difference' è colonna GENERATED (counted_quantity - expected_quantity):
  -- la leggiamo dal DB, non dal client.
  SELECT stock_item_id, difference, adjustment_applied
    INTO v_stock_item_id, v_difference, v_applied
    FROM public.inventory_audits
   WHERE id = p_audit_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rettifica non trovata o non accessibile.';
  END IF;
  IF v_applied THEN
    RAISE EXCEPTION 'Rettifica già applicata.';
  END IF;

  -- Flag applied (idempotenza all'interno della transazione)
  UPDATE public.inventory_audits
     SET adjustment_applied = true
   WHERE id = p_audit_id;

  -- Nessuna differenza → nessun movimento da registrare
  IF v_difference = 0 THEN
    RETURN;
  END IF;

  -- Lock + aggiornamento RELATIVO della giacenza
  SELECT warehouse_id INTO v_warehouse_id
    FROM public.warehouse_stock
   WHERE id = v_stock_item_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Articolo di magazzino non trovato per la rettifica.';
  END IF;

  UPDATE public.warehouse_stock
     SET quantity = GREATEST(0, quantity + v_difference),
         updated_at = now()
   WHERE id = v_stock_item_id;

  -- Ledger. 'rettifica' non è ammesso dal trigger validate_movement_type
  -- (solo carico/scarico) → mappiamo per segno della differenza.
  INSERT INTO public.warehouse_movements (
    stock_item_id, movement_type, quantity, notes,
    performed_by, company_id, warehouse_id
  ) VALUES (
    v_stock_item_id,
    CASE WHEN v_difference > 0 THEN 'carico' ELSE 'scarico' END,
    abs(v_difference),
    'Rettifica inventariale — differenza: '
      || CASE WHEN v_difference > 0 THEN '+' ELSE '' END || v_difference::TEXT,
    auth.uid(), p_company_id, v_warehouse_id
  );
END;
$function$;

-- ─── Grants: SOLO utenti autenticati ───────────────────────────────────────
-- NB: in Supabase le DEFAULT PRIVILEGES concedono EXECUTE ad `anon` sulle nuove
-- funzioni in `public`; REVOKE FROM PUBLIC non basta → revochiamo anche anon
-- esplicitamente (le funzioni hanno comunque la guardia auth.uid() IS NULL).
REVOKE ALL ON FUNCTION public.create_warehouse_transfer_atomic(UUID, UUID, UUID, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_warehouse_transfer_atomic(UUID, UUID, UUID, DATE, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_order_cascading(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_order_cascading(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_inventory_audit_adjustment(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_inventory_audit_adjustment(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.create_warehouse_transfer_atomic IS
  'Trasferimento merce tra magazzini in transazione singola (header+righe+scarico+carico+movimenti). Company scoping + lock FOR UPDATE + errore su giacenza insufficiente.';
COMMENT ON FUNCTION public.delete_order_cascading IS
  'Cancellazione a cascata commessa in transazione singola, con pre-check blockers (fatture/costi/scadenze) e company scoping obbligatorio.';
COMMENT ON FUNCTION public.apply_inventory_audit_adjustment IS
  'Applica rettifica inventariale in transazione singola con math giacenza RELATIVA (no clobber di movimenti concorrenti). Movimento mappato a carico/scarico per segno.';
