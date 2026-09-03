-- Ondata 0.4 — Magazzino transazionale
--
-- WarehouseStockTab (src/components/warehouse/WarehouseStockTab.tsx) faceva così:
--
--   const currentItem = stockItems.find(i => i.id === stockItemId);   // dalla CACHE
--   const newQty = type === "carico" ? currentItem.quantity + quantity
--                                    : currentItem.quantity - quantity;
--   await supabase.from("warehouse_stock")
--     .update({ quantity: Math.max(0, newQty) })                      // valore ASSOLUTO
--
-- Tre difetti in cinque righe:
--   1. la giacenza di partenza viene dalla cache del browser, non dal database;
--   2. si riscrive un valore assoluto: due scarichi da 3 su una giacenza di 5
--      leggono entrambi 5, scrivono entrambi 2, e restano 2 invece di 0;
--   3. `Math.max(0, …)` trasforma uno sconfinamento in uno zero silenzioso —
--      il movimento però viene registrato per intero, quindi da quel momento
--      la somma dei movimenti non torna più con la giacenza.
--
-- Inoltre il movimento veniva inserito PRIMA dell'aggiornamento: se il secondo
-- falliva, restava a libro un movimento che non ha mai toccato la giacenza.
--
-- Qui c'è la stessa operazione fatta in una transazione sola, con la riga
-- bloccata: chi arriva secondo legge la giacenza già aggiornata e, se non basta,
-- riceve un rifiuto motivato invece di un silenzioso zero.
--
-- SECURITY INVOKER di proposito: la funzione deve poter fare esattamente quello
-- che il client fa già, né più né meno. Le policy di warehouse_stock e
-- warehouse_movements restano l'unica autorità sui permessi.
--
-- Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La rete di sicurezza: una giacenza non può essere negativa
-- ─────────────────────────────────────────────────────────────────────────────
-- (verificato prima di aggiungerlo: 0 righe negative, minimo attuale 1)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.warehouse_stock'::regclass
      AND conname = 'warehouse_stock_quantity_non_negativa'
  ) THEN
    ALTER TABLE public.warehouse_stock
      ADD CONSTRAINT warehouse_stock_quantity_non_negativa CHECK (quantity >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Carico e scarico rapidi, in una transazione sola
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.warehouse_movimento_rapido(
  p_stock_item_id uuid,
  p_tipo          text,
  p_quantita      integer,
  p_note          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prima     integer;
  v_dopo      integer;
  v_company   uuid;
  v_warehouse uuid;
  v_nome      text;
  v_mov_id    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_tipo NOT IN ('carico', 'scarico') THEN
    RAISE EXCEPTION 'tipo movimento non valido: % (attesi "carico" o "scarico")', p_tipo
      USING ERRCODE = '22023';
  END IF;

  IF p_quantita IS NULL OR p_quantita <= 0 THEN
    RAISE EXCEPTION 'la quantità del movimento deve essere maggiore di zero'
      USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE è tutto il punto: chi arriva secondo aspetta qui e poi legge la
  -- giacenza già aggiornata dal primo, non quella che aveva in cache.
  SELECT quantity, company_id, warehouse_id, name
    INTO v_prima, v_company, v_warehouse, v_nome
  FROM public.warehouse_stock
  WHERE id = p_stock_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Con SECURITY INVOKER la RLS può nascondere la riga: "non trovato" copre
    -- sia l'articolo inesistente sia quello di un'altra azienda, e va bene così.
    RAISE EXCEPTION 'Articolo di magazzino non trovato' USING ERRCODE = 'P0002';
  END IF;

  IF p_tipo = 'scarico' AND v_prima < p_quantita THEN
    RAISE EXCEPTION
      'Giacenza insufficiente per "%": disponibili %, richiesti %.',
      coalesce(v_nome, '—'), v_prima, p_quantita
      USING ERRCODE = '23514';
  END IF;

  v_dopo := CASE WHEN p_tipo = 'carico' THEN v_prima + p_quantita
                 ELSE v_prima - p_quantita END;

  -- Aggiornamento relativo, non assoluto, e senza clamp: se qualcosa non torna
  -- il CHECK ferma la transazione invece di lasciare passare uno zero finto.
  UPDATE public.warehouse_stock
     SET quantity = quantity + CASE WHEN p_tipo = 'carico' THEN p_quantita ELSE -p_quantita END,
         updated_at = now()
   WHERE id = p_stock_item_id;

  -- Il movimento si scrive DOPO, nella stessa transazione: o valgono entrambi
  -- o nessuno dei due. Prima il movimento poteva restare senza la giacenza.
  INSERT INTO public.warehouse_movements (
    stock_item_id, movement_type, quantity, notes,
    performed_by, company_id, warehouse_id
  ) VALUES (
    p_stock_item_id, p_tipo, p_quantita, nullif(btrim(coalesce(p_note, '')), ''),
    auth.uid(), v_company, v_warehouse
  )
  RETURNING id INTO v_mov_id;

  RETURN jsonb_build_object(
    'ok', true,
    'movimento_id', v_mov_id,
    'giacenza_prima', v_prima,
    'giacenza_dopo', v_dopo
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.warehouse_movimento_rapido(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.warehouse_movimento_rapido(uuid, text, integer, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cancellare una ricezione toglie dalla giacenza quello che aveva aggiunto
-- ─────────────────────────────────────────────────────────────────────────────
-- trg_auto_carico_stock (AFTER INSERT su goods_receipts) carica il magazzino
-- quando arriva la merce. Non esisteva il gesto contrario: cancellata la
-- ricezione, la giacenza restava gonfiata e nessun movimento lo raccontava.

CREATE OR REPLACE FUNCTION public.auto_storno_stock_on_receipt_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock_id  uuid;
  v_item_name text;
  v_attuale   integer;
  v_da_togliere integer;
BEGIN
  -- Stessa condizione dell'INSERT: si storna solo ciò che era stato caricato.
  IF OLD.quality_check_status IS NULL
     OR OLD.quality_check_status NOT IN ('ok', 'partial')
     OR OLD.warehouse_id IS NULL
     OR coalesce(OLD.quantity_received, 0) <= 0 THEN
    RETURN OLD;
  END IF;

  SELECT oi.name INTO v_item_name
  FROM public.order_items oi WHERE oi.id = OLD.order_item_id;
  IF v_item_name IS NULL THEN RETURN OLD; END IF;

  SELECT id, quantity INTO v_stock_id, v_attuale
  FROM public.warehouse_stock
  WHERE company_id = OLD.company_id
    AND warehouse_id = OLD.warehouse_id
    AND name = v_item_name
  FOR UPDATE;

  IF v_stock_id IS NULL THEN RETURN OLD; END IF;

  -- La merce può essere già uscita: in quel caso si toglie quello che c'è, e la
  -- nota lo dice. Meglio una giacenza a zero con la ragione scritta che una
  -- transazione che si rifiuta di cancellare una ricezione sbagliata.
  v_da_togliere := LEAST(v_attuale, OLD.quantity_received);
  IF v_da_togliere <= 0 THEN RETURN OLD; END IF;

  UPDATE public.warehouse_stock
     SET quantity = quantity - v_da_togliere, updated_at = now()
   WHERE id = v_stock_id;

  INSERT INTO public.warehouse_movements (
    stock_item_id, order_item_id, movement_type, quantity,
    performed_by, warehouse_id, notes, company_id
  ) VALUES (
    v_stock_id, OLD.order_item_id, 'scarico', v_da_togliere,
    coalesce(auth.uid(), OLD.received_by), OLD.warehouse_id,
    'Storno automatico: cancellata la ricezione ' || OLD.id::text
      || CASE WHEN v_da_togliere < OLD.quantity_received
              THEN format(' (ricevuti %s, in giacenza solo %s)', OLD.quantity_received, v_attuale)
              ELSE '' END,
    OLD.company_id
  );

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_storno_stock_delete ON public.goods_receipts;
CREATE TRIGGER trg_auto_storno_stock_delete
  BEFORE DELETE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.auto_storno_stock_on_receipt_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Lo stesso difetto, più piccolo, nell'uscita da magazzino
-- ─────────────────────────────────────────────────────────────────────────────
-- register_warehouse_uscita aveva già la guardia giusta e il commento che ne
-- spiega il perché — ma leggeva la giacenza senza bloccare la riga:
--
--   SELECT … quantity INTO v_current_qty FROM warehouse_stock WHERE id = …;
--   IF COALESCE(v_current_qty,0) < v_qty THEN … CONTINUE; END IF;
--   UPDATE … SET quantity = GREATEST(0, quantity - v_qty) …
--
-- Due uscite simultanee sulla stessa riga leggono entrambe la giacenza piena,
-- passano entrambe il controllo, e il GREATEST nasconde lo sconfinamento della
-- seconda: la giacenza finisce a 0 mentre il libro movimenti ne ha scaricati
-- più di quanti ce ne fossero. Due sole modifiche: `FOR UPDATE` sulla lettura,
-- e nessun clamp sulla scrittura — così il controllo diventa atomico e, se
-- qualcosa sfugge comunque, il CHECK ferma la transazione. Il gestore di errore
-- per riga già presente trasforma il rifiuto in una riga di `errors`, come per
-- ogni altro motivo di scarto.
--
-- Il resto della funzione è identico all'originale.

CREATE OR REPLACE FUNCTION public.register_warehouse_uscita(
  p_warehouse_id uuid, p_destinatario jsonb, p_scans jsonb,
  p_vettore jsonb DEFAULT NULL::jsonb, p_note text DEFAULT NULL::text)
 RETURNS TABLE(uscita_id uuid, numero text, created_movements integer, updated_units integer, errors jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_seq integer; v_numero text; v_uscita_id uuid;
  v_tipo text := COALESCE(p_destinatario->>'tipo', 'libero');
  v_customer_id uuid := NULLIF(p_destinatario->>'customer_id','')::uuid;
  v_order_id uuid := NULLIF(p_destinatario->>'order_id','')::uuid;
  v_scan jsonb; v_item_id uuid; v_qty numeric; v_serials jsonb; v_serial text;
  v_tracking text; v_item_name text; v_internal_code text; v_unit_cost numeric;
  v_current_qty numeric;
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
    customer_id, order_id, destinatario_libero, cliente_snapshot, vettore, note, stato, created_by
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
      -- FOR UPDATE: il controllo qui sotto vale solo se nel frattempo nessun
      -- altro può portare via la stessa merce.
      SELECT tracking_mode, name, internal_code, unit_cost, quantity
        INTO v_tracking, v_item_name, v_internal_code, v_unit_cost, v_current_qty
        FROM public.warehouse_stock WHERE id = v_item_id AND company_id = v_company_id
        FOR UPDATE;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'item_not_found'); CONTINUE;
      END IF;

      -- GUARDIA (P1c): non registrare uno scarico maggiore della giacenza disponibile,
      -- altrimenti lo stock viene clampato a 0 ma il ledger registra la quantità piena
      -- → warehouse_stock ≠ somma movimenti. Se insufficiente, salto la riga con errore.
      IF COALESCE(v_current_qty,0) < v_qty THEN
        v_errors := v_errors || jsonb_build_object('stock_item_id', v_item_id, 'error', 'insufficient_stock',
                     'available', COALESCE(v_current_qty,0), 'requested', v_qty);
        CONTINUE;
      END IF;

      INSERT INTO public.warehouse_movements(
        stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id, order_id, uscita_id
      ) VALUES (
        v_item_id, 'scarico', v_qty::integer, 'Uscita ' || v_numero, auth.uid(), v_company_id, p_warehouse_id, v_order_id, v_uscita_id
      );
      v_movements := v_movements + 1;

      -- Niente GREATEST: con la riga bloccata la sottrazione non può andare
      -- sotto zero, e se ci andasse il CHECK deve fermare la transazione, non
      -- lasciare una giacenza finta.
      UPDATE public.warehouse_stock SET quantity = quantity - v_qty, updated_at = now() WHERE id = v_item_id;

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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Un trigger accessorio che impediva di creare articoli di magazzino
-- ─────────────────────────────────────────────────────────────────────────────
-- Trovato provando la concorrenza: inserire una riga in warehouse_stock senza
-- un utente autenticato falliva con
--   ERROR 42703: column "company_id" does not exist
-- perché warehouse_stock_ensure_initial_movement cercava il fallback così:
--   COALESCE(auth.uid(), (SELECT user_id FROM user_roles WHERE company_id = …))
-- ma user_roles ha solo (id, user_id, role): il ruolo è globale, l'azienda sta
-- in profiles. La riga era fuori dal BEGIN/EXCEPTION della funzione, quindi
-- l'errore non veniva assorbito: bloccava l'INSERT.
--
-- Effetto in produzione: qualunque percorso lato server che crea un articolo —
-- una edge function col service role, un import, la ricezione merce quando
-- l'articolo non esiste ancora — si interrompeva. Dal browser funzionava,
-- perché lì auth.uid() c'è e il COALESCE non valuta il secondo ramo.
--
-- Due correzioni: il fallback cerca in profiles, e tutto il corpo sta dentro il
-- gestore di errore — un movimento di cortesia per lo storico non può impedire
-- di caricare merce a magazzino.

CREATE OR REPLACE FUNCTION public.warehouse_stock_ensure_initial_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_qty numeric; v_wh uuid; v_company uuid; v_user uuid;
BEGIN
  BEGIN
    SELECT quantity, warehouse_id, company_id
      INTO v_qty, v_wh, v_company
      FROM public.warehouse_stock WHERE id = NEW.id;
    IF v_qty IS NULL OR v_qty <= 0 THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.warehouse_movements WHERE stock_item_id = NEW.id) THEN
      RETURN NULL;
    END IF;

    -- L'azienda di un utente sta in profiles: user_roles porta solo il ruolo.
    v_user := COALESCE(
      auth.uid(),
      (SELECT p.id FROM public.profiles p WHERE p.company_id = v_company ORDER BY p.id LIMIT 1)
    );
    IF v_user IS NULL THEN RETURN NULL; END IF;

    INSERT INTO public.warehouse_movements(
      stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id)
    VALUES (NEW.id, 'carico', v_qty::integer,
            'Carico iniziale (giacenza di partenza)', v_user, v_company, v_wh);
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'ensure_initial_movement: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
