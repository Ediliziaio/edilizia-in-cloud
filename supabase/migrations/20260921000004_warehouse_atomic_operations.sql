-- ─────────────────────────────────────────────────────────────
--  Warehouse atomic operations — stabilization wave 4
-- ─────────────────────────────────────────────────────────────
--
--  Contesto:
--  L'audit statico del flow magazzini ha identificato due race
--  conditions funzionali su mutation client-side sequenziali:
--
--  1) useWarehouses.setDefault (2 UPDATE separate):
--     Due tab aperti possono rendere entrambi default momentaneamente
--     oppure generare una finestra di "no default" tra i due step.
--
--  2) useGoodsReceipt (INSERT + UPDATE separate):
--     Se l'update su order_items fallisce (rete, RLS), il receipt
--     resta orfano — inconsistenza DB senza rollback.
--
--  Fix: due RPC function SECURITY DEFINER con transazione implicita
--  (PL/pgSQL BEGIN/END). Mantengono la semantica originale ma
--  atomiche per costruzione. Authorization via has_role +
--  get_my_company_id, coerente con il resto del codebase.
-- ─────────────────────────────────────────────────────────────

-- ───────────────────────────────────────────────
--  1) set_default_warehouse(warehouse_id)
-- ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_default_warehouse(p_warehouse_id uuid)
RETURNS public.warehouses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result public.warehouses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no auth.uid()';
  END IF;

  -- Recupera la company del warehouse target
  SELECT company_id INTO v_company_id
  FROM public.warehouses
  WHERE id = p_warehouse_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse % non trovato', p_warehouse_id;
  END IF;

  -- Authorization: deve appartenere alla company e avere ruolo admin.
  -- Coerente con RLS wa_admin_manage (company_admin | super_admin).
  IF v_company_id <> public.get_my_company_id() THEN
    RAISE EXCEPTION 'Forbidden: warehouse non appartiene alla tua company';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'company_admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Forbidden: solo admin possono impostare il default';
  END IF;

  -- ── Transazione atomica ─────────────────────────────────
  -- PL/pgSQL block = atomicità garantita: se la seconda UPDATE
  -- fallisce, la prima viene rollbackata automaticamente.
  UPDATE public.warehouses
     SET is_default = false
   WHERE company_id = v_company_id
     AND is_default = true
     AND id <> p_warehouse_id;

  UPDATE public.warehouses
     SET is_default = true
   WHERE id = p_warehouse_id
  RETURNING * INTO v_result;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Update warehouse fallito';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_warehouse(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_warehouse(uuid) TO authenticated;

COMMENT ON FUNCTION public.set_default_warehouse(uuid) IS
  'Imposta atomicamente un warehouse come default per la sua company. '
  'Rimuove il default precedente e ne setta uno nuovo in una singola '
  'transazione PL/pgSQL (no race tra tab concorrenti). '
  'Authorization: company_admin o super_admin sulla stessa company.';


-- ───────────────────────────────────────────────
--  2) insert_goods_receipt_atomic(...)
-- ───────────────────────────────────────────────
--
--  Crea il receipt + aggiorna l'order_item in un'unica transazione.
--  Se l'update order_items fallisce → rollback del receipt insert.
--
--  NB: firma mirata al payload esistente di useGoodsReceipt.ts
--  (1 receipt ↔ 1 order_item). Accettiamo anche eventi timeline
--  opzionali così il client può delegare completamente.
-- ───────────────────────────────────────────────

DO $migration$
BEGIN
  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.insert_goods_receipt_atomic(
      p_order_item_id uuid,
      p_warehouse_id uuid,
      p_quantity_received numeric,
      p_quality_check_status text,
      p_supplier_id uuid DEFAULT NULL,
      p_ddt_number text DEFAULT NULL,
      p_ddt_photo_url text DEFAULT NULL,
      p_ddt_ricezione_id uuid DEFAULT NULL,
      p_quality_notes text DEFAULT NULL,
      p_notes text DEFAULT NULL
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_user_id uuid;
      v_company_id uuid;
      v_item_company_id uuid;
      v_receipt_id uuid;
    BEGIN
      v_user_id := auth.uid();
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: no auth.uid()';
      END IF;

      v_company_id := public.get_my_company_id();
      IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna company attiva';
      END IF;

      SELECT company_id INTO v_item_company_id
      FROM public.order_items
      WHERE id = p_order_item_id;

      IF v_item_company_id IS NULL THEN
        RAISE EXCEPTION 'Order item % non trovato', p_order_item_id;
      END IF;

      IF v_item_company_id <> v_company_id THEN
        RAISE EXCEPTION 'Forbidden: order item di altra company';
      END IF;

      INSERT INTO public.goods_receipts (
        order_item_id,
        warehouse_id,
        company_id,
        supplier_id,
        quantity_received,
        ddt_number,
        ddt_photo_url,
        quality_check_status,
        quality_notes,
        notes,
        received_by,
        ddt_ricezione_id
      ) VALUES (
        p_order_item_id,
        p_warehouse_id,
        v_company_id,
        p_supplier_id,
        p_quantity_received,
        p_ddt_number,
        p_ddt_photo_url,
        p_quality_check_status,
        p_quality_notes,
        p_notes,
        v_user_id,
        p_ddt_ricezione_id
      ) RETURNING id INTO v_receipt_id;

      UPDATE public.order_items
         SET quantity_received = p_quantity_received,
             receipt_id = v_receipt_id,
             fulfillment_status = 'received',
             last_goods_receipt_date = now()
       WHERE id = p_order_item_id
         AND company_id = v_company_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item update fallito per id %', p_order_item_id;
      END IF;

      BEGIN
        INSERT INTO public.order_item_timeline (
          order_item_id,
          company_id,
          event_type,
          event_by,
          photo_url,
          document_ref,
          notes,
          location
        ) VALUES (
          p_order_item_id,
          v_company_id,
          'received',
          v_user_id,
          p_ddt_photo_url,
          v_receipt_id::text,
          COALESCE(p_notes, format('Ricevuto %s pz - Qualità: %s', p_quantity_received, p_quality_check_status)),
          'Magazzino'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Timeline insert skipped: %', SQLERRM;
      END;

      RETURN v_receipt_id;
    END;
    $fn$;
  $sql$;

  EXECUTE 'REVOKE ALL ON FUNCTION public.insert_goods_receipt_atomic(uuid, uuid, numeric, text, uuid, text, text, uuid, text, text) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.insert_goods_receipt_atomic(uuid, uuid, numeric, text, uuid, text, text, uuid, text, text) TO authenticated';
  EXECUTE $sql$
    COMMENT ON FUNCTION public.insert_goods_receipt_atomic(uuid, uuid, numeric, text, uuid, text, text, uuid, text, text)
    IS 'Crea un goods_receipt e aggiorna atomicamente il relativo order_item (quantity_received, receipt_id, fulfillment_status). Se l''update fallisce, l''intero receipt viene rollbackato. Authorization: order_item deve appartenere alla company attiva dell''utente (get_my_company_id).'
  $sql$;
  EXECUTE 'NOTIFY pgrst, ''reload schema''';
END;
$migration$;
