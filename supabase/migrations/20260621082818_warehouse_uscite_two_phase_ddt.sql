-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- ════════════════════════════════════════════════════════════════════
-- USCITA MERCE a 2 FASI (doppio controllo):
--  Fase 1: register_warehouse_uscita → crea l'uscita "registrata" +
--          movimenti scarico + scarico giacenza + seriali shipped. NO DDT.
--  Fase 2: create_ddt_from_uscita → dall'uscita genera il DDT bozza.
-- Destinatario: cliente (customers) | cantiere (orders) | libero (manuale).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.warehouse_uscite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  numero text NOT NULL,
  numero_seq integer NOT NULL,
  anno integer NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  destinatario_tipo text NOT NULL CHECK (destinatario_tipo IN ('cliente','cantiere','libero')),
  customer_id uuid,
  order_id uuid,
  destinatario_libero jsonb,
  cliente_snapshot jsonb,
  vettore jsonb,
  note text,
  righe jsonb NOT NULL DEFAULT '[]'::jsonb,
  stato text NOT NULL DEFAULT 'registrata' CHECK (stato IN ('registrata','ddt_creato','annullata')),
  documento_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_uscite_company ON public.warehouse_uscite(company_id, anno, numero_seq DESC);
CREATE INDEX IF NOT EXISTS idx_warehouse_uscite_stato ON public.warehouse_uscite(company_id, stato);

ALTER TABLE public.warehouse_movements ADD COLUMN IF NOT EXISTS uscita_id uuid;
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_uscita ON public.warehouse_movements(uscita_id) WHERE uscita_id IS NOT NULL;

-- RLS: azienda
ALTER TABLE public.warehouse_uscite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wu_company_all ON public.warehouse_uscite;
CREATE POLICY wu_company_all ON public.warehouse_uscite
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- ─────────────────────────────────────────────────────────────────────
-- FASE 1: registra l'uscita (NO DDT)
-- p_destinatario: { tipo, customer_id?, order_id?, libero?, cliente_snapshot? }
-- p_scans: [ { stock_item_id, quantity, serial_numbers?, raw_code? }, ... ]
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_warehouse_uscita(
  p_warehouse_id uuid,
  p_destinatario jsonb,
  p_scans jsonb,
  p_vettore jsonb DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS TABLE (uscita_id uuid, numero text, created_movements integer, updated_units integer, errors jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_seq integer;
  v_numero text;
  v_uscita_id uuid;
  v_tipo text := COALESCE(p_destinatario->>'tipo', 'libero');
  v_customer_id uuid := NULLIF(p_destinatario->>'customer_id','')::uuid;
  v_order_id uuid := NULLIF(p_destinatario->>'order_id','')::uuid;
  v_scan jsonb; v_item_id uuid; v_qty numeric; v_serials jsonb; v_serial text;
  v_tracking text; v_item_name text; v_internal_code text; v_unit_cost numeric;
  v_movements integer := 0; v_units integer := 0; v_errors jsonb := '[]'::jsonb;
  v_righe jsonb := '[]'::jsonb; v_line integer := 0; v_serial_list text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;
  PERFORM 1 FROM public.warehouses WHERE id = p_warehouse_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Magazzino non valido per la company'; END IF;

  SELECT COALESCE(MAX(numero_seq),0)+1 INTO v_seq
    FROM public.warehouse_uscite WHERE company_id = v_company_id AND anno = v_year;
  v_numero := 'U-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.warehouse_uscite (
    company_id, warehouse_id, numero, numero_seq, anno, destinatario_tipo,
    customer_id, order_id, destinatario_libero, cliente_snapshot, vettore, note,
    stato, created_by
  ) VALUES (
    v_company_id, p_warehouse_id, v_numero, v_seq, v_year, v_tipo,
    v_customer_id, v_order_id, p_destinatario->'libero', p_destinatario->'cliente_snapshot',
    p_vettore, NULLIF(p_note,''), 'registrata', auth.uid()
  ) RETURNING id INTO v_uscita_id;

  FOR v_scan IN SELECT * FROM jsonb_array_elements(p_scans)
  LOOP
    BEGIN
      v_item_id := (v_scan->>'stock_item_id')::uuid;
      v_qty := COALESCE((v_scan->>'quantity')::numeric, 1);
      v_serials := v_scan->'serial_numbers';
      SELECT tracking_mode, name, internal_code, unit_cost
        INTO v_tracking, v_item_name, v_internal_code, v_unit_cost
        FROM public.warehouse_stock WHERE id = v_item_id AND company_id = v_company_id;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'item_not_found'); CONTINUE;
      END IF;

      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id, order_id, uscita_id
      ) VALUES (
        v_item_id, 'scarico', v_qty::integer, 'Uscita ' || v_numero, auth.uid(), v_company_id, p_warehouse_id, v_order_id, v_uscita_id
      );
      v_movements := v_movements + 1;

      UPDATE public.warehouse_stock SET quantity = GREATEST(0, quantity - v_qty), updated_at = now() WHERE id = v_item_id;

      IF v_tracking = 'serialized' AND v_serials IS NOT NULL AND jsonb_array_length(v_serials) > 0 THEN
        FOR v_serial IN SELECT * FROM jsonb_array_elements_text(v_serials)
        LOOP
          UPDATE public.stock_units SET status = 'shipped', delivered_to_order_id = v_order_id, delivered_at = now()
           WHERE company_id = v_company_id AND stock_item_id = v_item_id AND serial_number = v_serial AND status = 'available';
          IF FOUND THEN v_units := v_units + 1;
          ELSE v_errors := v_errors || jsonb_build_object('serial_number', v_serial, 'error', 'serial_not_available'); END IF;
        END LOOP;
      END IF;

      INSERT INTO public.warehouse_scan_events(
        company_id, user_id, warehouse_id, scanned_code, scan_type, resolved_stock_item_id, resolution_status, order_id, quantity
      ) VALUES (
        v_company_id, auth.uid(), p_warehouse_id, COALESCE(v_scan->>'raw_code',''), 'scarico', v_item_id, 'matched', v_order_id, v_qty
      );

      v_line := v_line + 1; v_serial_list := NULL;
      IF v_tracking = 'serialized' AND v_serials IS NOT NULL AND jsonb_array_length(v_serials) > 0 THEN
        SELECT string_agg(s, ', ') INTO v_serial_list FROM jsonb_array_elements_text(v_serials) s;
      END IF;
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid()::text, 'numero_linea', v_line,
        'codice_articolo', COALESCE(v_internal_code, ''),
        'descrizione', v_item_name || CASE WHEN v_serial_list IS NOT NULL THEN ' (S/N: ' || v_serial_list || ')' ELSE '' END,
        'quantita', v_qty, 'unita_misura', 'pz', 'prezzo_unitario', COALESCE(v_unit_cost, 0),
        'imponibile', COALESCE(v_unit_cost, 0) * v_qty, 'aliquota_iva', '22', 'imposta', 0,
        'totale_riga', COALESCE(v_unit_cost, 0) * v_qty
      ));
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('scan', v_scan, 'error', SQLERRM);
    END;
  END LOOP;

  UPDATE public.warehouse_uscite SET righe = v_righe, updated_at = now() WHERE id = v_uscita_id;
  RETURN QUERY SELECT v_uscita_id, v_numero, v_movements, v_units, v_errors;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- FASE 2: dal record uscita genera il DDT bozza
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_ddt_from_uscita(
  p_uscita_id uuid,
  p_ddt_extra jsonb DEFAULT NULL
)
RETURNS TABLE (documento_id uuid, numero_ddt text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_u public.warehouse_uscite%ROWTYPE;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_numero_ddt text; v_progressivo integer; v_documento_id uuid;
  v_indirizzo text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;

  SELECT * INTO v_u FROM public.warehouse_uscite WHERE id = p_uscita_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uscita non trovata'; END IF;
  IF v_u.documento_id IS NOT NULL THEN
    RETURN QUERY SELECT v_u.documento_id, (SELECT numero FROM public.documenti_fiscali WHERE id = v_u.documento_id);
    RETURN;
  END IF;
  IF jsonb_array_length(COALESCE(v_u.righe,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Uscita senza righe'; END IF;

  v_numero_ddt := public.genera_numero_documento_native(v_company_id, 'ddt'::text, v_year);
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::integer, 1);

  -- indirizzo consegna: da snapshot cliente o da destinatario libero
  v_indirizzo := COALESCE(
    p_ddt_extra->>'indirizzo_consegna',
    NULLIF(trim(concat_ws(', ',
      v_u.cliente_snapshot->>'indirizzo_via',
      concat_ws(' ', v_u.cliente_snapshot->>'indirizzo_cap', v_u.cliente_snapshot->>'indirizzo_comune'),
      v_u.cliente_snapshot->>'indirizzo_provincia')), ''),
    v_u.destinatario_libero->>'indirizzo'
  );

  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno, data_emissione, stato,
    ordine_id, anagrafica_id, cliente_snapshot, righe, note_documento,
    ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli, ddt_peso,
    ddt_mezzo_trasporto, ddt_porto, ddt_vettore, ddt_indirizzo_consegna
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year, CURRENT_DATE, 'bozza',
    v_u.order_id, v_u.customer_id, v_u.cliente_snapshot, v_u.righe,
    NULLIF(concat_ws(' · ', p_ddt_extra->>'note_documento', v_u.note), ''),
    COALESCE(p_ddt_extra->>'causale_trasporto', 'Vendita'),
    NULLIF(p_ddt_extra->>'aspetto_beni',''),
    NULLIF((p_ddt_extra->>'numero_colli')::integer, 0),
    NULLIF(p_ddt_extra->>'peso',''),
    NULLIF(p_ddt_extra->>'mezzo_trasporto',''),
    COALESCE(p_ddt_extra->>'porto', 'Franco'),
    CASE WHEN v_u.vettore IS NOT NULL THEN v_u.vettore::text ELSE NULLIF(p_ddt_extra->>'vettore','') END,
    v_indirizzo
  ) RETURNING id INTO v_documento_id;

  UPDATE public.warehouse_uscite SET documento_id = v_documento_id, stato = 'ddt_creato', updated_at = now() WHERE id = p_uscita_id;
  UPDATE public.warehouse_movements SET notes = 'Uscita ' || v_u.numero || ' · DDT ' || v_numero_ddt WHERE uscita_id = p_uscita_id;

  RETURN QUERY SELECT v_documento_id, v_numero_ddt;
END;
$$;

REVOKE ALL ON FUNCTION public.register_warehouse_uscita(uuid, jsonb, jsonb, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_warehouse_uscita(uuid, jsonb, jsonb, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_ddt_from_uscita(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ddt_from_uscita(uuid, jsonb) TO authenticated;
