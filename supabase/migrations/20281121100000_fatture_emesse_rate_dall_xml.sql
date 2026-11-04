-- Fatture emesse importate da XML: una scadenza per rata, col suo metodo.
--
-- Il lettore prendeva solo il primo DettaglioPagamento: una fattura a due rate
-- aveva una scadenza sola, per l'intero, alla prima data.
--
-- Ora importa-fattura-attiva-xml salva tutte le rate in invoices.piano_pagamento
-- (stessa forma di fatture_ricevute.piano_pagamento) e il trigger ne fa una
-- scadenza ciascuna, con scadenze.rata_numero e il metodo in payment_method.
--
-- La somma delle scadenze è sempre il totale:
--   · fino a 2 centesimi di differenza li assorbe l'ultima rata;
--   · oltre (split payment, ritenuta), o con una rata senza data o importo, resta
--     una scadenza sola per il totale, e l'import lo segnala. Un incasso anticipato
--     si vede; uno dimenticato no.
-- Le note di credito restano a scadenza unica: riducono il credito, non si incassano.
--
-- Le fatture già importate non cambiano: hanno piano_pagamento nullo, e per loro
-- ogni ramo fa ciò che faceva. Nessuna riga esistente viene scritta qui.
--
-- Gli incassi delle fatture da XML. Su external_provider = 'xml_import' il pagato non
-- si muoveva mai: i trigger di invoice_payments lo lasciano al gestionale esterno, ma
-- qui un gestionale che lo riallinea non c'è. Provato: un incasso dal dialogo lasciava
-- paid_amount a 0 e il pagamento in elenco. Ora:
--   · un pagamento aggiunge o toglie la sua DIFFERENZA, senza ricalcolare dalla somma:
--     ci sono fatture col pagato scritto senza pagamenti, e il ricalcolo lo
--     azzererebbe (è il guasto del 20/09, migrazione 20280920120000);
--   · la rata pagata dallo scadenzario aggiorna anche la fattura;
--   · annullare un incasso riapre le rate, dalla più lontana, ma non quelle pagate
--     dallo scadenzario, che hanno la loro scrittura di prima nota.
-- Gli altri gestionali (Fatture in Cloud, ITALA…) non cambiano. Oggi nessuna fattura
-- da XML ha pagamenti, quindi non c'è niente da riallineare.
--
-- Il metodo arriva da metodo_da_codice_mp, la stessa conversione delle fatture ricevute.
-- La RiBa è solo un metodo sulla rata: portafoglio, anticipo salvo buon fine e
-- insoluti non esistono ancora.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS piano_pagamento jsonb,
  ADD COLUMN IF NOT EXISTS condizioni_pagamento text;
ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS rata_numero integer;

COMMENT ON COLUMN public.invoices.piano_pagamento IS
  'Rate dall''XML: [{scadenza, importo, modalita (MPxx), iban}]. Nullo per le fatture importate prima del 04/11/2026 e per quelle di altra provenienza.';
COMMENT ON COLUMN public.invoices.condizioni_pagamento IS
  'CondizioniPagamento dell''XML: TP01 a rate, TP02 completo, TP03 anticipo.';
COMMENT ON COLUMN public.scadenze.rata_numero IS
  'Numero della rata di una fattura con piano_pagamento (1, 2, …, in ordine di data). Nullo = scadenza unica della fattura.';

-- Due volte la stessa rata non deve poter esistere.
CREATE UNIQUE INDEX IF NOT EXISTS scadenze_rata_unica
  ON public.scadenze (invoice_id, rata_numero)
  WHERE invoice_id IS NOT NULL AND rata_numero IS NOT NULL;

-- Le rate che diventano scadenze, in ordine di data, con la somma uguale al
-- totale. Nessuna riga = il piano non si può spezzare: scadenza unica.
CREATE OR REPLACE FUNCTION public.rate_scadenze_fattura(p_piano jsonb, p_totale numeric)
RETURNS TABLE(numero integer, scadenza date, importo numeric, metodo text)
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_quante integer;
  v_somma numeric;
BEGIN
  IF jsonb_typeof(p_piano) IS DISTINCT FROM 'array' OR jsonb_array_length(p_piano) < 2 THEN
    RETURN;
  END IF;
  v_quante := jsonb_array_length(p_piano);

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_piano) r
     WHERE COALESCE(pg_catalog.pg_input_is_valid(r->>'scadenza', 'date'), false) IS NOT TRUE
        OR CASE WHEN jsonb_typeof(r->'importo') = 'number' THEN (r->>'importo')::numeric <= 0.02 ELSE true END
  ) THEN
    RETURN;
  END IF;

  SELECT sum((r->>'importo')::numeric) INTO v_somma FROM jsonb_array_elements(p_piano) r;
  IF abs(p_totale - v_somma) > 0.02 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT o.n::integer, o.d, o.i + CASE WHEN o.n = v_quante THEN p_totale - v_somma ELSE 0 END, public.metodo_da_codice_mp(o.m)
    FROM (
      SELECT row_number() OVER (ORDER BY (e.r->>'scadenza')::date, e.ord) AS n,
             (e.r->>'scadenza')::date AS d, (e.r->>'importo')::numeric AS i, e.r->>'modalita' AS m
        FROM jsonb_array_elements(p_piano) WITH ORDINALITY AS e(r, ord)
    ) o
   ORDER BY o.n;
END
$$;

REVOKE ALL ON FUNCTION public.rate_scadenze_fattura(jsonb, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_scadenze_fattura(jsonb, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.auto_create_scadenza_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo TEXT;
  v_description TEXT;
  v_importata boolean := NEW.external_provider IS NOT NULL;
  v_pagata boolean;
  v_stato text;
  v_rata record;
  v_quante integer;
  v_resto numeric;
  v_quota numeric;
  v_create integer := 0;
  v_metodo text;
  v_differenza numeric;
BEGIN
  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Per le fatture importate lo stato del pagamento arriva dal gestionale
  -- esterno (FIC, Aruba…): la scadenza lo segue. Le native passano dagli
  -- incassi registrati in app, come prima.
  v_pagata := v_importata AND (NEW.status = 'paid' OR COALESCE(NEW.paid_amount, 0) >= COALESCE(NEW.total, 0) - 0.01);
  v_stato := CASE
    WHEN v_pagata THEN 'pagata'
    WHEN v_importata AND COALESCE(NEW.paid_amount, 0) > 0 THEN 'parziale'
    ELSE 'da_pagare'
  END;

  -- Le scadenze della fattura esistono già. Prima si guardavano solo quelle aperte:
  -- con la scadenza già pagata, un cambio di stato della fattura ne creava una nuova.
  IF EXISTS (SELECT 1 FROM scadenze WHERE invoice_id = NEW.id) THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.total IS DISTINCT FROM NEW.total OR OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        UPDATE scadenze SET
          amount = COALESCE(NEW.total, 0),
          due_date = NEW.due_date,
          description = CASE
            WHEN NEW.document_type IN ('nota_credito', 'credit_note') THEN 'Nota credito ' || COALESCE(NEW.invoice_number, '')
            ELSE 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '')
          END,
          updated_at = now()
        WHERE invoice_id = NEW.id AND status IN ('da_pagare', 'parziale') AND rata_numero IS NULL;

        -- A rate: le date restano quelle del piano. Se cambia il totale, la
        -- differenza va sull'ultima rata aperta, finché ne resta capienza.
        IF OLD.total IS DISTINCT FROM NEW.total THEN
          SELECT COALESCE(NEW.total, 0) - sum(amount) INTO v_differenza
            FROM scadenze WHERE invoice_id = NEW.id AND rata_numero IS NOT NULL AND status <> 'annullata';
          UPDATE scadenze SET amount = amount + v_differenza, updated_at = now()
           WHERE id = (
             SELECT id FROM scadenze
              WHERE invoice_id = NEW.id AND rata_numero IS NOT NULL AND status IN ('da_pagare', 'parziale')
              ORDER BY rata_numero DESC LIMIT 1
           )
             AND amount + v_differenza > GREATEST(COALESCE(paid_amount, 0), 0);
        END IF;
      END IF;
      IF v_importata AND v_stato <> 'da_pagare' THEN
        UPDATE scadenze SET
          status = v_stato,
          paid_amount = CASE WHEN v_pagata THEN amount ELSE LEAST(COALESCE(NEW.paid_amount, 0), amount) END,
          paid_date = CASE WHEN v_pagata AND NEW.storico_esterno THEN COALESCE(paid_date, NEW.payment_date) ELSE paid_date END,
          updated_at = now()
        WHERE invoice_id = NEW.id
          AND auto_source = 'invoice'
          AND status IN ('da_pagare', 'parziale')
          AND status IS DISTINCT FROM v_stato
          -- Un incasso parziale non chiude tutte le rate: lo ripartisce auto_reconcile_invoice_payment.
          AND (v_pagata OR rata_numero IS NULL);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Storico già incassato nel gestionale di prima: nessuna scadenza.
  IF NEW.storico_esterno THEN
    RETURN NEW;
  END IF;

  IF NEW.document_type IN ('fattura', 'fattura_accompagnatoria', 'parcella', 'invoice') THEN
    v_tipo := 'incasso_cliente';
    v_description := 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSIF NEW.document_type IN ('nota_credito', 'credit_note') THEN
    v_tipo := 'pagamento_fornitore';
    v_description := 'Nota credito ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSE
    RETURN NEW;
  END IF;

  -- Una scadenza per rata, se il piano dell'XML si può spezzare.
  IF v_tipo = 'incasso_cliente' THEN
    v_quante := CASE WHEN jsonb_typeof(NEW.piano_pagamento) = 'array' THEN jsonb_array_length(NEW.piano_pagamento) ELSE 0 END;
    v_resto := CASE WHEN v_pagata THEN COALESCE(NEW.total, 0) WHEN v_stato = 'parziale' THEN NEW.paid_amount ELSE 0 END;
    FOR v_rata IN SELECT * FROM public.rate_scadenze_fattura(NEW.piano_pagamento, NEW.total) LOOP
      v_quota := LEAST(v_resto, v_rata.importo);
      v_resto := v_resto - v_quota;
      -- NB: NON inserire "direction": è una colonna GENERATED ALWAYS (calcolata da tipo).
      INSERT INTO scadenze (
        company_id, tipo, description, amount, due_date,
        invoice_id, order_id, status, paid_amount, paid_date, payment_method, rata_numero,
        is_auto_generated, auto_source, alert_days_before, created_by
      ) VALUES (
        NEW.company_id, v_tipo,
        v_description || ' · ' || CASE WHEN v_rata.metodo = 'riba' THEN 'RiBa' ELSE 'rata' END || ' ' || v_rata.numero || ' di ' || v_quante,
        v_rata.importo, v_rata.scadenza,
        NEW.id, NEW.order_id,
        CASE WHEN v_quota >= v_rata.importo THEN 'pagata' WHEN v_quota > 0 THEN 'parziale' ELSE 'da_pagare' END,
        v_quota,
        CASE WHEN v_quota >= v_rata.importo THEN NEW.payment_date END,
        v_rata.metodo, v_rata.numero,
        true, 'invoice', 7, NEW.created_by
      );
      v_create := v_create + 1;
    END LOOP;
    IF v_create > 0 THEN
      RETURN NEW;
    END IF;

    -- Scadenza unica: il metodo, se l'XML ne dice uno solo.
    IF v_quante > 0 AND (
      SELECT count(DISTINCT r->>'modalita') = 1 AND count(*) = count(r->>'modalita')
        FROM jsonb_array_elements(NEW.piano_pagamento) r
    ) THEN
      v_metodo := public.metodo_da_codice_mp(NEW.piano_pagamento->0->>'modalita');
      IF v_metodo = 'riba' THEN
        v_description := v_description || ' · RiBa';
      END IF;
    END IF;
  END IF;

  -- NB: NON inserire "direction": è una colonna GENERATED ALWAYS (calcolata da tipo).
  INSERT INTO scadenze (
    company_id, tipo, description, amount, due_date,
    invoice_id, order_id, status, paid_amount, payment_method, is_auto_generated, auto_source,
    alert_days_before, created_by
  ) VALUES (
    NEW.company_id, v_tipo, v_description,
    COALESCE(NEW.total, 0), NEW.due_date,
    NEW.id, NEW.order_id, v_stato,
    CASE WHEN v_pagata THEN COALESCE(NEW.total, 0) WHEN v_stato = 'parziale' THEN NEW.paid_amount ELSE 0 END,
    v_metodo,
    true, 'invoice',
    7, NEW.created_by
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_reconcile_invoice_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rata record;
  v_resto numeric;
  v_quota numeric;
BEGIN
  -- Se la fattura viene pagata completamente
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE scadenze SET
      status = 'pagata',
      paid_amount = amount,
      paid_date = COALESCE(NEW.payment_date, now()::date),
      -- La scadenza che dice già il suo metodo (la RiBa di una rata) lo tiene.
      payment_method = COALESCE(payment_method, NEW.payment_method),
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale');
  END IF;

  -- Se pagamento parziale (paid_amount aumentato ma non ancora paid)
  IF NEW.paid_amount IS NOT NULL AND NEW.paid_amount > COALESCE(OLD.paid_amount, 0)
     AND NEW.status <> 'paid' THEN
    UPDATE scadenze SET
      paid_amount = NEW.paid_amount,
      status = CASE
        WHEN NEW.paid_amount >= amount THEN 'pagata'
        WHEN NEW.paid_amount > 0 THEN 'parziale'
        ELSE status
      END,
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale')
    AND rata_numero IS NULL;

    -- A rate: l'incassato che le rate non hanno ancora copre quelle aperte dalla più
    -- vicina. Il pagato della fattura non vale per ciascuna: le chiuderebbe tutte. Non
    -- è il solo aumento: la rata pagata dallo scadenzario ha già la sua parte.
    SELECT NEW.paid_amount - COALESCE(sum(paid_amount), 0) INTO v_resto
      FROM scadenze WHERE invoice_id = NEW.id AND rata_numero IS NOT NULL AND status <> 'annullata';
    FOR v_rata IN
      SELECT id, amount, COALESCE(paid_amount, 0) AS pagato FROM scadenze
       WHERE invoice_id = NEW.id AND rata_numero IS NOT NULL AND status IN ('da_pagare', 'parziale')
       ORDER BY due_date, rata_numero
       FOR UPDATE
    LOOP
      EXIT WHEN v_resto <= 0;
      v_quota := LEAST(v_resto, v_rata.amount - v_rata.pagato);
      v_resto := v_resto - v_quota;
      UPDATE scadenze SET
        paid_amount = v_rata.pagato + v_quota,
        status = CASE WHEN v_rata.pagato + v_quota >= v_rata.amount THEN 'pagata' ELSE 'parziale' END,
        paid_date = CASE WHEN v_rata.pagato + v_quota >= v_rata.amount THEN COALESCE(NEW.payment_date, now()::date) ELSE paid_date END,
        updated_at = now()
      WHERE id = v_rata.id;
    END LOOP;
  END IF;

  -- Incasso annullato su una fattura da XML: si riaprono le rate, dalla più lontana.
  -- Quelle pagate dallo scadenzario hanno la loro prima nota: restano.
  IF NEW.external_provider = 'xml_import' AND COALESCE(NEW.paid_amount, 0) < COALESCE(OLD.paid_amount, 0) THEN
    SELECT COALESCE(sum(paid_amount), 0) - COALESCE(NEW.paid_amount, 0) INTO v_resto
      FROM scadenze WHERE invoice_id = NEW.id AND auto_source = 'invoice' AND status <> 'annullata';
    FOR v_rata IN
      SELECT id, COALESCE(paid_amount, 0) AS pagato FROM scadenze
       WHERE invoice_id = NEW.id AND auto_source = 'invoice' AND status IN ('pagata', 'parziale')
         AND prima_nota_entry_id IS NULL
       ORDER BY due_date DESC, rata_numero DESC NULLS LAST
       FOR UPDATE
    LOOP
      EXIT WHEN v_resto <= 0;
      v_quota := LEAST(v_resto, v_rata.pagato);
      v_resto := v_resto - v_quota;
      UPDATE scadenze SET
        paid_amount = v_rata.pagato - v_quota,
        status = CASE WHEN v_rata.pagato - v_quota > 0 THEN 'parziale' ELSE 'da_pagare' END,
        paid_date = NULL,
        updated_at = now()
      WHERE id = v_rata.id;
    END LOOP;
  END IF;

  -- Se fattura annullata, annulla scadenza
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE scadenze SET
      status = 'annullata',
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_update_invoice_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_total_paid numeric;
  v_invoice_total numeric;
  v_last_payment_date date;
  v_esterna boolean;
  v_provider text;
  v_differenza numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  SELECT total, external_provider IS NOT NULL, external_provider
    INTO v_invoice_total, v_esterna, v_provider
    FROM public.invoices
   WHERE id = v_invoice_id;

  -- Fattura importata: il pagato e lo stato arrivano dal gestionale esterno.
  -- L'incasso registrato in app viene spinto là da billing-payment-push e
  -- torna indietro col prossimo allineamento: qui non si tocca niente,
  -- altrimenti si sovrascrive il dato buono con una somma parziale.
  -- Da XML il gestionale non torna mai: si applica la sola differenza.
  IF v_esterna THEN
    IF v_provider = 'xml_import' THEN
      v_differenza := CASE TG_OP
        WHEN 'INSERT' THEN NEW.amount
        WHEN 'DELETE' THEN -OLD.amount
        ELSE NEW.amount - OLD.amount
      END;
      SELECT MAX(payment_date) INTO v_last_payment_date FROM public.invoice_payments WHERE invoice_id = v_invoice_id;
      UPDATE public.invoices SET
        paid_amount = GREATEST(0, COALESCE(paid_amount, 0) + v_differenza),
        payment_date = COALESCE(v_last_payment_date, payment_date),
        status = CASE
          WHEN status IN ('cancelled', 'credited', 'draft') THEN status
          WHEN COALESCE(paid_amount, 0) + v_differenza >= v_invoice_total - 0.01 THEN 'paid'
          WHEN status = 'paid' AND v_differenza < 0 THEN 'issued'
          ELSE status
        END,
        updated_at = now()
      WHERE id = v_invoice_id;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_total_paid, v_last_payment_date
    FROM public.invoice_payments
   WHERE invoice_id = v_invoice_id;

  UPDATE public.invoices
     SET paid_amount = v_total_paid,
         payment_date = v_last_payment_date,
         updated_at = now()
   WHERE id = v_invoice_id;

  IF v_total_paid >= v_invoice_total THEN
    UPDATE public.invoices SET status = 'paid'
     WHERE id = v_invoice_id AND status <> 'cancelled';
  ELSIF v_total_paid = 0 THEN
    UPDATE public.invoices SET status = 'issued'
     WHERE id = v_invoice_id AND status = 'paid';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- La rata di una fattura da XML pagata dallo scadenzario vale anche per la fattura.
-- Il resto della funzione è lungo e non cambia: si inserisce un blocco solo, e se il
-- testo atteso non c'è esattamente una volta la migrazione si ferma.
DO $migrazione$
DECLARE
  v_def text := pg_get_functiondef('public.mark_scadenza_paid_con_richiesta'::regproc);
  v_punto text := E'  RETURN json_build_object(\n    ''success'', true,\n    ''new_status'', v_new_status,';
BEGIN
  IF position('xml_import' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_punto, ''))) / length(v_punto) <> 1 THEN
    RAISE EXCEPTION 'mark_scadenza_paid_con_richiesta: punto di inserimento non trovato esattamente una volta';
  END IF;
  EXECUTE replace(v_def, v_punto,
    E'  IF v_scadenza.invoice_id IS NOT NULL AND v_scadenza.direction = ''entrata'' THEN\n'
    || E'    UPDATE invoices SET\n'
    || E'      paid_amount = COALESCE(paid_amount, 0) + p_amount,\n'
    || E'      payment_date = p_payment_date,\n'
    || E'      status = CASE WHEN status NOT IN (''cancelled'', ''credited'') AND COALESCE(paid_amount, 0) + p_amount >= total - 0.01 THEN ''paid'' ELSE status END,\n'
    || E'      updated_at = now()\n'
    || E'    WHERE id = v_scadenza.invoice_id AND external_provider = ''xml_import'';\n'
    || E'  END IF;\n\n'
    || v_punto);
END
$migrazione$;
